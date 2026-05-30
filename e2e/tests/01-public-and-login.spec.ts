/**
 * 场景一：公开浏览 → 五连击 → PIN → 账密 → TOTP → admin 解锁。
 *
 * 覆盖：
 *  - mount 后 fetchPublicSnapshot 跑通（API 起来、CORS、envelope 解析）
 *  - 五连击触发 AdminPanel
 *  - PIN 默认 8888（DEFAULT_SETTINGS）
 *  - /auth/login → challenge_token → /auth/login/totp → access_token
 *  - bootstrap 路径（totp_enrolled=false）任何 6 位 code 都过
 *  - AppContext 切到 admin snapshot（登录后 RosterTab 入口可见）
 */
import { test, expect } from "@playwright/test";
import { currentTotpCode } from "../totp-secret";

test("公开浏览 → PIN → 账密 + TOTP → admin 面板就绪", async ({ page }) => {
  await page.goto("/");

  // 首页加载：seed 之后 mock repos 还没有 settings 真值 —— 用 DEFAULT_SETTINGS 兜底
  // (api-client fetchPublicSnapshot 拉到的 studio-info 也是 mock DEFAULTS 见 studio-info-repo.ts:43)
  await expect(page.getByRole("heading", { name: /ChiYan Studio|赤颜/ })).toBeVisible();

  // 五连击品牌名进 admin
  const brand = page.getByRole("heading", { name: /ChiYan Studio|赤颜/ });
  for (let i = 0; i < 5; i++) {
    await brand.click({ delay: 50 });
  }

  // PIN 屏幕：连点 8、8、8、8（DEFAULT_SETTINGS.adminPin = "8888"）
  // "管理后台" 文案在 AdminPanel 顶栏 + PinScreen 标题各出现一次，只看 PinScreen 独有的提示
  await expect(page.getByText("请输入管理密码")).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "8", exact: true }).click();
  }

  // LoginScreen：输入用户名/密码（seed 在 dev-with-seed.ts）
  await expect(page.getByText("管理员登录")).toBeVisible();
  await page.getByPlaceholder("账号").fill("owner");
  await page.getByPlaceholder("密码").fill("ChiYan-Test-Password-1!");
  await page.getByRole("button", { name: "下一步" }).click();

  // TOTP：bootstrap 状态任何 6 位 code 都过
  await expect(page.getByText("两步验证")).toBeVisible();
  await page.getByPlaceholder("000000").fill(currentTotpCode());
  await page.getByRole("button", { name: "登录" }).click();

  // ready 状态：三个 tab 可见（名单 / 模特 / 设置）
  await expect(page.getByRole("button", { name: "名单", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "模特", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "设置", exact: true })).toBeVisible();
});
