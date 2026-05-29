# ChiYan Web

> ChiYan H5 客户端 + Admin Console + API — 香港 VPS 自部署 · Node 22 + Hono on Node + PostgreSQL + Redis + Caddy

模特工作室自助上下架 + 当日通告接单系统。

- **业务文档**：[docs/](./docs)
- **设计参考**（Figma Make 导出，Phase 2 时迁移到 `apps/h5/`）：[开始设计方案/](./开始设计方案)

---

## 仓库结构

```
chiyan-web/
├─ apps/
│  ├─ h5/        # H5 客户端（Caddy 静态托管，主域，邀请制 URL 混淆）
│  ├─ admin/     # Admin Console（Caddy 静态托管，admin 子域，IP 白名单）
│  └─ api/       # API 服务（Hono on Node，systemd 托管，127.0.0.1:3000）
├─ packages/
│  ├─ config/    # 共享 tsconfig / eslint / prettier preset
│  ├─ db/        # Drizzle schema + migrations（node-postgres driver）
│  ├─ types/     # zod schema + API 契约共享类型
│  └─ ui/        # 共享 shadcn 组件 + 设计 tokens
├─ ops/          # systemd unit / Caddyfile / 备份脚本（可版本化的运维配置）
└─ docs/         # 设计 + 接口 + 部署 + 开发文档
```

详细规划见 [docs/开发计划.md](./docs/开发计划.md)，部署细节见 [docs/部署架构.md](./docs/部署架构.md)。

---

## 文档导航

| 文档 | 角色 |
| --- | --- |
| [docs/模特资料与当日通告接单-H5设计方案.md](./docs/模特资料与当日通告接单-H5设计方案.md) | H5 UI / 交互 / 隐私边界 / QQ 接单链路（v4） |
| [docs/后台管理系统接口设计方案.md](./docs/后台管理系统接口设计方案.md) | API 契约 / 数据模型 / 鉴权 / 错误码（v4） |
| [docs/Figma高保真设计方案.md](./docs/Figma高保真设计方案.md) | Figma 工作方案 / Design Tokens / 组件库 |
| [docs/部署架构.md](./docs/部署架构.md) | VPS 初始化 / systemd / Caddy / 备份 / 上线 checklist |
| [docs/开发计划.md](./docs/开发计划.md) | Phase 拆分 / 退出标准 / 依赖项 / 时间线（v2） |

---

## 本地开发

### 前置

| 工具 | 版本 |
|---|---|
| Node | ≥ 22 LTS（`.nvmrc` 已声明） |
| pnpm | ≥ 9 |
| PostgreSQL | ≥ 16（本机或容器，仅监听 localhost） |
| Redis | ≥ 7 |

```bash
# 安装依赖
pnpm install

# 同时启动三个 app（h5 / admin / api）
pnpm dev

# 单独启动某个 app
pnpm dev:h5
pnpm dev:admin
pnpm dev:api

# 全仓 typecheck / 测试
pnpm typecheck
pnpm test

# 格式化
pnpm format
```

### 默认端口

| 服务 | 端口 |
|---|---|
| apps/h5 | 5173 |
| apps/admin | 5174 |
| apps/api | 3000 |
| PostgreSQL | 5432（本机） |
| Redis | 6379（本机） |

---

## 当前阶段

**Phase R — 重定基（栈切换）**（见 [docs/开发计划.md §四](./docs/开发计划.md)）

业主 2026-05-29 决定推翻 CF 全栈 Serverless 方案，改 VPS 自部署。已有 25 个 commit 的 mock 代码基于 Workers 写就，需要按新栈切换：

- `apps/api` 入口换 `@hono/node-server`
- `packages/db` 驱动切 `drizzle-orm/node-postgres`
- Redis 切 `ioredis`
- 密码哈希切 bcrypt native（cost 12）
- 加密切 node:crypto AES-256-GCM
- JWT 切 jose ES256
- 媒体上传从 R2 presigned 两步合并为 multipart 单步（sharp 同步处理）

依赖业主决策（待跟进，见 [docs/开发计划.md §五](./docs/开发计划.md)）：

- 🔴 Cloudflare Origin CA 证书签发（15 年）
- 🔴 Backblaze B2 桶 + access key（备份目的地）
- 🔴 Sentry org + DSN（三端共用）
- 🔴 1Password 共享条目（源 IP / SSH key / secrets.env 模板 / B2 key / Sentry DSN / CF Origin CA 私钥）

---

## 关键约束

- **单台香港 VPS 自部署**（2C / 2G / 40G），**不使用 Docker**，全部 systemd + apt 原生包
- **Cloudflare proxied 模式**：仅作 DNS + CDN + WAF + DDoS + 隐藏源 IP，不承载运行时
- **海外部署、不备案、不接审核**
- **零 PII**：后台账号只有 username + 密码 + 强制 TOTP，不存手机号 / 邮箱
- **邀请制 = URL 混淆**：H5 客户端无登录，靠不可猜 URL 前缀 + noindex + 空 robots.txt
- **2 GB RAM 是硬上限**：Postgres + Redis + Node + sharp + Caddy 合计 ≤ 1.7G
- **不接微信全家桶**（业主 2026-05-29 追加确认）：分享只走 QQ + Web Share + 兜底 Sheet
- **大陆 best-effort**：不签 SLA，保留 China-friendly CDN 切换通道

详细约束与决策依据见 [docs/](./docs) 五份方案。
