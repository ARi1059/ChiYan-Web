#!/usr/bin/env bash
###
### ChiYan VPS 首次初始化脚本
###
### 适用：Ubuntu 24.04 LTS（其它 Debian 系大概率也行，未验过）
### 必须以 root（或 sudo）跑，且 /etc/chiyan/secrets.env 还**没**写之前跑。
###
### 跑完后状态：
###   - 用户 chiyan / 组 chiyan 存在；/var/chiyan/{media,logs,backups,run} owner=chiyan
###   - UFW 仅放 22 / 80 / 443
###   - Node 22 / Postgres 16 / Redis 7 / Caddy 2 / sharp 系统依赖装齐
###   - postgresql / redis-server / caddy 三个 systemd unit 已 enable + active
###
### 下一步（不在此脚本里）：
###   1. 写 /etc/chiyan/secrets.env（参考 deploy/secrets.env.example）
###   2. createuser chiyan + createdb chiyan_prod + 装 pg_trgm / pgcrypto 扩展
###   3. 修改 /etc/postgresql/16/main/postgresql.conf 按 docs/部署架构.md §3.2
###   4. 修改 /etc/redis/redis.conf 按 docs/部署架构.md §3.3
###   5. cp deploy/caddy/Caddyfile.example /etc/caddy/Caddyfile, 替换占位
###   6. 部署 Cloudflare Origin CA 证书到 /etc/caddy/cf-origin.{pem,key}
###   7. cp deploy/systemd/chiyan-api.service /etc/systemd/system/, daemon-reload
###   8. 首次 git pull + pnpm install + pnpm build，然后 systemctl start chiyan-api
###   9. 走一遍 docs/部署架构.md §8.1 上线 checklist
###
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "需要 root 权限：sudo $0" >&2
    exit 1
fi

if ! grep -q "Ubuntu 24" /etc/os-release; then
    echo "警告：不是 Ubuntu 24，继续？[y/N]"
    read -r ans
    [[ "$ans" == "y" ]] || exit 1
fi

echo "==> [1/13] apt update + 系统补丁"
apt update && apt upgrade -y

echo "==> [2/13] 基础工具"
apt install -y curl gnupg2 ca-certificates lsb-release ufw fail2ban unattended-upgrades

echo "==> [3/13] chiyan 用户 + 目录"
if ! id -u chiyan >/dev/null 2>&1; then
    adduser --system --group --home /var/chiyan chiyan
fi
mkdir -p /var/chiyan/{media,logs,backups,run} /etc/chiyan
chown -R chiyan:chiyan /var/chiyan
chmod 750 /var/chiyan /etc/chiyan
# originals 子目录单独 0700（caddy 进程访问不到）
mkdir -p /var/chiyan/media/originals
chmod 700 /var/chiyan/media/originals

echo "==> [4/13] UFW 防火墙"
ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> [5/13] 自动安全更新（仅 security 通道）"
dpkg-reconfigure -plow unattended-upgrades || true

echo "==> [6/13] Node 22 LTS"
if ! command -v node >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
fi
npm install -g pnpm

echo "==> [7/13] PostgreSQL 16（PGDG 源）"
if ! command -v psql >/dev/null; then
    install -d /etc/apt/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list
    apt update
    apt install -y postgresql-16
fi

echo "==> [8/13] Redis 7"
apt install -y redis-server

echo "==> [9/13] Caddy 2"
if ! command -v caddy >/dev/null; then
    apt install -y debian-keyring debian-archive-keyring apt-transport-https
    install -d /usr/share/keyrings
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
        | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt update
    apt install -y caddy
fi

echo "==> [10/13] sharp 原生依赖 + 备份工具"
apt install -y libvips libvips-dev rclone gzip rsync

echo "==> [11/13] 时区 Asia/Hong_Kong"
timedatectl set-timezone Asia/Hong_Kong || true

echo "==> [12/13] 2G swap（应急兜底；2GB RAM 是硬上限，正常不触发）"
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> [13/13] Redis 配置（bind/内存/持久化，对齐 docs/部署架构.md §3.3；requirepass 手动填）"
REDIS_CONF=/etc/redis/redis.conf
if [[ -f "$REDIS_CONF" ]] && ! grep -q "# chiyan-config" "$REDIS_CONF"; then
    cat >> "$REDIS_CONF" <<'REDISEOF'

# ─── chiyan-config（bootstrap 追加，对齐 docs/部署架构.md §3.3）───
bind 127.0.0.1 -::1
protected-mode yes
maxmemory 128mb
maxmemory-policy allkeys-lru
save ""
appendonly yes
appendfsync everysec
# requirepass：取消注释并填入 1Password 的 redis 密码，须与 secrets.env 的 REDIS_URL 一致
# requirepass <redis-password>
REDISEOF
    echo "    ⚠ 记得编辑 $REDIS_CONF 设 requirepass（与 secrets.env REDIS_URL 对齐）再 systemctl restart redis-server"
fi

echo "==> 启 systemd unit"
systemctl enable --now postgresql redis-server caddy

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  bootstrap 完成。下一步看脚本顶部注释（步 1-9）。"
echo "═══════════════════════════════════════════════════════════"
