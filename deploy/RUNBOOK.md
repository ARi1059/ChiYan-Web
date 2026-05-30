# ChiYan 上线 Runbook —— 从零到 prod

> 配合 [docs/部署架构.md](../docs/部署架构.md)（机器层契约）与 `deploy/` 脚手架。本文是一份可勾选的执行清单。
> **域名 / IP / 密钥全走 1Password，不入仓库**（URL obscurity 是安全模型的一部分）。
> 全程按顺序走，每步打勾再下一步。最后跑 [§8.1 上线 Checklist](../docs/部署架构.md)。

---

## 0. 前置：业主侧钥匙（🔴 阻塞一切，先备齐）

| 项                            | 用途               | 怎么拿                                                                                                                   |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Cloudflare Origin CA 证书** | Caddy TLS（15 年） | CF Dashboard → SSL/TLS → Origin Server → Create Certificate；私钥存 1Password，部署时落 `/etc/caddy/cf-origin.{pem,key}` |
| **Backblaze B2 桶 + appKey**  | 每日备份           | B2 建 bucket `chiyan-backups` + application key；`rclone config` 配 `b2:` remote 用                                      |
| **Sentry project + DSN**      | 三端监控           | Sentry 建 project，拿 DSN，填 secrets.env                                                                                |
| **1Password 共享条目**        | 密钥总线           | 源 IP / SSH key / `secrets.env` 模板 / B2 key / Sentry DSN / CF Origin CA 私钥 / DB·Redis 密码                           |
| **GitHub repo secrets**       | CI/CD              | 见下表，Settings → Secrets and variables → Actions                                                                       |

GitHub repo secrets：

| Secret              | 值                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_SSH_KEY`    | deploy 用户 ed25519 私钥（无 passphrase，**非**主理人 key）                                                                                                                           |
| `DEPLOY_HOST`       | VPS 源 IP 或运维专属域名（**不要**写公网 CF 代理域）                                                                                                                                  |
| `DEPLOY_USER`       | `deploy`                                                                                                                                                                              |
| `HEALTH_URL`        | `https://<api 域>/health`                                                                                                                                                             |
| `PROD_DATABASE_URL` | 仅 [migrate.yml](../.github/workflows/migrate.yml) 用，`postgresql://chiyan:<pwd>@127.0.0.1:5433/chiyan_prod`（隧道本地端口）。不接受库密码进 GitHub secrets 则跳过，迁移用 §6 手动法 |

---

## 1. VPS 首装

```bash
sudo bash deploy/scripts/bootstrap-vps.sh
```

装 Node22 / PG16 / Redis7 / Caddy2 / sharp 依赖（libvips），建 `chiyan` 用户 + `/var/chiyan/{media,logs,backups,run}`，UFW（22/80/443），2G swap，时区 `Asia/Hong_Kong`，redis.conf（bind/内存/AOF），enable postgresql·redis·caddy。

⚠ **bootstrap 后必做**：

- [ ] 编辑 `/etc/redis/redis.conf` 设 `requirepass <密码>`（与 secrets.env 的 `REDIS_URL` 一致）→ `sudo systemctl restart redis-server`
- [ ] SSH 加固：`/etc/ssh/sshd_config` 设 `PasswordAuthentication no`；主理人 + 运维公钥进 `~/.ssh/authorized_keys`

---

## 2. 建库 + 调参

```bash
sudo -u postgres createuser chiyan
sudo -u postgres createdb -O chiyan chiyan_prod
sudo -u postgres psql chiyan_prod -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto'
sudo -u postgres psql -c "ALTER USER chiyan WITH PASSWORD '<db-password>'"
```

`/etc/postgresql/16/main/postgresql.conf` 按 [§3.2](../docs/部署架构.md) 覆盖（`shared_buffers=256MB` / `work_mem=8MB` / `log_min_duration_statement=500ms` 等）；`pg_hba.conf` 仅 `local` + `127.0.0.1/32` 走 `scram-sha-256`。`sudo systemctl restart postgresql`。

---

## 3. secrets.env

```bash
sudo cp deploy/secrets.env.example /etc/chiyan/secrets.env
sudoedit /etc/chiyan/secrets.env          # 填所有 <…>（1Password）
sudo chmod 0600 /etc/chiyan/secrets.env
sudo chown root:chiyan /etc/chiyan/secrets.env
```

关键字段：`DATABASE_URL` / `REDIS_URL`（带 requirepass 密码）/ `JWT_SECRET`（`openssl rand -base64 48`）/ `ENC_KEY_V1`（`openssl rand -base64 32`）/ `SENTRY_DSN` / `CF_API_TOKEN` + `CF_ZONE_ID` / `ALLOWED_ORIGINS`（H5 + Admin 两域 JSON 数组）/ `API_PUBLIC_URL`。

---

## 4. Caddy + 证书

```bash
sudo cp deploy/caddy/Caddyfile.example /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile             # 替换 <your-*-domain> / <ops-ip-*> / <email-for-cert>
sudo install -m 600 -o root -g caddy cf-origin.pem cf-origin.key /etc/caddy/   # Origin CA 证书落盘
sudo systemctl reload caddy
```

Cloudflare DNS：h5 / admin / api 三条 A（+ AAAA）记录，**proxied 模式**。

---

## 5. deploy 用户 + sudoers

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo '<deploy 公钥>' | sudo tee /home/deploy/.ssh/authorized_keys
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys
# sudoers：仅授权两条命令，无 root
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart chiyan-api, /usr/bin/systemctl reload caddy' \
  | sudo tee /etc/sudoers.d/deploy
sudo visudo -cf /etc/sudoers.d/deploy     # 校验语法
```

---

## 6. 首次部署 + migrate

按 [deploy/README.md 步骤 5](./README.md)（`*-next` 真目录 + `ln -sfn` 软链，**勿**首次建真目录）。首次 migrate 经 SSH 隧道（postgres 只听 127.0.0.1）：

```bash
ssh -fNL 5433:127.0.0.1:5432 deploy@<host>
DATABASE_URL='postgresql://chiyan:<pwd>@127.0.0.1:5433/chiyan_prod' pnpm --filter @chiyan/db migrate
```

> 之后日常 schema 变更走 [migrate.yml](../.github/workflows/migrate.yml)（Actions → migrate → 输入 `MIGRATE`）。

---

## 7. systemd 起 API

```bash
sudo cp deploy/systemd/chiyan-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now chiyan-api
sudo journalctl -fu chiyan-api            # 应看到 "chiyan-api listening" + "redis connected"
```

⚠ 若日志出现 `redis connect failed — 降级 in-memory` → `REDIS_URL` 密码不对或 redis 没起。**必须修**：内存态下限流 / 登出撤销 / TOTP challenge 重启即丢，违反 Phase 1 退出标准。

---

## 8. 备份 cron

```bash
rclone config                             # 配 b2: remote 一次
sudo cp deploy/scripts/chiyan-backup.sh /usr/local/bin/
sudo chmod 750 /usr/local/bin/chiyan-backup.sh
sudo chown chiyan:chiyan /usr/local/bin/chiyan-backup.sh
sudo -u chiyan crontab -e                 # 30 2 * * * /usr/local/bin/chiyan-backup.sh >> /var/chiyan/logs/backup.log 2>&1
sudo -u chiyan /usr/local/bin/chiyan-backup.sh    # 立即跑一次确认成功
```

---

## 9. 上线验证 + 接外网

走 [§8.1 上线 Checklist](../docs/部署架构.md) 全表，重点：

- [ ] `systemctl is-active postgresql redis-server caddy chiyan-api` 全 `active`
- [ ] 三子域边缘可访问；`curl https://<api 域>/health` → 200
- [ ] 一次端到端图片上传成功（sharp 处理 + 落盘 + 媒体 serve）
- [ ] **安全验证**：`curl -I https://<api 域>/media/originals/x` → **404**（原图防护生效，见 media-static.ts）
- [ ] `noindex` meta + 空 `robots.txt`；Admin 子域 IP 白名单生效
- [ ] 备份 cron 跑过一次成功；Sentry 收到首条事件

**日常发布**：push `main` → CI 绿 → [deploy.yml](../.github/workflows/deploy.yml) 自动上线（CI 红不部署）；schema 变更走 migrate.yml。

**回滚**：`ln -sfn /var/www/chiyan/apps/api-prev /var/www/chiyan/apps/api && sudo systemctl restart chiyan-api`。其余故障预案见 [§九](../docs/部署架构.md)。
