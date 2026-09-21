#!/usr/bin/env bash
set -euo pipefail

# Tencent tlinux 2.2 / RHEL-like one-shot deploy script.
# 一条龙部署脚本，无需传参，可重复执行。
# 已安装的依赖会自动跳过，已拉取的代码会自动更新。

# --- 日志同时输出到终端和文件 ---
LOG_FILE="${LOG_FILE:-/data/home/user00/mygame/deploy.log}"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "" >> "$LOG_FILE"
echo "===== 部署开始: $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG_FILE"

ACTION="${1:-all}"
APP_NAME="${APP_NAME:-eat-turntable}"
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "$0")" && pwd)}"
BASE_DIR="${BASE_DIR:-$(dirname "$SCRIPT_DIR")}"
SERVER_DIR="${SERVER_DIR:-$SCRIPT_DIR}"
CLIENT_DIR="${CLIENT_DIR:-$BASE_DIR/client}"
SERVER_REPO_URL="${SERVER_REPO_URL:-https://github.com/bonjourtoutlemond/mygame_server}"
CLIENT_REPO_URL="${CLIENT_REPO_URL:-https://github.com/bonjourtoutlemond/mygame_client.git}"
SERVER_REPO_REF="${SERVER_REPO_REF:-main}"
CLIENT_REPO_REF="${CLIENT_REPO_REF:-main}"

MYSQL_DATABASE="${MYSQL_DATABASE:-eat_turntable}"
MYSQL_APP_USER="${MYSQL_APP_USER:-eat_game}"
MYSQL_APP_PASSWORD="${MYSQL_APP_PASSWORD:-eat_game_dev_password}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-8080}"
NODE_ENV="${NODE_ENV:-production}"
GIT_HAS_HTTPS="unknown"  # 在 install_deps 中检测并设置

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

# --- 检测包管理器 ---
detect_pm() {
  if command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  else
    die "dnf/yum not found"
  fi
}

# --- 检查某个 rpm 包是否已安装 ---
is_rpm_installed() {
  rpm -q "$1" >/dev/null 2>&1
}

# --- 检查某个命令是否可用 ---
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

  if [[ -z "$ip_addr" ]]; then
    ip_addr="127.0.0.1"
  fi

  printf '%s' "$ip_addr"
}

usage() {
  cat <<USAGE
Usage:
  ./deploy_tlinux.sh [all|install-deps|pull|init-db|install-app|start|stop|restart|status|logs]

  默认不传参数即执行 all（一条龙部署），可重复执行。

Environment:
  SERVER_REPO_URL      Git URL for server repo. Default: https://github.com/bonjourtoutlemond/mygame_server
  CLIENT_REPO_URL      Git URL for client repo. Default: https://github.com/bonjourtoutlemond/mygame_client.git
  SERVER_REPO_REF      Branch/tag, default main.
  CLIENT_REPO_REF      Branch/tag, default main.
  BASE_DIR             Default /data/home/user00/mygame.
  MYSQL_ROOT_PASSWORD  Optional root password for mysql client.
  MYSQL_APP_USER       Default eat_game.
  MYSQL_APP_PASSWORD   Default eat_game_dev_password.
  MYSQL_DATABASE       Default eat_turntable.
  APP_PORT             Default 8080.

Examples:
  ./deploy_tlinux.sh          # 一条龙部署（等同于 all）
  ./deploy_tlinux.sh status
  journalctl -u eat-turntable -f
USAGE
}

install_deps() {
  log "=== 检查并安装依赖 ==="
  local pm
  pm="$(detect_pm)"

  # 定义需要的包列表：格式为 "rpm包名:验证命令"
  # 如果验证命令存在则跳过安装
  local -a REQUIRED_PKGS=(
    "git:git"
    "git-core:git"
    "curl:curl"
    "tar:tar"
    "gzip:gzip"
    "nodejs:node"
    "npm:npm"
    "mariadb-server:mysqld"
    "mariadb:mysql"
    "rsyslog:rsyslogd"
  )

  local to_install=()
  for entry in "${REQUIRED_PKGS[@]}"; do
    local pkg="${entry%%:*}"
    local cmd="${entry##*:}"
    if is_cmd_available "$cmd" || is_rpm_installed "$pkg"; then
      log "  [跳过] $pkg 已安装"
    else
      log "  [待装] $pkg"
      to_install+=("$pkg")
    fi
  done

  if [[ ${#to_install[@]} -gt 0 ]]; then
    log "安装缺失的包: ${to_install[*]}"
    sudo_cmd "$pm" install -y "${to_install[@]}"
  else
    log "所有依赖包均已安装，无需操作"
  fi

  # 检查 git 是否支持 HTTPS
  GIT_HAS_HTTPS="yes"
  local git_exec_path
  git_exec_path="$(git --exec-path 2>/dev/null || echo '')"
  if [[ -n "$git_exec_path" ]] && [[ -x "${git_exec_path}/git-remote-https" ]]; then
    log "  [跳过] git HTTPS 支持正常"
  else
    log "  [警告] git-remote-https 不可用（tlinux git 版本过低），将使用 curl 下载代码"
    GIT_HAS_HTTPS="no"
  fi

  # 确保 mariadb 和 rsyslog 服务已启用并运行
  if systemctl is-active --quiet mariadb; then
    log "  [跳过] mariadb 服务已运行"
  else
    log "  启动 mariadb 服务..."
    sudo_cmd systemctl enable --now mariadb
  fi

  if systemctl is-active --quiet rsyslog; then
    log "  [跳过] rsyslog 服务已运行"
  else
    log "  启动 rsyslog 服务..."
    sudo_cmd systemctl enable --now rsyslog || true
  fi
}

# --- 将 GitHub HTTPS URL 转换为 tarball 下载地址 ---
# 例: https://github.com/user/repo -> https://github.com/user/repo/archive/refs/heads/main.tar.gz
github_tarball_url() {
  local repo_url="$1"
  local ref="$2"
  # 去掉末尾的 .git
  local base="${repo_url%.git}"
  printf '%s/archive/refs/heads/%s.tar.gz' "$base" "$ref"
}

# --- 通过 curl 下载 tarball 并解压到目标目录 ---
curl_download_repo() {
  local repo_url="$1"
  local ref="$2"
  local dir="$3"
  local name="$4"

  local tarball_url
  tarball_url="$(github_tarball_url "$repo_url" "$ref")"
  local tmp_tar="/tmp/${name}-archive.tar.gz"
  local tmp_extract="/tmp/${name}-extract"

  log "通过 curl 下载 $name: $tarball_url"
  curl -fSL --retry 3 --retry-delay 5 -o "$tmp_tar" "$tarball_url" \
    || die "下载失败: $tarball_url"

  rm -rf "$tmp_extract"
  mkdir -p "$tmp_extract"
  tar xzf "$tmp_tar" -C "$tmp_extract"

  # tarball 解压后会有一个顶层目录（如 mygame_server-main/），需要把内容移到目标目录
  sudo_cmd rm -rf "$dir"
  sudo_cmd mkdir -p "$dir"
  local extracted_dir
  extracted_dir="$(find "$tmp_extract" -mindepth 1 -maxdepth 1 -type d | head -1)"
  if [[ -z "$extracted_dir" ]]; then
    die "tarball 解压后未找到目录"
  fi
  # 移动所有文件（包括隐藏文件）到目标目录
  cp -a "${extracted_dir}/." "$dir/"

  rm -rf "$tmp_tar" "$tmp_extract"
  log "$name 代码已下载到 $dir"
}

clone_or_update() {
  local repo_url="$1"
  local ref="$2"
  local dir="$3"
  local name="$4"

  sudo_cmd mkdir -p "$(dirname "$dir")"

  # 如果目录已存在且有内容（有 package.json 等关键文件），视为已拉取
  if [[ -d "$dir/.git" ]]; then
    log "updating $name: $dir"
    if [[ "$GIT_HAS_HTTPS" == "yes" ]]; then
      git -C "$dir" fetch --all --prune
      git -C "$dir" checkout "$ref"
      git -C "$dir" pull --ff-only || true
    else
      # git 不支持 HTTPS，用 curl 重新下载覆盖
      log "git 不支持 HTTPS，使用 curl 重新下载 $name"
      curl_download_repo "$repo_url" "$ref" "$dir" "$name"
    fi
    return
  fi

  if [[ -z "$repo_url" ]]; then
    [[ -d "$dir" ]] || die "$name repo missing at $dir and ${name^^}_REPO_URL not set"
    log "$name exists without .git, skip clone: $dir"
    return
  fi

  # 如果目录已存在且有内容（之前通过 curl 下载的），跳过
  if [[ -d "$dir" ]] && [[ -n "$(ls -A "$dir" 2>/dev/null)" ]]; then
    log "$name 目录已存在且非空，使用 curl 更新: $dir"
    curl_download_repo "$repo_url" "$ref" "$dir" "$name"
    return
  fi

  # 全新下载
  if [[ "$GIT_HAS_HTTPS" == "yes" ]]; then
    log "cloning $name from $repo_url to $dir"
    sudo_cmd rm -rf "$dir"
    git clone --branch "$ref" "$repo_url" "$dir"
  else
    curl_download_repo "$repo_url" "$ref" "$dir" "$name"
  fi
}

pull_code() {
  clone_or_update "$SERVER_REPO_URL" "$SERVER_REPO_REF" "$SERVER_DIR" "server"
  # 仅在设置了 CLIENT_REPO_URL 时才拉取 client；默认会拉取 mygame_client。
  if [[ -n "$CLIENT_REPO_URL" ]]; then
    clone_or_update "$CLIENT_REPO_URL" "$CLIENT_REPO_REF" "$CLIENT_DIR" "client"
  else
    log "CLIENT_REPO_URL 未设置，跳过 client 代码拉取"
  fi
}

mysql_root_args() {
  if [[ -n "$MYSQL_ROOT_PASSWORD" ]]; then
    printf -- "-uroot -p%s" "$MYSQL_ROOT_PASSWORD"
  else
    printf -- "-uroot"
  fi
}

init_db() {
  log "=== 初始化数据库 ==="
  # 确保 mariadb 正在运行
  if ! systemctl is-active --quiet mariadb; then
    log "mariadb 未运行，先启动..."
    sudo_cmd systemctl start mariadb
  fi

  local root_args
  root_args="$(mysql_root_args)"
  # 兼容旧版 MariaDB（不支持 CREATE USER IF NOT EXISTS）
  # 使用 GRANT 自动创建用户（需开启 NO_AUTO_CREATE_USER 时用存储过程判断）
  # shellcheck disable=SC2086
  mysql $root_args <<SQL
CREATE DATABASE IF NOT EXISTS \`$MYSQL_DATABASE\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;
-- 兼容旧版：先尝试创建用户，已存在则忽略错误
GRANT USAGE ON *.* TO '$MYSQL_APP_USER'@'127.0.0.1' IDENTIFIED BY '$MYSQL_APP_PASSWORD';
GRANT USAGE ON *.* TO '$MYSQL_APP_USER'@'localhost' IDENTIFIED BY '$MYSQL_APP_PASSWORD';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '$MYSQL_APP_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '$MYSQL_APP_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
  log "数据库和用户已就绪"

  # 自动查找 schema.sql 的位置
  local schema_file=""
  if [[ -f "$SERVER_DIR/sql/schema.sql" ]]; then
    schema_file="$SERVER_DIR/sql/schema.sql"
  elif [[ -f "$SERVER_DIR/eat-turntable/sql/schema.sql" ]]; then
    schema_file="$SERVER_DIR/eat-turntable/sql/schema.sql"
  elif [[ -f "$SERVER_DIR/server/eat-turntable/sql/schema.sql" ]]; then
    schema_file="$SERVER_DIR/server/eat-turntable/sql/schema.sql"
  fi

  if [[ -n "$schema_file" ]]; then
    log "导入 schema: $schema_file"
    # shellcheck disable=SC2086
    mysql $root_args "$MYSQL_DATABASE" < "$schema_file"
  else
    log "未找到 schema.sql，跳过 schema 导入"
  fi
}

detect_server_root() {
  if [[ -f "$SERVER_DIR/package.json" ]]; then
    printf '%s' "$SERVER_DIR"
  elif [[ -f "$SERVER_DIR/eat-turntable/package.json" ]]; then
    printf '%s' "$SERVER_DIR/eat-turntable"
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
  local app_root
  app_root="$(detect_server_root)"
  log "=== 安装应用 ==="
  log "安装 npm 依赖: $app_root"
  (cd "$app_root" && npm install --omit=dev)

  # 检测 client 目录（可选）
  local client_root=""
  if [[ -n "$CLIENT_REPO_URL" ]] || [[ -d "$CLIENT_DIR" ]]; then
    client_root="$(detect_client_root 2>/dev/null || true)"
  fi

  local client_env=""
  if [[ -n "$client_root" ]]; then
    client_env="Environment=CLIENT_ROOT=$client_root"
  fi

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
${client_env}
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
  log "systemd 服务已配置"
}

start_app() {
  log "=== 启动应用 ==="
  sudo_cmd systemctl restart mariadb
  sudo_cmd systemctl restart rsyslog || true
  sudo_cmd systemctl restart eat-turntable
  log "启动完成！访问 http://$(detect_server_ip):$APP_PORT"
}

case "$ACTION" in
  all)
    log "=========================================="
    log "  一条龙部署开始（可重复执行）"
    log "=========================================="
    install_deps
    pull_code
    init_db
    install_app
    start_app
    log "=========================================="
    log "  部署完成！"
    log "=========================================="
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
