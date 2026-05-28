# ChiYan Web

> ChiYan H5 客户端 + Admin Console + API — Cloudflare 全栈 Serverless

模特工作室自助上下架 + 当日通告接单系统。

- **业务文档**：[docs/](./docs)
- **设计参考**（Figma Make 导出，Phase 2 时迁移到 `apps/h5/`）：[开始设计方案/](./开始设计方案)

---

## 仓库结构

```
chiyan-web/
├─ apps/
│  ├─ h5/        # H5 客户端（Cloudflare Pages，主域，邀请制 URL 混淆）
│  ├─ admin/     # Admin Console（Cloudflare Pages，admin 子域）
│  └─ api/       # API 服务（Cloudflare Workers + Hono）
├─ packages/
│  ├─ config/    # 共享 tsconfig / eslint / prettier preset
│  ├─ db/        # Drizzle schema + migrations（Phase 1 落地）
│  ├─ types/     # zod schema + API 契约共享类型（Phase 1 落地）
│  └─ ui/        # 共享 shadcn 组件 + 设计 tokens（Phase 2 落地）
└─ docs/         # 设计 + 接口 + 开发文档
```

详细规划见 [docs/开发计划.md](./docs/开发计划.md)。

---

## 本地开发

### 前置

| 工具 | 版本 |
|---|---|
| Node | ≥ 20（推荐 22 LTS，`.nvmrc` 已声明） |
| pnpm | ≥ 9 |

```bash
# 安装依赖
pnpm install

# 同时启动三个 app（h5 / admin / api）
pnpm dev

# 单独启动某个 app
pnpm dev:h5
pnpm dev:admin
pnpm dev:api

# 全仓 typecheck / lint
pnpm typecheck
pnpm lint

# 格式化
pnpm format
```

### 默认端口

| 服务 | 端口 |
|---|---|
| apps/h5 | 5173 |
| apps/admin | 5174 |
| apps/api | 8787（wrangler dev 默认） |

---

## 当前阶段

**Phase 0 — 工程基建**（见 [docs/开发计划.md §四](./docs/开发计划.md)）

本地可完成：仓库骨架、共享 config、三个 app skeleton、CI 草稿。

依赖业主决策（待跟进，见 [docs/开发计划.md §五](./docs/开发计划.md)）：

- 🔴 Cloudflare account 归属（业主 or 开发方）
- 🔴 域名 DNS 移交
- 上述就绪后才能跑通"deploy 到 staging + DNS 切换"两项

---

## 关键约束

- **海外部署、不备案、不接审核**
- **零 PII**：后台账号只有 username + 密码 + 强制 TOTP，不存手机号 / 邮箱
- **邀请制 URL 混淆**：H5 客户端无登录，靠不可猜 URL + noindex + 空 robots.txt
- **大陆 best-effort**：不签 SLA，保留 China-friendly CDN 切换通道

参见 [docs/](./docs) 三份方案。
