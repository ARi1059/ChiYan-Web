#!/usr/bin/env bash
###
### ChiYan 每日备份 — postgres dump（本地同盘，无外部目的地）
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
###   - postgres 用户 chiyan 有 chiyan_prod 库读权限
###   - 环境变量 CHIYAN_DB（默认 chiyan_prod）、CHIYAN_RETAIN_DAYS（默认 14）
###
### ⚠ 风险（业主 2026-05-31 知悉并选择此方案）：
###   备份与原库同处一块盘，只防「手滑误删 / 逻辑错误」，可 pg_restore 回滚。
###   不防 盘损 / VM 删除 / 账号封禁 —— 那些场景原件与备份同生共死。
###   media（/var/chiyan/media）未纳入备份：同盘再复制不防盘坏、徒占空间，故不做。
###
### 保留策略：
###   - 本地 db dump 保留 14 天（本地是唯一副本，多留几份给回滚余地，
###     避免坏数据当天覆盖掉昨天的好备份）
###
set -euo pipefail

DB="${CHIYAN_DB:-chiyan_prod}"
RETAIN_DAYS="${CHIYAN_RETAIN_DAYS:-14}"
BACKUP_DIR=/var/chiyan/backups
DATE=$(date +%Y%m%d-%H%M)

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] 1/2 dump $DB → db-$DATE.dump.gz"
# -Fc custom format → 用 pg_restore 选择性回放；gzip 压缩
sudo -u postgres pg_dump -Fc -d "$DB" \
    | gzip > "$BACKUP_DIR/db-$DATE.dump.gz"

echo "[$(date -Is)] 2/2 清理超过 ${RETAIN_DAYS} 天的旧 dump"
find "$BACKUP_DIR" -name 'db-*.dump.gz' -mtime +"$RETAIN_DAYS" -delete

echo "[$(date -Is)] done — 本地现存 $(ls -1 "$BACKUP_DIR"/db-*.dump.gz 2>/dev/null | wc -l | tr -d ' ') 份 dump"
