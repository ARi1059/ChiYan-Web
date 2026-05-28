/**
 * 从 env 构建 AES KeyRing：version 1 用 ENC_KEY_V1，2 用 ENC_KEY_V2（轮换时）。
 *
 * env 里是 base64 字符串。解码失败/长度不对 → throw（启动期错，越早暴露越好）。
 */
import type { Env } from "../env";
import type { KeyRing } from "./crypto";

function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cache: { v1: string; v2: string; ring: KeyRing } | null = null;

export function keyRingFromEnv(env: Env): KeyRing {
  const v1 = env.ENC_KEY_V1;
  const v2 = env.ENC_KEY_V2 ?? "";
  if (cache && cache.v1 === v1 && cache.v2 === v2) return cache.ring;

  if (!v1) throw new Error("ENC_KEY_V1 missing");
  const ring: KeyRing = { 1: decodeBase64(v1) };
  if (ring[1]!.byteLength !== 32) throw new Error("ENC_KEY_V1 must decode to 32 bytes");
  if (v2) {
    ring[2] = decodeBase64(v2);
    if (ring[2]!.byteLength !== 32) throw new Error("ENC_KEY_V2 must decode to 32 bytes");
  }

  cache = { v1, v2, ring };
  return ring;
}

/** 当前用于加密的 version（默认 V2 优先，没有就回落 V1）。 */
export function currentEncVersion(env: Env): number {
  return env.ENC_KEY_V2 ? 2 : 1;
}

export function _resetKeyRingCacheForTests(): void {
  cache = null;
}
