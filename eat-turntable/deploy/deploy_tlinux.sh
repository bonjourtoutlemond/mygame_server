#!/usr/bin/env bash
set -euo pipefail

# Tencent tlinux 2.2 / RHEL-like one-shot deploy script.
# It can deploy server and client from separate Git repositories, or use paths
# already present on the machine.

ACTION="${1:-all}"
APP_NAME="${APP_NAME:-eat-turntable}"
BASE_DIR="${BASE_DIR:-/opt/$APP_NAME}"
SERVER_DIR="${SERVER_DIR:-$BASE_DIR/server}"
CLIENT_DIR="${CLIENT_DIR:-$BASE_DIR/client}"
SERVER_REPO_URL="${SERVER_REPO_URL:-}"
CLIENT_REPO_URL="${CLIENT_REPO_URL:-}"
SERVER_REPO_REF="${SERVER_REPO_REF:-main}"
CLIENT_REPO_REF="${CLIENT_REPO_REF:-main}"

MYSQL_DATABASE="${MYSQL_DATABASE:-eat_turntable}"
MYSQL_APP_USER="${MYSQL_APP_USER:-eat_game}"
MYSQL_APP_PASSWORD="${MYSQL_APP_PASSWORD:-eat_game_dev_password}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-8080}"
NODE_ENV="${NODE_ENV:-production}"

log() {
  printf '[eat-deploy] %s\n' "$*"
}

die() {
  printf '[eat-deploy][ERROR] %s\n' "$*" >&2
  exit 1
}

sudo_cmd() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

usage() {
  cat <<USAGE
Usage:
  ./deploy_tlinux.sh [all|install-deps|pull|init-db|install-app|start|stop|restart|status|logs]

Environment:
  SERVER_REPO_URL      Git URL for server repo. Optional if SERVER_DIR already exists.
  CLIENT_REPO_URL      Git URL for client repo. Optional if CLIENT_DIR already exists.
  SERVER_REPO_REF      Branch/tag, default main.
  CLIENT_REPO_REF      Branch/tag, default main.
  BASE_DIR             Default /opt/eat-turntable.
  MYSQL_ROOT_PASSWORD  Optional root password for mysql client.
  MYSQL_APP_USER       Default eat_game.
  MYSQL_APP_PASSWORD   Default eat_game_dev_password.
  MYSQL_DATABASE       Default eat_turntable.
  APP_PORT             Default 8080.

Examples:
  SERVER_REPO_URL=https://example.com/eat-server.git \\
  CLIENT_REPO_URL=https://example.com/eat-client.git \\
  MYSQL_APP_PASSWORD='change-me' ./deploy_tlinux.sh all

  ./deploy_tlinux.sh status
  journalctl -u eat-turntable -f
USAGE
}

install_deps() {
  log "installing packages for Tencent tlinux/RHEL-like system"
  local pm=""
  if command -v dnf >/dev/null 2>&1; then
    pm=dnf
  elif command -v yum >/dev/null 2>&1; then
    pm=yum
  else
    die "dnf/yum not found"
  fi

  sudo_cmd "$pm" install -y git curl tar gzip nodejs npm mariadb-server mariadb rsyslog
  sudo_cmd systemctl enable --now mariadb
  sudo_cmd systemctl enable --now rsyslog
}

clone_or_update() {
  local repo_url="$1"
  local ref="$2"
  local dir="$3"
  local name="$4"

  sudo_cmd mkdir -p "$(dirname "$dir")"
  if [[ -d "$dir/.git" ]]; then
    log "updating $name: $dir"
    git -C "$dir" fetch --all --prune
    git -C "$dir" checkout "$ref"
    git -C "$dir" pull --ff-only || true
    return
  fi

  if [[ -z "$repo_url" ]]; then
    [[ -d "$dir" ]] || die "$name repo missing at $dir and ${name^^}_REPO_URL not set"
    log "$name exists without .git, skip clone: $dir"
    return
  fi

  log "cloning $name from $repo_url to $dir"
  sudo_cmd rm -rf "$dir"
  git clone --branch "$ref" "$repo_url" "$dir"
}

pull_code() {
  clone_or_update "$SERVER_REPO_URL" "$SERVER_REPO_REF" "$SERVER_DIR" "server"
  clone_or_update "$CLIENT_REPO_URL" "$CLIENT_REPO_REF" "$CLIENT_DIR" "client"
}

mysql_root_args() {
  if [[ -n "$MYSQL_ROOT_PASSWORD" ]]; then
    printf -- "-uroot -p%s" "$MYSQL_ROOT_PASSWORD"
  else
    printf -- "-uroot"
  fi
}

init_db() {
  log "initializing mysql database/user"
  local root_args
  root_args="$(mysql_root_args)"
  # shellcheck disable=SC2086
  mysql $root_args <<SQL
CREATE DATABASE IF NOT EXISTS \`$MYSQL_DATABASE\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$MYSQL_APP_USER'@'127.0.0.1' IDENTIFIED BY '$MYSQL_APP_PASSWORD';
CREATE USER IF NOT EXISTS '$MYSQL_APP_USER'@'localhost' IDENTIFIED BY '$MYSQL_APP_PASSWORD';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '$MYSQL_APP_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '$MYSQL_APP_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

  if [[ -f "$SERVER_DIR/sql/schema.sql" ]]; then
    # shellcheck disable=SC2086
    mysql $root_args "$MYSQL_DATABASE" < "$SERVER_DIR/sql/schema.sql"
  fi
}

detect_server_root() {
  if [[ -f "$SERVER_DIR/package.json" ]]; then
    printf '%s' "$SERVER_DIR"
  elif [[ -f "$SERVER_DIR/server/eat-turntable/package.json" ]]; then
    printf '%s' "$SERVER_DIR/server/eat-turntable"
  else
    die "cannot find package.json under $SERVER_DIR"
  fi
}

detect_client_root() {
  if [[ -f "$CLIENT_DIR/index.html" ]]; then
    printf '%s' "$CLIENT_DIR"
  elif [[ -f "$CLIENT_DIR/eat/index.html" ]]; then
    printf '%s' "$CLIENT_DIR/eat"
  elif [[ -f "$CLIENT_DIR/client/eat/index.html" ]]; then
    printf '%s' "$CLIENT_DIR/client/eat"
  else
    die "cannot find eat client index.html under $CLIENT_DIR"
  fi
}

install_app() {
  local app_root client_root
  app_root="$(detect_server_root)"
  client_root="$(detect_client_root)"
  log "installing npm dependencies in $app_root"
  (cd "$app_root" && npm install --omit=dev)

  sudo_cmd tee /etc/systemd/system/eat-turntable.service >/dev/null <<UNIT
[Unit]
Description=Eat Turntable Web Game Server
After=network.target mariadb.service rsyslog.service
Wants=mariadb.service rsyslog.service

[Service]
Type=simple
WorkingDirectory=$app_root
Environment=NODE_ENV=$NODE_ENV
Environment=HOST=$APP_HOST
Environment=PORT=$APP_PORT
Environment=CLIENT_ROOT=$client_root
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
  sudo_cmd systemctl enable eat-turntable
}

start_app() {
  sudo_cmd systemctl restart mariadb
  sudo_cmd systemctl restart rsyslog || true
  sudo_cmd systemctl restart eat-turntable
  log "started. open http://SERVER_IP:$APP_PORT"
}

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
  stop) sudo_cmd systemctl stop eat-turntable ;;
  restart) start_app ;;
  status) sudo_cmd systemctl status eat-turntable --no-pager ;;
  logs) sudo_cmd journalctl -u eat-turntable -f ;;
  help|-h|--help) usage ;;
  *) usage; die "unknown action: $ACTION" ;;
esac
