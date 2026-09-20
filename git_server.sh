#!/usr/bin/env bash
# Linux 版 server git 管理脚本，对应 Windows 下的 git_sever.bat
# 一条龙执行，无需任何参数。
# 参考 deploy_tlinux.sh：当 git 不支持 HTTPS（tlinux 老版本无 git-remote-https）时，
# 自动回退到 SSH 方式推送（push 无法像 clone 那样用 curl 直接替代）。

set -uo pipefail

# --- 日志同时输出到终端和文件 ---
LOG_FILE="${LOG_FILE:-/data/home/user00/mygame/git_server.log}"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "" >> "$LOG_FILE"
echo "===== git_server 开始: $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG_FILE"

# 切换到 server 目录（脚本自身就位于 server 目录）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="${SERVER_DIR:-$SCRIPT_DIR}"
cd "$SERVER_DIR"

DEFAULT_BRANCH="main"
HTTPS_REMOTE_URL="https://github.com/bonjourtoutlemond/mygame_server.git"
SSH_REMOTE_URL="git@github.com:bonjourtoutlemond/mygame_server.git"

BRANCH="$DEFAULT_BRANCH"
MSG="Update server $(date '+%Y-%m-%d %H:%M:%S')"
DO_PULL=1
DO_PUSH=1

require_git() {
  if ! command -v git >/dev/null 2>&1; then
    echo "[ERROR] git not found in PATH."; exit 1
  fi
}

# 检测 git 是否支持 HTTPS（tlinux 老版本 git 可能没有 git-remote-https）
check_git_https() {
  local exec_path
  exec_path="$(git --exec-path 2>/dev/null || echo '')"
  [[ -n "$exec_path" ]] && [[ -x "${exec_path}/git-remote-https" ]]
}

# 是否存在任意一个 SSH 公钥
has_ssh_key() {
  ls ~/.ssh/id_*.pub >/dev/null 2>&1
}

# 自动生成 SSH key，并打印公钥供用户添加到 GitHub
ensure_ssh_key() {
  if has_ssh_key; then
    return 0
  fi
  echo "[INFO] 未检测到 SSH key，自动生成 ed25519 key..."
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -q
  echo ""
  echo "============================================================"
  echo "[ACTION] 请把下面的公钥添加到 GitHub 仓库的 Deploy keys:"
  echo "         https://github.com/bonjourtoutlemond/mygame_server/settings/keys"
  echo "         (勾选 Allow write access)"
  echo "============================================================"
  cat ~/.ssh/id_ed25519.pub
  echo "============================================================"
  echo "[ACTION] 添加后重新运行: ./git_server.sh"
  echo "============================================================"
  return 1
}

require_git

echo "============================================================"
echo "server git script started at $(date '+%Y-%m-%d %H:%M:%S')"
echo "Workdir : $(pwd)"
echo "Branch  : $BRANCH"
echo "Message : $MSG"
echo "============================================================"
echo

# --- 创建/更新 .gitignore（排除 node_modules/data/logs）---
# 用 .gitignore 而非 git add 的 :(exclude) pathsec，避免“路径规格未匹配”报错
cat > .gitignore <<'EOF'
node_modules
data
logs
*.log
EOF

# --- 初始化仓库 ---
if [[ ! -d .git ]]; then
  echo "[INFO] Initializing server repository..."
  git init
else
  echo "[INFO] Existing server repository found."
fi

git branch -M "$BRANCH"

# --- 配置 remote（默认 HTTPS，推送前按需切换 SSH）---
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$HTTPS_REMOTE_URL"
else
  git remote set-url origin "$HTTPS_REMOTE_URL"
fi
echo "[INFO] Remote  : $HTTPS_REMOTE_URL (实际推送地址推送前可能切换)"

# --- pull ---
if [[ "$DO_PULL" -eq 1 ]]; then
  echo "[INFO] Pulling origin/$BRANCH if it exists..."
  if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    git pull origin "$BRANCH" --allow-unrelated-histories --no-edit || \
      echo "[WARN] Pull failed, continuing with local changes."
  else
    echo "[INFO] Remote branch not found or origin unavailable. Skipping pull."
  fi
fi

# --- add ---
echo "[INFO] Staging server files..."
git add -- .

echo "[INFO] Current server status:"
git status --short
echo

# --- commit ---
if ! git diff --cached --quiet; then
  echo "[INFO] Creating commit: $MSG"
  git commit -m "$MSG"
else
  echo "[INFO] Nothing staged to commit."
fi

# --- push ---
if [[ "$DO_PUSH" -eq 1 ]]; then
  if ! git remote get-url origin >/dev/null 2>&1; then
    echo "[INFO] No origin remote configured. Skipping push."
  else
    if check_git_https; then
      # git 原生支持 HTTPS，直接用默认 remote 推送
      echo "[INFO] Pushing via HTTPS..."
      if git push -u origin "$BRANCH" 2>&1; then
        echo "[OK] Push succeeded."
      else
        echo "[ERROR] Push failed. 请查看日志 $LOG_FILE 定位原因。"
      fi
    else
      # git 不支持 HTTPS：参考 deploy_tlinux.sh 的 fallback 思路，改用 SSH
      echo "[WARN] git-remote-https 不可用，回退到 SSH 推送（参考 deploy_tlinux.sh）。"
      if ! ensure_ssh_key; then
        # 本轮已生成 key 并提示用户，待用户添加后下次运行再推送
        echo "[INFO] 未配置 SSH key，本轮仅完成本地提交。按上方提示添加公钥后重跑即可推送。"
      else
        git remote set-url origin "$SSH_REMOTE_URL"
        echo "[INFO] Pulling remote history via SSH before push..."
        if git pull origin "$BRANCH" --allow-unrelated-histories --no-rebase --no-edit 2>&1; then
          echo "[OK] Remote history merged."
        else
          echo "[ERROR] Pull failed (可能存在合并冲突). 请手动解决冲突后重新运行 ./git_server.sh"
          echo "[ERROR] 日志: $LOG_FILE"
          exit 1
        fi
        echo "[INFO] Pushing via SSH: $SSH_REMOTE_URL"
        if git push -u origin "$BRANCH" 2>&1; then
          echo "[OK] Push succeeded."
        else
          echo "[ERROR] SSH push failed. 请确认公钥已添加到 GitHub 且允许写权限。"
          echo "[ERROR] 日志: $LOG_FILE"
        fi
      fi
    fi
  fi
fi

echo
echo "[DONE] Server repository done. Log: $LOG_FILE"
