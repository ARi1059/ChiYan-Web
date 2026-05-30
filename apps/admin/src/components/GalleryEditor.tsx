/**
 * 桌面端模特画廊编辑器：管 cover_asset_id 单图 + gallery_asset_ids 多图。
 *
 * 与父级 ModelEditDrawer 的关系：
 *  - 表单值 (cover_asset_id, gallery_asset_ids) 完全由 props 受控
 *  - 上传/删除/设为封面 — 本组件内执行 fetch；成功后 onChange 把新表单值抛回
 *  - assetIndex 维护 id → AdminMediaSummary 的缓存，避免反复跑 listAdminMedia
 *
 * 上传：
 *  - 多选 + 拖放都接住；并发上传走 Promise.all(files.map(uploadMedia))，单个失败
 *    不阻塞其它；最后把成功 id 一次性 push 进 gallery_asset_ids
 *  - 上传中以一个透明 overlay + 进度文案表达，按钮置灰
 *
 * 设为封面 / 取消封面：
 *  - 设为封面：PATCH /admin/media/:id is_cover=true（server 同事务把 model.cover_asset_id 指过来）
 *    然后本地立即把 cover_asset_id 切到该项
 *  - 取消封面：再次点同一缩略 → PATCH is_cover=false；server 端若 cover 正是它会清零
 *
 * 删除：
 *  - DELETE /admin/media/:id；本地从 gallery_asset_ids 移除；若被删的恰是 cover_asset_id
 *    则也清空（server 的 model.cover_asset_id 会被同事务清掉）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Trash2, Star, StarOff, ImageOff } from "lucide-react";
import {
  AdminApiError,
  deleteAdminMedia,
  listAdminMedia,
  patchAdminMedia,
  uploadMedia,
  type AdminMediaSummary,
} from "@chiyan/api-client";

interface Props {
  /** 编辑时存在；新建时 undefined —— 新建模特还没 model_id，画廊得在保存后再编。 */
  modelId: number | undefined;
  coverAssetId: number | undefined;
  galleryAssetIds: number[];
  accessToken: string;
  onChange: (next: { coverAssetId: number | undefined; galleryAssetIds: number[] }) => void;
  onError: (message: string) => void;
  /** 上传完成后给父级一个机会刷新 UI（比如重读列表）。可选。 */
  onUploaded?: (asset: AdminMediaSummary) => void;
}

export function GalleryEditor({
  modelId,
  coverAssetId,
  galleryAssetIds,
  accessToken,
  onChange,
  onError,
  onUploaded,
}: Props) {
  // id → 媒体 metadata。包含 cover + gallery，列表外的不存。
  const [assetIndex, setAssetIndex] = useState<Map<number, AdminMediaSummary>>(new Map());
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busyAssetId, setBusyAssetId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const allIds = useMemo(() => {
    const set = new Set<number>(galleryAssetIds);
    if (coverAssetId !== undefined) set.add(coverAssetId);
    return Array.from(set);
  }, [coverAssetId, galleryAssetIds]);

  // 拉一次列表把 id → metadata 填进 assetIndex。
  // 触发：drawer 挂载时 modelId 已确定就拉，不依赖 allIds 是否有内容 ——
  //   挂载瞬间父级 form 还是 EMPTY，props galleryAssetIds=[]/cover=undefined；
  //   等父级 useEffect 把 initial 灌进 form 后 props 才到位。若按 allIds 提前 return
  //   就永远拉不上来。
  useEffect(() => {
    if (modelId === undefined) {
      setAssetIndex(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    listAdminMedia({ model_id: modelId, page: 1, page_size: 100 }, accessToken)
      .then((res) => {
        if (cancelled) return;
        setAssetIndex(new Map(res.items.map((a) => [a.id, a])));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        onError(e instanceof AdminApiError ? e.message : "加载画廊失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, accessToken]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (arr.length === 0) return;
      if (modelId === undefined) {
        onError("请先保存模特基本信息，再上传画廊");
        return;
      }
      setUploading(true);
      try {
        const settled = await Promise.allSettled(
          arr.map((f) => uploadMedia(f, accessToken, { modelId, type: "image" })),
        );
        const newIds: number[] = [];
        const newAssets: AdminMediaSummary[] = [];
        for (const r of settled) {
          if (r.status === "fulfilled") {
            newIds.push(r.value.media_asset_id);
            // 立刻 minimal-cast 进缓存（width/height 都已带，url 也有）；
            // 完整字段会在下一次 listAdminMedia 回填。
            newAssets.push({
              id: r.value.media_asset_id,
              model_id: modelId,
              type: "image",
              url: r.value.url,
              original_url: null,
              thumb_url: null,
              width: r.value.width,
              height: r.value.height,
              file_size: 0,
              hash: "",
              has_watermark: false,
              is_cover: false,
              uploaded_by: 0,
              uploaded_at: new Date().toISOString(),
            });
          } else {
            const e = r.reason as unknown;
            onError(e instanceof AdminApiError ? e.message : "部分文件上传失败");
          }
        }
        if (newIds.length === 0) return;
        setAssetIndex((prev) => {
          const next = new Map(prev);
          for (const a of newAssets) next.set(a.id, a);
          return next;
        });
        onChange({
          coverAssetId,
          galleryAssetIds: [...galleryAssetIds, ...newIds],
        });
        for (const a of newAssets) onUploaded?.(a);
      } finally {
        setUploading(false);
      }
    },
    [accessToken, coverAssetId, galleryAssetIds, modelId, onChange, onError, onUploaded],
  );

  const onPickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      await handleFiles(files);
      // 复位 input 以便同一文件可重复选
      e.target.value = "";
    },
    [handleFiles],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (uploading) return;
      const files = e.dataTransfer?.files;
      if (files) await handleFiles(files);
    },
    [handleFiles, uploading],
  );

  const onToggleCover = useCallback(
    async (id: number) => {
      const isCurrent = coverAssetId === id;
      setBusyAssetId(id);
      try {
        const next = await patchAdminMedia(id, { is_cover: !isCurrent }, accessToken);
        setAssetIndex((prev) => {
          const out = new Map(prev);
          out.set(id, next);
          return out;
        });
        onChange({
          coverAssetId: isCurrent ? undefined : id,
          galleryAssetIds,
        });
      } catch (e: unknown) {
        onError(e instanceof AdminApiError ? e.message : "封面操作失败");
      } finally {
        setBusyAssetId(null);
      }
    },
    [accessToken, coverAssetId, galleryAssetIds, onChange, onError],
  );

  const onDelete = useCallback(
    async (id: number) => {
      if (!window.confirm("确定删除这张图？此操作不可撤销。")) return;
      setBusyAssetId(id);
      try {
        await deleteAdminMedia(id, accessToken);
        setAssetIndex((prev) => {
          const out = new Map(prev);
          out.delete(id);
          return out;
        });
        onChange({
          coverAssetId: coverAssetId === id ? undefined : coverAssetId,
          galleryAssetIds: galleryAssetIds.filter((g) => g !== id),
        });
      } catch (e: unknown) {
        onError(e instanceof AdminApiError ? e.message : "删除失败");
      } finally {
        setBusyAssetId(null);
      }
    },
    [accessToken, coverAssetId, galleryAssetIds, onChange, onError],
  );

  const tiles: { id: number; asset?: AdminMediaSummary }[] = useMemo(() => {
    const seen = new Set<number>();
    const out: { id: number; asset?: AdminMediaSummary }[] = [];
    if (coverAssetId !== undefined) {
      out.push({ id: coverAssetId, asset: assetIndex.get(coverAssetId) });
      seen.add(coverAssetId);
    }
    for (const gid of galleryAssetIds) {
      if (seen.has(gid)) continue;
      out.push({ id: gid, asset: assetIndex.get(gid) });
      seen.add(gid);
    }
    return out;
  }, [assetIndex, coverAssetId, galleryAssetIds]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">画廊</div>
        <div className="text-xs text-[var(--muted)]">
          {tiles.length} 张 · 首张为封面
        </div>
      </div>

      {modelId === undefined && (
        <div className="rounded-md border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
          新模特先保存基本信息，再回来上传画廊。
        </div>
      )}

      <div
        className={[
          "grid grid-cols-3 gap-2 rounded-md border-2 border-dashed p-2 transition-colors",
          dragOver
            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
            : "border-[var(--border)]",
          modelId === undefined ? "opacity-50 pointer-events-none" : "",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {tiles.length === 0 && (
          <div className="col-span-3 py-6 text-center text-xs text-[var(--muted)]">
            拖入图片到这里，或点下方"上传"按钮
          </div>
        )}
        {tiles.map(({ id, asset }) => {
          const isCover = coverAssetId === id;
          const busy = busyAssetId === id;
          return (
            <div
              key={id}
              className={[
                "group relative aspect-[3/4] overflow-hidden rounded-md border bg-[var(--bg)]",
                isCover
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                  : "border-[var(--border)]",
              ].join(" ")}
            >
              {asset?.url ? (
                <img
                  src={asset.thumb_url ?? asset.url}
                  alt={`asset-${id}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
                  {loading ? "加载中…" : <ImageOff size={20} />}
                </div>
              )}
              {isCover && (
                <div className="absolute left-1 top-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  封面
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-between gap-1 bg-black/60 px-1.5 py-1 text-white transition-transform group-hover:translate-y-0">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-white/10 disabled:opacity-50"
                  onClick={() => onToggleCover(id)}
                  disabled={busy}
                  title={isCover ? "取消封面" : "设为封面"}
                >
                  {isCover ? <StarOff size={12} /> : <Star size={12} />}
                  {isCover ? "取消" : "封面"}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-[var(--danger)]/30 disabled:opacity-50"
                  onClick={() => onDelete(id)}
                  disabled={busy}
                  title="删除"
                >
                  <Trash2 size={12} />
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
        <button
          type="button"
          onClick={onPickFiles}
          disabled={uploading || modelId === undefined}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm hover:bg-[var(--bg)] disabled:opacity-50"
        >
          <Upload size={14} />
          {uploading ? "上传中…" : "上传图片"}
        </button>
      </div>
    </div>
  );
}
