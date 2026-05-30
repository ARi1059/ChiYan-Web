/**
 * URL query `?m=<code>` 驱动的模特详情打开/关闭。
 *
 * 与设计偏离：开发计划 §四 Phase 2 写的是 `/m/:code` 独立 path。改用 query 的理由：
 *  - 分享 URL 同时携带 tab 上下文（"/today?m=M-2026-0125" 含义清晰）
 *  - 详情关闭直接回原 tab，无需路由父子关系
 *  - 单一全局 sheet 实例，避免 4 个 page 各装一份
 *
 * 实现要点（设计审稿坑点）：
 *  - 不依赖 useSearchParams setter 引用稳定性；用 useNavigate + 自构 URL
 *  - 同 tab 内 A→B→C 切换模特走 replace，避免历史栈污染
 *  - 关闭/首次打开走 push，让系统返回键能直接关 sheet 回 tab
 *  - 深链 /today?m=XXX 进来时 models 可能还在拉 → model 返回 null 但 code 不为空，
 *    sheet 可显示 spinner 占位（由 ModelDetailSheetRoute 负责）
 */
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../store/AppContext";
import type { Model } from "../data/models";

export interface UseSelectedModelResult {
  /** 当前选中的 model；找到为对象，code 在 url 但 models 还没拉到为 null。 */
  model: Model | null;
  /** url 上 ?m= 的原始值；用于判断"目标存在但数据未到"。 */
  code: string | null;
  open: (code: string) => void;
  close: () => void;
}

export function useSelectedModel(): UseSelectedModelResult {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { models } = useApp();

  const code = params.get("m");
  const model = useMemo(() => {
    if (!code) return null;
    return models.find((m) => m.code === code || m.id === code) ?? null;
  }, [code, models]);

  const open = useCallback(
    (next: string) => {
      // 同 tab 内已经在看模特 → replace 不堆历史；首次打开 → push 让返回键能关
      const isReplacing = Boolean(code) && code !== next;
      const search = `?m=${encodeURIComponent(next)}`;
      navigate({ pathname: location.pathname, search }, { replace: isReplacing });
    },
    [navigate, location.pathname, code],
  );

  const close = useCallback(() => {
    navigate({ pathname: location.pathname, search: "" });
  }, [navigate, location.pathname]);

  return { model, code, open, close };
}
