/**
 * 敏感字段过滤。
 *
 * 给 logger / 审计 payload 共用，保证：
 * - 明文密码 / TOTP secret / 一次性密码 / 各种 token 等永远不离开内存进日志
 *
 * 规则：
 * - 命中 KEYS 集合的 key（无论嵌套深度）→ 值替换成 '***'
 * - 数组递归处理
 * - 循环引用用 WeakSet 兜底
 * - 字符串值直接当 leaf，不解析内嵌 JSON（误判太多）
 *
 * 这是 deny-list 不是 allow-list：写新功能时若出现新敏感字段名，**在这里补**。
 */

const SENSITIVE_KEYS = new Set<string>([
  // 密码相关
  "password",
  "new_password",
  "old_password",
  "current_password",
  "one_time_password",
  "password_hash",
  // TOTP 相关
  "secret",
  "totp_secret",
  "totp_secret_enc",
  "code",
  "totp_code",
  // 各种 token
  "access_token",
  "refresh_token",
  "challenge_token",
  "csrf_token",
  "authorization",
  // PII
  "real_name",
  "real_name_enc",
]);

const MASK = "***";

export function sanitize<T>(value: T): T {
  return walk(value, new WeakSet()) as T;
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => walk(v, seen));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? MASK : walk(v, seen);
  }
  return out;
}
