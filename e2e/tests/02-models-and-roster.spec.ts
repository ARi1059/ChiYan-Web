/**
 * 场景二：登录后完整 admin 闭环。
 *
 * 覆盖：
 *  - 进入 ModelsTab → 新增模特表单
 *  - setInputFiles 选小 JPEG（内联 buffer）→ uploadMedia 三步链路（sign + PUT + register）
 *  - upload_url 是 http://localhost:3000/api/v1/admin/media/upload 绝对地址
 *    admin-client 把它剥成相对路径走 vite proxy；vite proxy 把 PUT body 透传到 :3000
 *  - 创建模特 POST /admin/models 带 cover_asset_id
 *  - AppContext addModel 回填 apiId+code 到本地
 *  - 进 RosterTab → 勾选 → 保存 PUT /admin/roster
 *  - 全程 Bearer + X-CSRF-Token + credentials: include 通顺
 */
import { test, expect } from "@playwright/test";
import { currentTotpCode } from "../totp-secret";

// 最小合法 JPEG（SOI + APP0 + minimum data + EOI），约 125B
const JPEG_MIN = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xd9,
]);

async function loginAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/");
  const brand = page.getByRole("heading", { name: /ChiYan Studio|赤颜/ });
  for (let i = 0; i < 5; i++) await brand.click({ delay: 50 });
  await expect(page.getByText("请输入管理密码")).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "8", exact: true }).click();
  }
  await page.getByPlaceholder("账号").fill("owner");
  await page.getByPlaceholder("密码").fill("ChiYan-Test-Password-1!");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByPlaceholder("000000").fill(currentTotpCode());
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("button", { name: "模特", exact: true })).toBeVisible();
}

test("登录 → 创建模特（含上传头像）→ 加入今日名单", async ({ page }) => {
  await loginAsOwner(page);

  // 进 ModelsTab 新增
  await page.getByRole("button", { name: "模特", exact: true }).click();
  await page.getByRole("button", { name: /新增模特/ }).click();

  // 填编号 + 化名（用唯一 code 避免 mock repo 残留冲突）
  const code = `M-2026-${String(Date.now()).slice(-4)}`;
  await page.getByPlaceholder("M-2026-0001").fill(code);
  await page.getByPlaceholder("模特化名").fill("E2E 测试模特");

  // 上传头像：直接 setInputFiles 到隐藏 input[type=file]
  await page.locator('input[type="file"]').setInputFiles({
    name: "avatar.jpg",
    mimeType: "image/jpeg",
    buffer: JPEG_MIN,
  });

  // 等上传完成（按钮文案从"上传中…"变回"选择文件上传"）
  await expect(page.getByRole("button", { name: /选择文件上传/ })).toBeVisible({
    timeout: 15_000,
  });

  // 预览图出现
  await expect(page.locator('img[alt="preview"]')).toBeVisible();

  // 保存
  await page.getByRole("button", { name: /^保存$/ }).click();

  // 回到列表，应看到刚创建的模特（first 取列表项文字，避开同名 img alt）
  await expect(page.getByText("E2E 测试模特").first()).toBeVisible({ timeout: 10_000 });

  // 进 RosterTab，勾选 + 保存
  await page.getByRole("button", { name: "名单", exact: true }).click();

  // 等首次拉取完成（加载中状态消失）
  await expect(page.getByText("勾选今日在班模特")).toBeVisible({ timeout: 10_000 });

  // Scope 进 RosterTab 容器 —— AdminPanel z-50 fixed inset-0 视觉遮挡 HomeSection 但 DOM 里
  // ModelCard 还在；用 data-testid="roster-tab" 锁定面板内的 button。
  const rosterPanel = page.getByTestId("roster-tab");
  await rosterPanel.locator("button").filter({ hasText: "E2E 测试模特" }).click();

  // 保存按钮应该激活并显示 "(1 位在班)"
  const saveBtn = rosterPanel.getByRole("button", { name: /保存 \(1 位在班\)/ });
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();

  // 保存成功后按钮文案变成"已是最新"
  await expect(rosterPanel.getByRole("button", { name: "已是最新" })).toBeVisible({
    timeout: 10_000,
  });
});
