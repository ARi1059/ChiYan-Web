/**
 * 全局模特详情 sheet 的路由门面。
 *
 * 单一实例挂在 Layout 根下，所有 page 共用；从 useSelectedModel 读 url ?m= 渲染。
 *
 * 深链场景：URL 已带 ?m=XXX 但 AppContext 还在拉数据，model 暂时为 null —— 此时不渲染 sheet
 * （等数据到位后会重新触发渲染）。这样避免显示半成品；考虑到 H5 始终有 DEFAULT_MODELS 兜底，
 * 实际窗口很短（几百毫秒）。
 */
import { ModelDetailSheet } from "./ModelDetailSheet";
import { useSelectedModel } from "../lib/use-selected-model";

export function ModelDetailSheetRoute() {
  const { model, close } = useSelectedModel();
  return <ModelDetailSheet model={model} onClose={close} />;
}
