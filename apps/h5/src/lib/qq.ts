/**
 * QQ 接单链路 helper：UA 检测 + 多 scheme 唤起 + 话术拼接 + 滑窗限流。
 *
 * 关键约束（设计审稿）：
 *  1. 剪贴板必须在 user gesture 内同步触发，**不能** await 后再写 ——
 *     否则 iOS Safari SecurityError 静默拒绝。先 writeText，再 a.click() 唤起 scheme。
 *  2. 不做 iframe + setTimeout 检测 scheme 成功失败（iOS 16+ 已无效），
 *     直接用 <a href=scheme>.click() 唤起；UI 文案告诉用户"如果没自动打开请粘贴 QQ 号"。
 *  3. 微信内置浏览器（UA 含 MicroMessenger）→ 调用方显示引导卡，本 helper 不触发 scheme。
 *  4. 滑窗限流用 sessionStorage（会话级），避免设备级 localStorage 让老用户卡死。
 *
 * scheme 来源：docs/模特资料与当日通告接单-H5设计方案.md §八.5
 */

export type QQContext = "wechat" | "qq" | "ios" | "android" | "pc";

export function detectQQContext(ua?: string): QQContext {
  const u = (ua ?? (typeof navigator === "undefined" ? "" : navigator.userAgent)).toLowerCase();
  if (u.includes("micromessenger")) return "wechat";
  if (u.includes("qq/") || u.includes(" qq ") || u.includes("mqqbrowser")) return "qq";
  if (/iphone|ipad|ipod/.test(u)) return "ios";
  if (u.includes("android")) return "android";
  return "pc";
}

export interface OrderMessageOpts {
  alias: string;
  code?: string;
  /** 默认"今日"。 */
  date?: string;
  agencyQQ: string;
}

/**
 * 接单话术。模板：
 *   您好，咨询当日通告模特：晓薇（编号 M-2026-0125），档期：今日。
 *   工作室 QQ：888888888
 *
 * 不暴露：真实姓名、三围、电话等敏感字段（仅化名 + code）。
 */
export function buildOrderMessage(opts: OrderMessageOpts): string {
  const code = opts.code ? `（编号 ${opts.code}）` : "";
  const date = opts.date ?? "今日";
  return [
    `您好，咨询当日通告模特：${opts.alias}${code}，档期：${date}。`,
    `工作室 QQ：${opts.agencyQQ}`,
  ].join("\n");
}

/**
 * 仅拼联系话术（无具体模特，给 ContactSection 用）。
 */
export function buildContactMessage(agencyName: string, agencyQQ: string): string {
  return [
    `您好，咨询${agencyName}当日通告。`,
    `工作室 QQ：${agencyQQ}`,
  ].join("\n");
}

export interface ContactQQResult {
  copied: boolean;
  schemeUsed: "mqq" | "mqqwpa" | "wpa" | "none";
  context: QQContext;
}

function schemeFor(qq: string, ctx: QQContext): { href: string; key: "mqq" | "mqqwpa" | "wpa" | "none"; target?: string } {
  switch (ctx) {
    case "ios":
    case "qq":
      return { href: `mqq://im/chat?chat_type=wpa&uin=${qq}&version=1`, key: "mqq" };
    case "android":
      return { href: `mqqwpa://im/chat?chat_type=wpa&uin=${qq}`, key: "mqqwpa" };
    case "pc":
      return {
        href: `https://wpa.qq.com/msgrd?v=3&uin=${qq}&site=qq&menu=yes`,
        key: "wpa",
        target: "_blank",
      };
    case "wechat":
      return { href: "", key: "none" };
  }
}

/**
 * 同步 user gesture 内：先写剪贴板，再 a.click()。
 * 返回结果由调用方做 toast 提示；微信浏览器返回 schemeUsed='none'，调用方应显示引导卡。
 *
 * **必须在 onClick 同步路径里调用，不能塞进 await/then 之后。**
 */
export function copyAndContactQQ(qq: string, message: string): ContactQQResult {
  const context = detectQQContext();
  let copied = false;
  // 1. 先写剪贴板（同步触发；clipboard API 是 Promise，但 fire-and-forget 即可，
  //    user gesture 已经在调用栈里）
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      // 不 await：clipboard.writeText 返回 Promise，但 user gesture 在此刻已被消费。
      void navigator.clipboard.writeText(message);
      copied = true;
    }
  } catch {
    copied = false;
  }

  // 2. 微信内置浏览器 → 不触发 scheme，让调用方显示引导卡
  if (context === "wechat") {
    return { copied, schemeUsed: "none", context };
  }

  // 3. 唤起 scheme（用 a.click() 而非 location.href，避免 toast 被立即页面卸载吃掉）
  const { href, key, target } = schemeFor(qq, context);
  if (key !== "none") {
    const a = document.createElement("a");
    a.href = href;
    if (target) a.target = target;
    a.rel = "noopener noreferrer";
    // 不挂到 DOM —— 直接 click 即可在大多浏览器触发跳转
    a.click();
  }
  return { copied, schemeUsed: key, context };
}

// ─── 滑窗限流（sessionStorage）─────────────────────────────────────

const RATE_LIMIT_KEY = "cy_qq_rate";
const WINDOW_MS = 60_000;
const MAX_CALLS = 5;

interface RateState {
  timestamps: number[];
}

function loadRateState(): RateState {
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return { timestamps: [] };
    return JSON.parse(raw) as RateState;
  } catch {
    return { timestamps: [] };
  }
}

function saveRateState(s: RateState): void {
  try {
    sessionStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(s));
  } catch {
    // 无 sessionStorage 权限（隐私模式部分场景）→ 放行
  }
}

export interface RateCheck {
  allowed: boolean;
  /** 剩余冷却时间（ms）；超限时返回直到最早一次记录过期的时间。 */
  remainingMs?: number;
}

/**
 * 检查是否在 60s/5 次窗口内；超限返回 allowed=false + remainingMs。
 * 允许时同时记录本次时间戳。
 */
export function checkRateLimit(now = Date.now()): RateCheck {
  const s = loadRateState();
  const recent = s.timestamps.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) {
    const oldest = recent[0]!;
    return { allowed: false, remainingMs: WINDOW_MS - (now - oldest) };
  }
  recent.push(now);
  saveRateState({ timestamps: recent });
  return { allowed: true };
}
