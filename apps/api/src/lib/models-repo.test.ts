import { beforeEach, describe, expect, it } from "vitest";
import {
  _insertMediaForTests,
  _insertModelForTests,
  _resetModelsRepoForTests,
  adminArchiveModel,
  adminCreateMedia,
  adminCreateModel,
  adminFindMediaById,
  adminFindModelByCode,
  adminFindModelById,
  adminListMedia,
  adminListModels,
  adminRestoreModel,
  adminUpdateMedia,
  adminUpdateModel,
  findActiveByCode,
  findActiveByIds,
  findCoverAndGalleryAssets,
  listActive,
  ModelsRepoConflictError,
  type ModelRecord,
} from "./models-repo";

type ModelInsert = Omit<ModelRecord, "id" | "created_at" | "updated_at">;

function makeModel(over: Partial<ModelInsert> = {}): ModelInsert {
  return {
    code: "M-2026-0001",
    nickname: "Aiko",
    status: "active",
    height_cm: 170,
    weight_kg: 52,
    bust: 84,
    waist: 60,
    hip: 88,
    shoe_size_eu: 38,
    age_range: "20-25",
    hometown: null,
    city: "Shanghai",
    style_tags: ["御姐"],
    available_types: ["写真"],
    can_remote: false,
    is_minor: false,
    cover_asset_id: null,
    gallery_asset_ids: [],
    portfolio: [],
    cooperation_history: [],
    ...over,
  };
}

beforeEach(() => _resetModelsRepoForTests());

describe("models-repo / findActiveByCode (三态)", () => {
  it("not_found → 'not_found'", async () => {
    expect(await findActiveByCode("M-9999-9999")).toBe("not_found");
  });

  it("active 模特 → ModelRecord", async () => {
    await _insertModelForTests(makeModel({ code: "M-2026-0010" }));
    const r = await findActiveByCode("M-2026-0010");
    expect(r).not.toBe("not_found");
    expect(r).not.toBe("archived");
    expect((r as ModelRecord).code).toBe("M-2026-0010");
  });

  it("archived 模特 → 'archived'", async () => {
    await _insertModelForTests(makeModel({ code: "M-2026-0020", status: "archived" }));
    expect(await findActiveByCode("M-2026-0020")).toBe("archived");
  });
});

describe("models-repo / clone-on-return", () => {
  it("调用方 mutate 不污染 store", async () => {
    await _insertModelForTests(makeModel({ code: "M-2026-0001", style_tags: ["御姐"] }));
    const r1 = (await findActiveByCode("M-2026-0001")) as ModelRecord;
    r1.style_tags.push("校园");
    r1.nickname = "Hacked";
    const r2 = (await findActiveByCode("M-2026-0001")) as ModelRecord;
    expect(r2.style_tags).toEqual(["御姐"]);
    expect(r2.nickname).toBe("Aiko");
  });
});

describe("models-repo / findActiveByIds", () => {
  it("按入参顺序，跳过 archived 和缺失", async () => {
    const a = await _insertModelForTests(makeModel({ code: "M-2026-0001" }));
    const b = await _insertModelForTests(makeModel({ code: "M-2026-0002", status: "archived" }));
    const c = await _insertModelForTests(makeModel({ code: "M-2026-0003" }));
    const res = await findActiveByIds([c.id, b.id, 9999, a.id]);
    expect(res.map((m) => m.code)).toEqual(["M-2026-0003", "M-2026-0001"]);
  });
});

describe("models-repo / listActive filter + pagination", () => {
  beforeEach(async () => {
    await _insertModelForTests(makeModel({ code: "M-2026-0001", nickname: "Aiko", style_tags: ["御姐"], available_types: ["写真"] }));
    await _insertModelForTests(makeModel({ code: "M-2026-0002", nickname: "Bei", style_tags: ["校园"], available_types: ["走秀"] }));
    await _insertModelForTests(makeModel({ code: "M-2026-0003", nickname: "Cici", style_tags: ["御姐", "成熟"], available_types: ["写真"] }));
    await _insertModelForTests(makeModel({ code: "M-2026-0004", nickname: "Dora", status: "archived", style_tags: ["御姐"], available_types: ["写真"] }));
  });

  it("无 filter → 仅 active", async () => {
    const { items, total } = await listActive({ page: 1, page_size: 50 });
    expect(total).toBe(3);
    expect(items.map((m) => m.code)).toEqual(["M-2026-0001", "M-2026-0002", "M-2026-0003"]);
  });

  it("style=御姐 filter", async () => {
    const { items, total } = await listActive({ page: 1, page_size: 50, style: "御姐" });
    expect(total).toBe(2);
    expect(items.map((m) => m.code)).toEqual(["M-2026-0001", "M-2026-0003"]);
  });

  it("type=走秀 filter", async () => {
    const { total, items } = await listActive({ page: 1, page_size: 50, type: "走秀" });
    expect(total).toBe(1);
    expect(items[0]!.code).toBe("M-2026-0002");
  });

  it("q nickname 模糊（大小写不敏感）", async () => {
    const { total, items } = await listActive({ page: 1, page_size: 50, q: "ai" });
    expect(total).toBe(1);
    expect(items[0]!.nickname).toBe("Aiko");
  });

  it("page=2 page_size=2 拿第二页 1 条", async () => {
    const { items, total } = await listActive({ page: 2, page_size: 2 });
    expect(total).toBe(3);
    expect(items).toHaveLength(1);
    expect(items[0]!.code).toBe("M-2026-0003");
  });
});

describe("models-repo / findCoverAndGalleryAssets", () => {
  it("拼 cover + gallery，越权 asset 不拼", async () => {
    const m = await _insertModelForTests(makeModel({ code: "M-2026-0001" }));
    const cover = await _insertMediaForTests({
      model_id: m.id,
      type: "image",
      url: "https://cdn/cover.jpg",
      thumb_url: "https://cdn/cover_thumb.jpg",
      width: 1200,
      height: 1600,
      has_watermark: true,
    });
    const g1 = await _insertMediaForTests({
      model_id: m.id,
      type: "image",
      url: "https://cdn/g1.jpg",
      thumb_url: null,
      width: 800,
      height: 1200,
      has_watermark: true,
    });
    // 另一个 model 的 asset：故意把它 id 塞进当前 model 的 gallery，
    // 验证 repo 拒绝跨模特拼图
    const m2 = await _insertModelForTests(makeModel({ code: "M-2026-0099" }));
    const foreign = await _insertMediaForTests({
      model_id: m2.id,
      type: "image",
      url: "https://cdn/foreign.jpg",
      thumb_url: null,
      width: 800,
      height: 1200,
      has_watermark: true,
    });
    // patch model 让它指向 cover + g1 + foreign
    await _insertModelForTests(
      makeModel({
        code: "M-2026-0100",
        cover_asset_id: cover.id,
        gallery_asset_ids: [g1.id, foreign.id],
      }),
    );
    const target = (await findActiveByCode("M-2026-0100")) as ModelRecord;
    const { cover: c, gallery } = await findCoverAndGalleryAssets(target);
    // cover 是 m.id 的 asset，target 是 m'.id（不同），所以 cover 应为 null（越权拒绝）
    expect(c).toBeNull();
    // gallery 中的 g1 也是 m.id 的，foreign 是 m2.id 的 → 都不属于 target → 空
    expect(gallery).toHaveLength(0);
  });

  it("同 model 的 cover/gallery 正确返回（含 thumb 兜底 srcset）", async () => {
    const m = await _insertModelForTests(makeModel({ code: "M-2026-0001" }));
    const cover = await _insertMediaForTests({
      model_id: m.id,
      type: "image",
      url: "https://cdn/cover.jpg",
      thumb_url: null,
      width: 1200,
      height: 1600,
      has_watermark: true,
    });
    await _insertModelForTests(
      makeModel({ code: "M-2026-0002", cover_asset_id: cover.id, gallery_asset_ids: [] }),
    );
    const target = (await findActiveByCode("M-2026-0002")) as ModelRecord;
    // 重新覆盖 m.cover_asset_id：target 是 M-2026-0002，cover 属于 m（M-2026-0001）→ 跨模特
    // 改用：cover.model_id 改成 null（通用素材），就应允许
    await _insertMediaForTests({
      id: 999,
      model_id: null,
      type: "image",
      url: "https://cdn/shared.jpg",
      thumb_url: null,
      width: 1200,
      height: 1600,
      has_watermark: false,
    });
    const fakeTarget: ModelRecord = { ...target, cover_asset_id: 999, gallery_asset_ids: [] };
    const { cover: c } = await findCoverAndGalleryAssets(fakeTarget);
    expect(c).not.toBeNull();
    expect(c!.src).toBe("https://cdn/shared.jpg");
    expect(c!.srcset["1x"]).toBe("https://cdn/shared.jpg");
    expect(c!.width).toBe(1200);
  });
});

describe("models-repo / reset", () => {
  it("_resetModelsRepoForTests 清空所有", async () => {
    await _insertModelForTests(makeModel({ code: "M-2026-0001" }));
    _resetModelsRepoForTests();
    expect(await findActiveByCode("M-2026-0001")).toBe("not_found");
  });
});

// ─── 管理视角 ──────────────────────────────────────────────

describe("models-repo / admin write paths", () => {
  it("adminCreateModel 落 real_name_enc，公开 cloneModel 不带", async () => {
    const enc = new Uint8Array([1, 2, 3, 4]);
    const created = await adminCreateModel({
      code: "M-2026-0501",
      nickname: "Eve",
      real_name_enc: enc,
    });
    expect(created.real_name_enc).toEqual(enc);
    // 公开视角不该带 real_name_enc
    const pub = await findActiveByCode("M-2026-0501");
    expect(pub).not.toBe("not_found");
    expect((pub as ModelRecord & { real_name_enc?: unknown }).real_name_enc).toBeUndefined();
  });

  it("adminCreateModel code 重复 → ModelsRepoConflictError", async () => {
    await adminCreateModel({ code: "M-2026-0510", nickname: "F" });
    await expect(
      adminCreateModel({ code: "M-2026-0510", nickname: "F2" }),
    ).rejects.toBeInstanceOf(ModelsRepoConflictError);
  });

  it("adminFindModelById 含 archived（与公开三态不同）", async () => {
    const m = await adminCreateModel({ code: "M-2026-0520", nickname: "G" });
    await adminArchiveModel(m.id);
    const found = await adminFindModelById(m.id);
    expect(found).toBeDefined();
    expect(found!.status).toBe("archived");
    // 公开端则拒绝
    expect(await findActiveByCode("M-2026-0520")).toBe("archived");
  });

  it("adminUpdateModel 部分字段 patch 不动其他字段", async () => {
    const m = await adminCreateModel({
      code: "M-2026-0530",
      nickname: "H",
      style_tags: ["御姐"],
    });
    const patched = await adminUpdateModel(m.id, { nickname: "Hello" });
    expect(patched!.nickname).toBe("Hello");
    expect(patched!.style_tags).toEqual(["御姐"]);
    // mutate caller-returned 不污染 store
    patched!.style_tags.push("校园");
    const reread = await adminFindModelByCode("M-2026-0530");
    expect(reread!.style_tags).toEqual(["御姐"]);
  });

  it("adminArchiveModel + adminRestoreModel 状态翻转", async () => {
    const m = await adminCreateModel({ code: "M-2026-0540", nickname: "I" });
    expect((await adminArchiveModel(m.id))!.status).toBe("archived");
    expect((await adminRestoreModel(m.id))!.status).toBe("active");
  });

  it("adminListModels 按 status filter / 含 archived 选项", async () => {
    await adminCreateModel({ code: "M-2026-0601", nickname: "A1" });
    const x = await adminCreateModel({ code: "M-2026-0602", nickname: "A2" });
    await adminArchiveModel(x.id);
    const all = await adminListModels({ page: 1, page_size: 50 });
    expect(all.total).toBe(2);
    const archivedOnly = await adminListModels({ status: "archived", page: 1, page_size: 50 });
    expect(archivedOnly.total).toBe(1);
    expect(archivedOnly.items[0]!.code).toBe("M-2026-0602");
  });

  it("adminCreateMedia hash 冲突 → ModelsRepoConflictError", async () => {
    await adminCreateMedia({
      model_id: null,
      type: "image",
      url: "https://cdn/a.jpg",
      original_url: "https://r2/a.jpg",
      thumb_url: null,
      width: 100,
      height: 100,
      file_size: 1000,
      hash: "deadbeef",
      has_watermark: false,
      uploaded_by: 1,
    });
    await expect(
      adminCreateMedia({
        model_id: null,
        type: "image",
        url: "https://cdn/b.jpg",
        original_url: "https://r2/b.jpg",
        thumb_url: null,
        width: 100,
        height: 100,
        file_size: 1000,
        hash: "deadbeef",
        has_watermark: false,
        uploaded_by: 1,
      }),
    ).rejects.toBeInstanceOf(ModelsRepoConflictError);
  });

  it("adminUpdateMedia is_cover=true 同步 model.cover_asset_id", async () => {
    const m = await adminCreateModel({ code: "M-2026-0701", nickname: "C" });
    expect(m.cover_asset_id).toBeNull();
    const media = await adminCreateMedia({
      model_id: m.id,
      type: "image",
      url: "https://cdn/c.jpg",
      original_url: "https://r2/c.jpg",
      thumb_url: null,
      width: 100,
      height: 100,
      file_size: 1000,
      hash: "h-cover",
      has_watermark: false,
      uploaded_by: 1,
    });
    await adminUpdateMedia(media.id, { is_cover: true });
    const re = await adminFindModelById(m.id);
    expect(re!.cover_asset_id).toBe(media.id);
    // 再 is_cover=false 取消
    await adminUpdateMedia(media.id, { is_cover: false });
    const re2 = await adminFindModelById(m.id);
    expect(re2!.cover_asset_id).toBeNull();
  });

  it("adminListMedia model_id filter + type filter", async () => {
    const m = await adminCreateModel({ code: "M-2026-0801", nickname: "L" });
    await adminCreateMedia({
      model_id: m.id, type: "image", url: "u1", original_url: "o1",
      thumb_url: null, width: 1, height: 1, file_size: 1, hash: "h1",
      has_watermark: false, uploaded_by: 1,
    });
    await adminCreateMedia({
      model_id: m.id, type: "video", url: "u2", original_url: "o2",
      thumb_url: null, width: 1, height: 1, file_size: 1, hash: "h2",
      has_watermark: false, uploaded_by: 1,
    });
    await adminCreateMedia({
      model_id: null, type: "image", url: "u3", original_url: "o3",
      thumb_url: null, width: 1, height: 1, file_size: 1, hash: "h3",
      has_watermark: false, uploaded_by: 1,
    });
    const byModel = await adminListMedia({ model_id: m.id, page: 1, page_size: 10 });
    expect(byModel.total).toBe(2);
    const byType = await adminListMedia({ type: "video", page: 1, page_size: 10 });
    expect(byType.total).toBe(1);
    expect(byType.items[0]!.url).toBe("u2");
  });

  it("adminFindMediaById 含 original_url + uploaded_by 全字段", async () => {
    const created = await adminCreateMedia({
      model_id: null, type: "image", url: "u", original_url: "ORIG",
      thumb_url: null, width: 1, height: 1, file_size: 999, hash: "x",
      has_watermark: false, uploaded_by: 42,
    });
    const got = await adminFindMediaById(created.id);
    expect(got!.original_url).toBe("ORIG");
    expect(got!.uploaded_by).toBe(42);
    expect(got!.file_size).toBe(999);
  });
});
