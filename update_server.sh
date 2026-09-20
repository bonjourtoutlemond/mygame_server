#!/usr/bin/env bash
# 只下载更新 server 代码，不做依赖安装 / 数据库 / 启动等。
# 一条龙执行，无需任何参数，可重复执行。
# 参考 deploy_tlinux.sh：tlinux 老版本 git 无 git-remote-https，
# 因此 git pull HTTPS 失败时会回退为 curl 下载 GitHub tarball。

set -euo pipefail

# --- 日志同时输出到终端和文件 ---
LOG_FILE="${LOG_FILE:-/data/home/user00/mygame/update_server.log}"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "" >> "$LOG_FILE"
echo "===== 更新开始: $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG_FILE"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="${BASE_DIR:-$(dirname "$SCRIPT_DIR")}"
SERVER_DIR="${SERVER_DIR:-$SCRIPT_DIR}"
SERVER_REPO_URL="${SERVER_REPO_URL:-https://github.com/bonjourtoutlemond/mygame_server}"
SERVER_REPO_REF="${SERVER_REPO_REF:-main}"

GIT_HAS_HTTPS="unknown"  # 在检测中设置

log() {
  printf '[eat-update] %s\n' "$*"
}

die() {
  printf '[eat-update][ERROR] %s\n' "$*" >&2
  exit 1
}

# --- 检测 git 是否支持 HTTPS ---
check_git_https() {
  local exec_path
  exec_path="$(git --exec-path 2>/dev/null || echo '')"
  [[ -n "$exec_path" ]] && [[ -x "${exec_path}/git-remote-https" ]]
}

# --- 将 GitHub HTTPS URL 转换为 tarball 下载地址 ---
github_tarball_url() {
  local repo_url="$1"
  local ref="$2"
  local base="${repo_url%.git}"
  printf '%s/archive/refs/heads/%s.tar.gz' "$base" "$ref"
}

# --- 通过 curl 下载 tarball 并覆盖到目标目录 ---
curl_download_repo() {
  local repo_url="$1"
  local ref="$2"
  local dir="$3"
  local tarball_url
  tarball_url="$(github_tarball_url "$repo_url" "$ref")"
  local tmp_tar="/tmp/server-archive.tar.gz"
  local tmp_extract="/tmp/server-extract"

  log "通过 curl 下载 $tarball_url"
  curl -fSL --retry 3 --retry-delay 5 -o "$tmp_tar" "$tarball_url" \
    || die "下载失败: $tarball_url"

  rm -rf "$tmp_extract"
  mkdir -p "$tmp_extract"
  tar xzf "$tmp_tar" -C "$tmp_extract"

  # 清空目标目录内容，但保留 .git 仓库和脚本自身（.sh），避免破坏 git 历史
  mkdir -p "$dir"
  find "$dir" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '*.sh' -exec rm -rf {} +
  local extracted_dir
  extracted_dir="$(find "$tmp_extract" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [[ -n "$extracted_dir" ]] || die "tarball 解压后未找到目录"
  cp -a "${extracted_dir}/." "$dir/"

  rm -rf "$tmp_tar" "$tmp_extract"
  log "代码已更新到 $dir"
}

log "=========================================="
log "  只更新 server 代码（无安装/无数据库）"
log "=========================================="
log "目标目录: $SERVER_DIR"
log "仓库地址: $SERVER_REPO_URL"
log "分支:     $SERVER_REPO_REF"

mkdir -p "$SERVER_DIR"

# 检测 git HTTPS 支持
if check_git_https; then
  GIT_HAS_HTTPS="yes"
  log "[跳过] git HTTPS 支持正常"
else
  GIT_HAS_HTTPS="no"
  log "[警告] git-remote-https 不可用（tlinux git 版本过低），将使用 curl 下载"
fi

# --- 更新策略 ---
if [[ "$GIT_HAS_HTTPS" == "yes" ]]; then
  # git 支持 HTTPS：优先用 git pull（已存在 .git 则更新，否则 clone）
  if [[ -d "$SERVER_DIR/.git" ]]; then
    log "git 更新: $SERVER_DIR"
    (cd "$SERVER_DIR" && git fetch --all --prune && git checkout "$SERVER_REPO_REF" && git pull --ff-only) \
      || die "git pull 失败"
  else
    log "git clone: $SERVER_REPO_URL -> $SERVER_DIR"
    rm -rf "$SERVER_DIR"
    git clone --branch "$SERVER_REPO_REF" "$SERVER_REPO_URL" "$SERVER_DIR" \
      || die "git clone 失败"
  fi
else
  # git 不支持 HTTPS：用 curl 下载（已存在则覆盖）
  if [[ -d "$SERVER_DIR/.git" ]]; then
    log "注意：目录含 .git 但 git 不支持 HTTPS，改用 curl 覆盖下载"
  fi
  curl_download_repo "$SERVER_REPO_URL" "$SERVER_REPO_REF" "$SERVER_DIR"
fi

log "=========================================="
log "  更新完成！"
log "=========================================="
log "如需完整部署（安装依赖+数据库+启动），运行: ./deploy_tlinux.sh"
log "日志: $LOG_FILE"
