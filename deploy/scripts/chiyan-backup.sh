#!/usr/bin/env bash
###
### ChiYan 每日备份 — postgres dump + media rsync 到 Backblaze B2
###
### 安装：
###   sudo cp deploy/scripts/chiyan-backup.sh /usr/local/bin/chiyan-backup.sh
###   sudo chmod 750 /usr/local/bin/chiyan-backup.sh
###   sudo chown chiyan:chiyan /usr/local/bin/chiyan-backup.sh
###
### cron（chiyan crontab）：
###   30 2 * * * /usr/local/bin/chiyan-backup.sh >> /var/chiyan/logs/backup.log 2>&1
###
### 前置：
###   - rclone 装好 + 配 b2 remote（rclone config）
###   - postgres 用户 chiyan 有 chiyan_prod 库读权限
###   - 环境变量 CHIYAN_DB（默认 chiyan_prod）、CHIYAN_B2（默认 b2:chiyan-backups）
###
### 保留策略：
###   - 本地 db dump 保留 2 天（cron 每天跑 → 容忍一天失败）
###   - B2 db dump 保留 30 天
###   - B2 媒体 sync 走 --b2-hard-delete 真删（不留版本）
###
set -euo pipefail

DB="${CHIYAN_DB:-chiyan_prod}"
B2_REMOTE="${CHIYAN_B2:-b2:chiyan-backups}"
BACKUP_DIR=/var/chiyan/backups
DATE=$(date +%Y%m%d-%H%M)

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] 1/4 dump $DB"
# -Fc custom format → 用 pg_restore 选择性回放；gzip 压缩
sudo -u postgres pg_dump -Fc -d "$DB" \
    | gzip > "$BACKUP_DIR/db-$DATE.dump.gz"

echo "[$(date -Is)] 2/4 sync media → B2"
# --transfers 4 控并发避免 2GB 机器抖；--checkers 8 用于增量对比
rclone sync /var/chiyan/media "$B2_REMOTE/media/" \
    --transfers 4 --checkers 8 --b2-hard-delete \
    --exclude 'originals/**/.*' --exclude 'logs/**'

echo "[$(date -Is)] 3/4 push db snapshot → B2"
rclone copy "$BACKUP_DIR/db-$DATE.dump.gz" "$B2_REMOTE/db/" \
    --transfers 2

echo "[$(date -Is)] 4/4 清本地 + B2 保留策略"
find "$BACKUP_DIR" -name 'db-*.dump.gz' -mtime +2 -delete
rclone delete "$B2_REMOTE/db/" --min-age 30d || true

echo "[$(date -Is)] done"
