# `deploy/` —— 上线脚手架

把 [docs/部署架构.md](../docs/部署架构.md) 里描述的 systemd unit、Caddyfile、bootstrap 步骤落成可直接 `cp` 的文件。

## 目录

```
deploy/
├── README.md                       # ← 本文件
├── secrets.env.example             # → /etc/chiyan/secrets.env（0600 root:chiyan）
├── caddy/
│   └── Caddyfile.example           # → /etc/caddy/Caddyfile
├── systemd/
│   └── chiyan-api.service          # → /etc/systemd/system/chiyan-api.service
└── scripts/
    ├── bootstrap-vps.sh            # 在 VPS 上跑一次，装齐所有基础组件
    └── chiyan-backup.sh            # → /usr/local/bin/chiyan-backup.sh + cron
```

域名、IP、密钥都用 `<占位符>`。**真值走 1Password 共享条目**，不入仓库（URL obscurity 是安全模型的一部分）。

## 上线顺序

按 [docs/部署架构.md §八.1](../docs/部署架构.md) 上线 checklist 走；下面是 `deploy/` 里文件的拷贝顺序：

1. **第一次 SSH 进 VPS**
   ```bash
   sudo bash deploy/scripts/bootstrap-vps.sh
   ```
   装 Node 22 + Postgres 16 + Redis 7 + Caddy 2 + sharp 系统依赖；建 `chiyan` 用户 + 目录；开 UFW；enable systemd unit。

2. **建库 + 调 Postgres/Redis 参数**（参考部署架构 §3.2 / §3.3）
   ```bash
   sudo -u postgres createuser chiyan
   sudo -u postgres createdb -O chiyan chiyan_prod
   sudo -u postgres psql chiyan_prod -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto'
   sudo -u postgres psql -c "ALTER USER chiyan WITH PASSWORD '<db-password>'"
   ```

3. **写 secrets**
   ```bash
   sudo cp deploy/secrets.env.example /etc/chiyan/secrets.env
   sudoedit /etc/chiyan/secrets.env   # 替换所有 <…> 占位（用 1Password 内容）
   sudo chmod 0600 /etc/chiyan/secrets.env
   sudo chown root:chiyan /etc/chiyan/secrets.env
   ```

4. **Caddy 证书 + Caddyfile**
   ```bash
   sudo cp deploy/caddy/Caddyfile.example /etc/caddy/Caddyfile
   sudoedit /etc/caddy/Caddyfile        # 替换 <your-h5-domain> / <your-admin-domain> / <your-api-domain> / 白名单 IP / email
   # 把 Cloudflare Origin CA 证书放进 /etc/caddy/cf-origin.{pem,key}（0600 root:caddy）
   sudo systemctl reload caddy
   ```

5. **首次部署应用产物**（结构必须与 `.github/workflows/deploy.yml` 一致：`*-next` 真目录 + 软链。
   首次若直接建成真目录 `api`/`dist`，后续 CI 的 `ln -sfn` 会把软链建进目录内部 → 部署错乱）
   ```bash
   # 本机 / GH Actions：pnpm install --frozen-lockfile && pnpm build
   # 1) 推到 *-next 真目录
   rsync -az --delete apps/api/dist/ apps/api/package.json apps/api/node_modules/ \
     <deploy>@<host>:/var/www/chiyan/apps/api-next/
   rsync -az --delete apps/h5/dist/    <deploy>@<host>:/var/www/chiyan-h5/dist-next/
   rsync -az --delete apps/admin/dist/ <deploy>@<host>:/var/www/chiyan-admin/dist-next/
   # 2) 原子软链（首次建立；之后 deploy.yml 用同样的 ln -sfn 替换）
   ssh <deploy>@<host> '
     ln -sfn /var/www/chiyan/apps/api-next   /var/www/chiyan/apps/api
     ln -sfn /var/www/chiyan-h5/dist-next    /var/www/chiyan-h5/dist
     ln -sfn /var/www/chiyan-admin/dist-next /var/www/chiyan-admin/dist'
   # 3) 首次 db migrate：postgres 只听 VPS 127.0.0.1，本机经 SSH 隧道连上跑（详见 deploy/RUNBOOK.md）
   ssh -fNL 5433:127.0.0.1:5432 <deploy>@<host>
   DATABASE_URL='postgresql://chiyan:<pwd>@127.0.0.1:5433/chiyan_prod' pnpm --filter @chiyan/db migrate
   ```

6. **装 systemd unit + 启动**
   ```bash
   sudo cp deploy/systemd/chiyan-api.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now chiyan-api
   sudo journalctl -fu chiyan-api      # 看日志确认 listening on :3000
   ```

7. **配每日备份**
   ```bash
   # rclone config 配 b2 remote 一次
   sudo cp deploy/scripts/chiyan-backup.sh /usr/local/bin/
   sudo chmod 750 /usr/local/bin/chiyan-backup.sh
   sudo chown chiyan:chiyan /usr/local/bin/chiyan-backup.sh
   sudo -u chiyan crontab -e   # 加：30 2 * * * /usr/local/bin/chiyan-backup.sh >> /var/chiyan/logs/backup.log 2>&1
   sudo -u chiyan /usr/local/bin/chiyan-backup.sh   # 跑一次确认成功
   ```

8. **走 docs/部署架构.md §八.1 checklist**，全部打勾再接外网。

## 之后的日常发布

`.github/workflows/deploy.yml`（仓库里有）在 `push: main` 时跑：build → rsync → `systemctl restart chiyan-api`。**不**做 db migrate（destructive 风险）；db migrate 走 `workflow_dispatch` 手动。

启用前先在 GitHub Settings → Secrets and variables → Actions 配 4 个 repo secret：

| Secret | 含义 |
| --- | --- |
| `DEPLOY_SSH_KEY` | 生产 deploy 用户的 ed25519 私钥（无 passphrase）。**不**用主理人 SSH key。 |
| `DEPLOY_HOST` | VPS 源 IP 或运维专属域名（不要写公网域，走 CF 代理就废了 SSH） |
| `DEPLOY_USER` | 通常 `deploy`；sudoers 仅授权 `systemctl restart chiyan-api` + `reload caddy` |
| `HEALTH_URL` | `https://<your-api-domain>/health` —— smoke test 用 |

配齐之前 deploy workflow 的红色"context access might be invalid"警告会一直在，不影响 CI workflow（`ci.yml` 不依赖任何 secret）。

## 修改契约

任何 systemd unit / Caddyfile / bootstrap 步骤的改动**必须先回写 [docs/部署架构.md](../docs/部署架构.md)**，再改本目录文件，避免现场状态与文档脱节。
