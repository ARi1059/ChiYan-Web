## Phase 0 运行手册

> 版本：v1 · 制定日期：2026-05-28
> 范围：[开发计划 §四 · Phase 0](./开发计划.md) 落地后的本地运行 / 验证 / 后续衔接
> 仓库当前状态：仓库骨架、共享 config、三个 app skeleton、CI 草稿 ——
> 已通过 `pnpm install / typecheck / lint / format:check / build` 四件套校验

---

### 一、本地起跑

#### 1.1 工具版本

| 工具 | 版本 | 验证命令 |
|---|---|---|
| Node | ≥ 20（CI 跟 `.nvmrc` 用 22 LTS） | `node -v` |
| pnpm | ≥ 9（仓库锁 `9.15.0`） | `pnpm -v` |

#### 1.2 安装 + 校验

```bash
pnpm install                  # 首次约 30s
pnpm typecheck                # 7 个包并行 tsc --noEmit
pnpm lint                     # 6 个包并行 eslint src
pnpm format:check             # prettier --check
pnpm build                    # 只构建 apps/* (api wrangler dry-run + h5/admin vite build)
```

四件套全部 exit 0 即视为 Phase 0 本地校验通过。

#### 1.3 起本地 server

| 命令 | 默认端口 | 备注 |
|---|---|---|
| `pnpm dev:h5` | 5173 | Vite, BrowserRouter |
| `pnpm dev:admin` | 5174 | Vite, BrowserRouter |
| `pnpm dev:api` | 8787 | Wrangler dev，本地 Workers runtime；从 `apps/api/.dev.vars` 读环境变量 |
| `pnpm dev` | — | 同时跑 h5/admin/api 三个（CPU 占用较高） |

打开 [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health) 应返回：

```json
{ "ok": true, "service": "chiyan-api", "ts": "2026-..." }
```

---

### 二、目录约定

```
chiyan-web/
├─ apps/
│  ├─ api/                    # Hono + Wrangler
│  │  ├─ wrangler.toml        # 三环境（dev / staging / production）
│  │  ├─ .dev.vars.example    # 本地秘钥模板，复制为 .dev.vars 后填写
│  │  └─ src/index.ts         # 只有 /health
│  ├─ h5/                     # Vite + React + react-router-dom
│  │  ├─ index.html           # noindex meta + 禁 referrer
│  │  ├─ public/robots.txt    # 空文件（避免 Disallow: / 反向暴露路径存在）
│  │  └─ src/                 # main.tsx + App.tsx 占位 5 路由
│  └─ admin/                  # 同 h5 结构，端口 5174
│
├─ packages/
│  ├─ config/                 # tsconfig.{base,app,worker,lib} + eslint + prettier
│  ├─ types/                  # zod schema 入口（Phase 1 起按接口方案扩展）
│  ├─ db/                     # Drizzle client 占位（schema 留空，Phase 1 起填）
│  └─ ui/                     # cn() + tokens.css 占位（Phase 2 起接 Figma Tokens）
│
├─ .github/workflows/ci.yml   # lint + typecheck + build，PR & main 触发
├─ docs/                      # 本目录（设计 + 接口 + 计划 + 本手册）
└─ 开始设计方案/                # Figma Make 导出，参考用，Phase 2 起逐组件迁移到 apps/h5/
```

---

### 三、关键决策与默认值

| 项 | 当前默认 | 改动方式 |
|---|---|---|
| Workers compatibility_date | `2025-01-01` | `apps/api/wrangler.toml` |
| nodejs_compat flag | 开 | 同上；Neon 驱动需要 |
| H5 / Admin 默认端口 | 5173 / 5174 | 各 `vite.config.ts` |
| TypeScript target | ES2022 | `packages/config/tsconfig.base.json` |
| ESLint 规则 | flat config + tseslint recommended + react-hooks | `packages/config/eslint.config.js` |
| Prettier | printWidth 100, double quote, 2-space | `packages/config/prettier.config.js` |
| Wrangler | `^3.99.x`（v4 出但 v3 仍稳定） | Phase 1 spike 后视情况升 v4 |

---

### 四、CI 行为

`.github/workflows/ci.yml` 在 push/main 或任意 PR 触发：

1. checkout
2. `pnpm/action-setup@v4` + `actions/setup-node@v4`（读 `.nvmrc`）
3. `pnpm install --frozen-lockfile`
4. `pnpm format:check`
5. `pnpm lint`
6. `pnpm typecheck`
7. `pnpm build`

任一步失败即 fail，PR 阻塞合并。Phase 0 阶段不接 Cloudflare Pages / Workers 自动部署 —— 等 §五 的依赖项就绪后再加 deploy job。

---

### 五、Phase 0 退出前还差什么

[开发计划 §四 · Phase 0 退出标准](./开发计划.md) 四项中：

| # | 标准 | 当前状态 |
|---|---|---|
| 1 | `pnpm dev` 在三个 app 都能起本地 | ✅ 完成（本手册 §1.3） |
| 2 | `pnpm typecheck` / `pnpm lint` 全 green | ✅ 完成 |
| 3 | 三个域名访问到对应占位页（HTTPS 自动签发） | ❌ 阻塞于 Cloudflare account / 域名移交 |
| 4 | CI 通过 | ⚠️ 草稿已落地，需推到 GitHub 触发跑一次确认 |

#### 5.1 阻塞项（业主侧）

按 [开发计划 §五](./开发计划.md)：

- 🔴 **Cloudflare account 归属**：业主开 or 开发方代开后移交
- 🔴 **域名 DNS 权限**：业主已申请域名，需要把 DNS 控制权交给 Cloudflare nameserver

任一未到位前，Phase 0 标 3 ❌ 不动；Phase 1 可以**先在本地推进**（DB schema、API 路由、加密工具），实际部署放到阻塞项解除后。

#### 5.2 阻塞项解除后要做的事

1. Cloudflare：
   - 建 Pages 项目 × 2（`chiyan-h5`、`chiyan-admin`），指向 `apps/h5/dist`、`apps/admin/dist`
   - 建 Workers 项目 × 1（`chiyan-api`），`wrangler.toml` 里 `routes` 取消注释
   - 建 R2 bucket × 2（`chiyan-public` + `chiyan-private`）
   - 建 KV / Queues 视 Phase 1 接入决定
2. DNS：
   - 主域 → Pages（h5）
   - `admin.*` → Pages（admin）
   - `api.*`（或同源 `/api/*`）→ Workers
3. 外部账号：
   - Neon project（3 branch：dev / staging / prod）
   - Upstash Redis × 2（限流 + session jti 黑名单）
   - Sentry org + 三个项目（h5 / admin / api）
4. CI 加 deploy job：
   - main 合并自动 deploy 到 staging（Pages 用 Git 集成，Workers 用 `wrangler deploy --env staging`）
   - tag 触发 prod deploy

---

### 六、常见问题

**Q：本地 `pnpm dev:api` 启动后 `/health` 404？**
A：Wrangler dev 默认监听 `127.0.0.1:8787`。如改了 `wrangler.toml` 的 dev 段记得同步。

**Q：`pnpm build` 时 wrangler 提示 v4 升级警告？**
A：v3.114 仍稳定，Phase 1 spike Lucia + Drizzle + Neon 三件套时一并评估升级。

**Q：`@chiyan/*` workspace 包 import 报红？**
A：先跑 `pnpm install` 让 pnpm 建好 workspace symlink。IDE 可能需要重启 TS server。

**Q：format:check 失败但本地 format 已跑？**
A：检查是否在 `开始设计方案/` 或 `docs/` 下改过文件 —— 这两处在 `.prettierignore` 内，不会被 format 修复。要么把变更挪到 `apps/` `packages/`，要么从 `.prettierignore` 临时移除。

**Q：robots.txt 为什么是空文件而不是 `Disallow: /`？**
A：见 [H5 设计方案 §SEO 反向控制](./模特资料与当日通告接单-H5设计方案.md)。空 robots = "无规则"，避免 `Disallow: /admin` 这种条目反向告诉爬虫"这里有 admin 路径"。真正的反爬靠 noindex meta + 不可猜 URL。

---

### 七、和别处文档的关系

| 文档 | 决定的事 |
|---|---|
| [开发计划.md](./开发计划.md) | Phase 划分、退出标准、关键依赖、时间线 |
| [后台管理系统接口设计方案.md](./后台管理系统接口设计方案.md) | API 契约、数据库实体、鉴权流程 — Phase 1+ 实现依据 |
| [模特资料与当日通告接单-H5设计方案.md](./模特资料与当日通告接单-H5设计方案.md) | H5 视觉 / 交互 / 状态屏 — Phase 2+ 实现依据 |
| [Figma高保真设计方案.md](./Figma高保真设计方案.md) | Figma 出稿节奏 — 与开发的同步节点 |
| 本文档 | 仓库怎么本地跑、Phase 0 实际落到了哪一步 |

每个 Phase 退出时回填本目录新增一份对应运行手册，旧 Phase 手册保留作为复盘基准。
