#!/usr/bin/env bash
set -euo pipefail

DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="eat_turntable"
DB_USER="eat_game"
DB_PASSWORD="eat_game_dev_password"

mysql_cmd() {
  mysql \
    -h"$DB_HOST" \
    -P"$DB_PORT" \
    -u"$DB_USER" \
    -p"$DB_PASSWORD" \
    "$DB_NAME" \
    "$@"
}

usage() {
  cat <<'USAGE'
Usage:
  ./mysql_console.sh
  ./mysql_console.sh "SELECT * FROM users;"
  ./mysql_console.sh --help

Connection:
  host:     127.0.0.1
  port:     3306
  database: eat_turntable
  user:     eat_game
  password: eat_game_dev_password

Common SQL:
  SHOW TABLES;
  DESC users;
  DESC user_weight_settings;
  DESC spin_history;

  SELECT * FROM users;
  SELECT * FROM user_weight_settings;
  SELECT * FROM spin_history ORDER BY created_at DESC LIMIT 20;

  SELECT id, username, created_at, updated_at FROM users ORDER BY id DESC LIMIT 20;
  SELECT user_id, updated_at, settings_json FROM user_weight_settings ORDER BY updated_at DESC LIMIT 20;
  SELECT id, user_id, choice_name, choice_weight, created_at FROM spin_history ORDER BY created_at DESC LIMIT 20;

Examples:
  ./mysql_console.sh "SHOW TABLES;"
  ./mysql_console.sh "SELECT * FROM users LIMIT 10;"
  ./mysql_console.sh "SELECT * FROM spin_history ORDER BY created_at DESC LIMIT 20;"

Tip:
  Run without SQL to enter interactive mysql mode. Type "exit" to quit.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$#" -eq 0 ]]; then
  mysql_cmd
  exit 0
fi

mysql_cmd -e "$*"
