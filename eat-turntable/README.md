# Eat Turntable Server

This is the server side for the mobile-friendly turntable web game. It is
intentionally separate from the browser client so the Linux server repo and the
Windows/client repo can be developed and deployed independently.

## Why Not Use `mmorpg_demo3`

Use `mmorpg_demo3` as a reference only. Its dbcache/inter/game topology is useful
for learning, but too heavy for this game. This project keeps the public web game
server small:

- one HTTP server
- one MySQL database
- one static mobile web client root
- JSON APIs for login, weight settings, and spin results

Recommended split:

- `server/eat-turntable` becomes the Linux server Git repository.
- `client/eat` becomes the web/mobile-web client Git repository.
- `client/native`, `client/gateway`, and `client/protocol` remain reusable
  references for Windows client, web gateway, mobile app, and mobile web
  protocol work.

The deploy script already accepts separate `SERVER_REPO_URL` and
`CLIENT_REPO_URL`, so the Linux machine can pull server code while Windows keeps
client development independent.

## API

- `POST /api/login`
  - Body: `{"username":"alice","password":"dev"}`
  - Password is saved but not checked yet.
- `GET /api/weights?userId=1` or `GET /api/weights?username=alice`
- `PUT /api/weights`
  - Body: `{"userId":1,"items":[{"name":"烤鱼","weight":3,"image":"..."}]}`
- `POST /api/spin`
  - Body: `{"userId":1}` or `{"username":"alice"}`

## Local Run

```powershell
cd E:\ace\server\eat-turntable
npm install
$env:DB_USER="eat_game"
$env:DB_PASSWORD="eat_game_dev_password"
$env:CLIENT_ROOT="E:\ace\client\eat"
npm start
```

Open:

```text
http://127.0.0.1:8080
```

The server serves `E:\ace\client\eat` by default when run from this repository.
Set `CLIENT_ROOT` only when the client lives in another checkout.

## Tencent tlinux Deploy

On the cloud server:

```bash
curl -fsSL -o deploy_tlinux.sh https://example.com/deploy_tlinux.sh
chmod +x deploy_tlinux.sh
SERVER_REPO_URL=https://github.com/bonjourtoutlemond/mygame_server.git \
CLIENT_REPO_URL=https://github.com/bonjourtoutlemond/mygame_client.git \
MYSQL_APP_PASSWORD='change-me' \
./deploy_tlinux.sh all
```

The deploy script installs Git, Node.js, npm, MariaDB, and rsyslog; pulls server
and client repositories; initializes MySQL; installs npm dependencies; creates a
systemd service; starts the database, log service, and web game server.

Useful operations:

```bash
./deploy_tlinux.sh status
./deploy_tlinux.sh logs
./deploy_tlinux.sh restart
```
