import { describe, expect, it } from "vitest";
import { refreshCookieName, generateCsrfToken } from "./cookie";

describe("cookie helpers", () => {
  it("uses __Host- prefix in staging/prod, plain name in dev", () => {
    expect(refreshCookieName({ ENV: "dev" } as never)).toBe("chiyan_refresh");
    expect(refreshCookieName({ ENV: "staging" } as never)).toBe("__Host-chiyan_refresh");
    expect(refreshCookieName({ ENV: "production" } as never)).toBe("__Host-chiyan_refresh");
  });

  it("generates 32-byte base64url csrf token (43 chars, url-safe)", () => {
    const t = generateCsrfToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const t2 = generateCsrfToken();
    expect(t).not.toBe(t2);
  });
});
