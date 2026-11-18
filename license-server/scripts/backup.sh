#!/usr/bin/env bash
# license-server 数据库备份脚本（建议 crontab 每日一次）
# 优先用本地 sqlite3；服务器上没有 sqlite3 时走管理接口下载。
# 用法: ./scripts/backup.sh [数据目录]    （默认 ./data）
set -euo pipefail

DATA_DIR="${1:-data}"
BACKUP_DIR="${DATA_DIR}/backups"
KEEP=14
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DATA_DIR/license.db" ]; then
  sqlite3 "$DATA_DIR/license.db" ".backup '$BACKUP_DIR/license-$STAMP.db'"
else
  # 走 HTTP 备份接口（需要管理密码）
  : "${ADMIN_URL:?需要环境变量 ADMIN_URL，例如 https://license.example.com}"
  : "${ADMIN_PASSWORD:?需要环境变量 ADMIN_PASSWORD}"
  TOKEN=$(curl -fsS -X POST "$ADMIN_URL/admin/api/login" \
    -H 'content-type: application/json' \
    -d "{\"password\":\"$ADMIN_PASSWORD\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  curl -fsS -H "authorization: Bearer $TOKEN" \
    "$ADMIN_URL/admin/api/backup" -o "$BACKUP_DIR/license-$STAMP.db"
fi

gzip -f "$BACKUP_DIR/license-$STAMP.db"
echo "备份完成: $BACKUP_DIR/license-$STAMP.db.gz"

# 只保留最近 KEEP 份
ls -1t "$BACKUP_DIR"/license-*.db.gz | tail -n +$((KEEP + 1)) | xargs -r rm --
echo "当前保留最近 $KEEP 份备份"
