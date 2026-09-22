#!/usr/bin/env bash
set -euo pipefail

# Tencent tlinux / RHEL-like one-shot deploy for match-3-game.
# 独立部署消消乐服务，默认端口 8090，不占用 eat-turntable 的 8080。

SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "$0")" && pwd)}"
SERVER_REPO_DIR="${SERVER_REPO_DIR:-$(dirname "$SCRIPT_DIR")}"
BASE_DIR="${BASE_DIR:-$(dirname "$SERVER_REPO_DIR")}"
CLIENT_DIR="${CLIENT_DIR:-$BASE_DIR/client}"
APP_ROOT="${APP_ROOT:-$SCRIPT_DIR}"
LOG_FILE="${LOG_FILE:-$BASE_DIR/match3-deploy.log}"

SERVER_REPO_URL="${SERVER_REPO_URL:-https://github.com/bonjourtoutlemond/mygame_server}"
CLIENT_REPO_URL="${CLIENT_REPO_URL:-https://github.com/bonjourtoutlemond/mygame_client.git}"
SERVER_REPO_REF="${SERVER_REPO_REF:-main}"
CLIENT_REPO_REF="${CLIENT_REPO_REF:-main}"

MYSQL_DATABASE="${MYSQL_DATABASE:-eat_turntable}"
MYSQL_APP_USER="${MYSQL_APP_USER:-eat_game}"
MYSQL_APP_PASSWORD="${MYSQL_APP_PASSWORD:-eat_game_dev_password}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-8090}"
NODE_ENV="${NODE_ENV:-production}"
SERVICE_NAME="${SERVICE_NAME:-match-3-game}"

exec > >(tee -a "$LOG_FILE") 2>&1
echo ""
echo "===== match-3 deploy started: $(date '+%Y-%m-%d %H:%M:%S') ====="

log() {
  printf '[match3-deploy] %s\n' "$*"
}

die() {
  printf '[match3-deploy][ERROR] %s\n' "$*" >&2
  exit 1
}

sudo_cmd() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

detect_pm() {
  if command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  else
    die "dnf/yum not found"
  fi
}

is_cmd_available() {
  command -v "$1" >/dev/null 2>&1
}

detect_server_ip() {
  local ip_addr=""
  if command -v ip >/dev/null 2>&1; then
    ip_addr="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") {print $(i + 1); exit}}')"
  fi
  if [[ -z "$ip_addr" ]] && command -v hostname >/dev/null 2>&1; then
    ip_addr="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s' "${ip_addr:-127.0.0.1}"
}

usage() {
  cat <<USAGE
Usage:
  ./deploy_tlinux.sh [all|install-deps|pull|init-db|install-app|start|stop|restart|status|logs]

Defaults:
  APP_PORT=$APP_PORT
  SERVICE_NAME=$SERVICE_NAME
  SERVER_REPO_DIR=$SERVER_REPO_DIR
  CLIENT_DIR=$CLIENT_DIR

Examples:
  ./deploy_tlinux.sh
  ./deploy_tlinux.sh restart
  journalctl -u $SERVICE_NAME -f
USAGE
}

install_deps() {
  log "=== 检查并安装依赖 ==="
  local pm
  pm="$(detect_pm)"
  local missing=()
  local entries=(
    "git:git"
    "curl:curl"
    "tar:tar"
    "gzip:gzip"
    "nodejs:node"
    "npm:npm"
    "mariadb-server:mysqld"
    "mariadb:mysql"
    "rsyslog:rsyslogd"
  )
  for entry in "${entries[@]}"; do
    local pkg="${entry%%:*}"
    local cmd="${entry##*:}"
    if is_cmd_available "$cmd"; then
      log "  [跳过] $pkg 已安装"
    else
      missing+=("$pkg")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log "安装缺失依赖: ${missing[*]}"
    sudo_cmd "$pm" install -y "${missing[@]}"
  fi
  sudo_cmd systemctl enable --now mariadb
  sudo_cmd systemctl enable --now rsyslog || true
}

github_tarball_url() {
  local repo_url="$1"
  local ref="$2"
  local base="${repo_url%.git}"
  printf '%s/archive/refs/heads/%s.tar.gz' "$base" "$ref"
}

download_repo_by_curl() {
  local repo_url="$1"
  local ref="$2"
  local dir="$3"
  local name="$4"
  local tmp_tar="/tmp/${name}-archive.tar.gz"
  local tmp_extract="/tmp/${name}-extract"
  local url
  url="$(github_tarball_url "$repo_url" "$ref")"
  log "curl 下载 $name: $url"
  curl -fSL --retry 3 --retry-delay 5 -o "$tmp_tar" "$url" || die "下载失败: $url"
  rm -rf "$tmp_extract"
  mkdir -p "$tmp_extract"
  tar xzf "$tmp_tar" -C "$tmp_extract"
  local extracted_dir
  extracted_dir="$(find "$tmp_extract" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [[ -n "$extracted_dir" ]] || die "tarball 解压后未找到目录"
  sudo_cmd rm -rf "$dir"
  sudo_cmd mkdir -p "$dir"
  cp -a "$extracted_dir/." "$dir/"
  rm -rf "$tmp_tar" "$tmp_extract"
}

clone_or_update() {
  local repo_url="$1"
  local ref="$2"
  local dir="$3"
  local name="$4"
  sudo_cmd mkdir -p "$(dirname "$dir")"
  if [[ -d "$dir/.git" ]]; then
    log "更新 $name: $dir"
    if git -C "$dir" fetch --all --prune 2>/dev/null; then
      git -C "$dir" checkout "$ref"
      git -C "$dir" pull --ff-only || true
      return
    fi
    log "git 更新失败，改用 curl 覆盖下载 $name"
    download_repo_by_curl "$repo_url" "$ref" "$dir" "$name"
    return
  fi
  if [[ -d "$dir" ]] && [[ -n "$(ls -A "$dir" 2>/dev/null)" ]]; then
    log "$name 目录已存在且非空，使用 curl 覆盖下载: $dir"
    download_repo_by_curl "$repo_url" "$ref" "$dir" "$name"
    return
  fi
  log "clone $name: $repo_url -> $dir"
  git clone --branch "$ref" "$repo_url" "$dir" 2>/dev/null || download_repo_by_curl "$repo_url" "$ref" "$dir" "$name"
}

pull_code() {
  clone_or_update "$SERVER_REPO_URL" "$SERVER_REPO_REF" "$SERVER_REPO_DIR" "server"
  clone_or_update "$CLIENT_REPO_URL" "$CLIENT_REPO_REF" "$CLIENT_DIR" "client"
  APP_ROOT="$SERVER_REPO_DIR/match-3-game"
  [[ -f "$APP_ROOT/package.json" ]] || die "cannot find package.json at $APP_ROOT"
}

mysql_root_args() {
  if [[ -n "$MYSQL_ROOT_PASSWORD" ]]; then
    printf -- "-uroot -p%s" "$MYSQL_ROOT_PASSWORD"
  else
    printf -- "-uroot"
  fi
}

init_db() {
  log "=== 初始化数据库和用户 ==="
  sudo_cmd systemctl start mariadb
  local root_args
  root_args="$(mysql_root_args)"
  # shellcheck disable=SC2086
  mysql $root_args <<SQL
CREATE DATABASE IF NOT EXISTS \`$MYSQL_DATABASE\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;
GRANT USAGE ON *.* TO '$MYSQL_APP_USER'@'127.0.0.1' IDENTIFIED BY '$MYSQL_APP_PASSWORD';
GRANT USAGE ON *.* TO '$MYSQL_APP_USER'@'localhost' IDENTIFIED BY '$MYSQL_APP_PASSWORD';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '$MYSQL_APP_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '$MYSQL_APP_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
}

install_app() {
  log "=== 安装应用 ==="
  [[ -f "$APP_ROOT/package.json" ]] || APP_ROOT="$SERVER_REPO_DIR/match-3-game"
  [[ -f "$APP_ROOT/package.json" ]] || die "cannot find package.json at $APP_ROOT"
  (cd "$APP_ROOT" && npm install --omit=dev)

  sudo_cmd tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<UNIT
[Unit]
Description=Match-3 Game Server
After=network.target mariadb.service rsyslog.service
Wants=mariadb.service rsyslog.service

[Service]
Type=simple
WorkingDirectory=$APP_ROOT
Environment=NODE_ENV=$NODE_ENV
Environment=HOST=$APP_HOST
Environment=PORT=$APP_PORT
Environment=CLIENT_ROOT=$CLIENT_DIR
Environment=DB_HOST=127.0.0.1
Environment=DB_PORT=3306
Environment=DB_NAME=$MYSQL_DATABASE
Environment=DB_USER=$MYSQL_APP_USER
Environment=DB_PASSWORD=$MYSQL_APP_PASSWORD
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
  sudo_cmd systemctl daemon-reload
  sudo_cmd systemctl enable "$SERVICE_NAME"
  log "systemd 服务已配置: $SERVICE_NAME"
}

start_app() {
  log "=== 启动应用 ==="
  sudo_cmd systemctl restart mariadb
  sudo_cmd systemctl restart rsyslog || true
  sudo_cmd systemctl restart "$SERVICE_NAME"
  log "启动完成！访问 http://$(detect_server_ip):$APP_PORT/"
}

ACTION="${1:-all}"
case "$ACTION" in
  all)
    install_deps
    pull_code
    init_db
    install_app
    start_app
    ;;
  install-deps) install_deps ;;
  pull) pull_code ;;
  init-db) init_db ;;
  install-app) install_app ;;
  start) start_app ;;
  stop) sudo_cmd systemctl stop "$SERVICE_NAME" ;;
  restart) start_app ;;
  status) sudo_cmd systemctl status "$SERVICE_NAME" --no-pager ;;
  logs) sudo_cmd journalctl -u "$SERVICE_NAME" -f ;;
  help|-h|--help) usage ;;
  *) usage; die "unknown action: $ACTION" ;;
esac
