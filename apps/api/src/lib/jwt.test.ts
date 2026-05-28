import { describe, expect, it } from "vitest";
import { signJwt, verifyJwt } from "./jwt";

const SECRET = "test-secret-32bytes-min-length-padding";

describe("JWT HS256 sign/verify", () => {
  it("round-trips claims through sign + verify", async () => {
    const token = await signJwt({ sub: "admin:7", jti: "j-1", kind: "access", ttlSec: 60 }, SECRET);
    const claims = await verifyJwt<{ sub: string }>(token, SECRET, "access");
    expect(claims.sub).toBe("admin:7");
    expect(claims.jti).toBe("j-1");
    expect(claims.kind).toBe("access");
    expect(claims.exp - claims.iat).toBe(60);
  });

  it("rejects expired token", async () => {
    const token = await signJwt(
      { sub: "admin:1", jti: "j-2", kind: "access", ttlSec: -10 },
      SECRET,
    );
    await expect(verifyJwt(token, SECRET, "access")).rejects.toBeDefined();
  });

  it("rejects signature with a different secret", async () => {
    const token = await signJwt({ sub: "admin:1", jti: "j-3", kind: "access", ttlSec: 60 }, SECRET);
    await expect(
      verifyJwt(token, "wrong-secret-32bytes-padding-needed", "access"),
    ).rejects.toBeDefined();
  });

  it("rejects when kind does not match expected", async () => {
    const token = await signJwt(
      { sub: "admin:1", jti: "j-4", kind: "refresh", ttlSec: 60 },
      SECRET,
    );
    await expect(verifyJwt(token, SECRET, "access")).rejects.toThrow(/expected kind=access/);
  });

  it("carries arbitrary extra claims", async () => {
    const token = await signJwt(
      {
        sub: "admin:9",
        jti: "j-5",
        kind: "totp_challenge",
        ttlSec: 300,
        challenge_admin_id: 9,
      },
      SECRET,
    );
    const claims = await verifyJwt<{ challenge_admin_id: number }>(token, SECRET, "totp_challenge");
    expect(claims.challenge_admin_id).toBe(9);
  });
});
