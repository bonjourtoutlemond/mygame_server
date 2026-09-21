const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const mysql = require("mysql2/promise");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const CLIENT_ROOT = process.env.CLIENT_ROOT || path.resolve(__dirname, "../../../client/eat");
const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "eat_game";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "eat_turntable";
const DEFAULT_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'%3E%3Crect width='800' height='600' fill='%23fff4df'/%3E%3Ccircle cx='400' cy='295' r='188' fill='%23ffffff' stroke='%23172026' stroke-width='16'/%3E%3Cellipse cx='400' cy='306' rx='132' ry='96' fill='%23f2b705'/%3E%3Cpath d='M292 250c55-60 168-50 215 9-54 28-158 27-215-9z' fill='%23e84d36'/%3E%3Cpath d='M262 396h276' stroke='%23172026' stroke-width='18' stroke-linecap='round'/%3E%3Ccircle cx='315' cy='300' r='18' fill='%230f8b8d'/%3E%3Ccircle cx='441' cy='342' r='16' fill='%230f8b8d'/%3E%3Ccircle cx='486' cy='286' r='14' fill='%230f8b8d'/%3E%3Ctext x='400' y='112' text-anchor='middle' font-family='Arial,sans-serif' font-size='58' font-weight='800' fill='%23172026'%3E%E4%BB%8A%E5%A4%A9%E5%90%83%E5%95%A5%3F%3C/text%3E%3C/svg%3E";

const defaultItems = [
  { name: "烤鱼", weight: 3, image: DEFAULT_IMAGE },
  { name: "手抓饭", weight: 2, image: DEFAULT_IMAGE },
  { name: "锅盔", weight: 2, image: DEFAULT_IMAGE },
  { name: "牛肉饭", weight: 3, image: DEFAULT_IMAGE },
  { name: "牛杂饭", weight: 2, image: DEFAULT_IMAGE },
  { name: "牛肉拉面", weight: 3, image: DEFAULT_IMAGE },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

let pool;

function log(message, detail = {}) {
  const line = { time: new Date().toISOString(), service: "eat-turntable", message, ...detail };
  console.log(JSON.stringify(line));
}

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  });
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    res.end(body);
  } else {
    res.end(JSON.stringify(body));
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(Object.assign(new Error("request body too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("invalid json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function normalizeUsername(username) {
  return String(username || "").trim().slice(0, 64);
}

function normalizeItem(item) {
  return {
    name: String(item?.name || "").trim().slice(0, 128),
    weight: Math.max(0, Math.min(1000000, Math.floor(Number(item?.weight) || 0))),
    image: String(item?.image || DEFAULT_IMAGE).trim().slice(0, 4096) || DEFAULT_IMAGE,
  };
}

function normalizeItems(items) {
  const normalized = Array.isArray(items)
    ? items.map(normalizeItem).filter((item) => item.name && item.weight > 0)
    : [];
  return normalized.length ? normalized.slice(0, 64) : defaultItems;
}

async function initDb() {
  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL,
      password VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_weight_settings (
      user_id BIGINT UNSIGNED NOT NULL,
      settings_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_weight_settings_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spin_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      choice_name VARCHAR(128) NOT NULL,
      choice_weight INT NOT NULL,
      snapshot_json LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_spin_history_user_created (user_id, created_at),
      CONSTRAINT fk_spin_history_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function findOrCreateUser(username, password = "") {
  const name = normalizeUsername(username);
  if (!name) {
    throw Object.assign(new Error("username is required"), { status: 400 });
  }

  await pool.execute(
    `INSERT INTO users (username, password, created_at, updated_at)
     VALUES (?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       password = IF(password = '', VALUES(password), password),
       updated_at = NOW()`,
    [name, String(password || "").slice(0, 255)]
  );
  const [rows] = await pool.execute("SELECT id, username FROM users WHERE username = ?", [name]);
  return rows[0];
}

async function resolveUser(input) {
  if (input.userId) {
    const [rows] = await pool.execute("SELECT id, username FROM users WHERE id = ?", [Number(input.userId)]);
    if (rows[0]) return rows[0];
  }
  if (input.username) {
    const [rows] = await pool.execute("SELECT id, username FROM users WHERE username = ?", [normalizeUsername(input.username)]);
    if (rows[0]) return rows[0];
  }
  throw Object.assign(new Error("user not found"), { status: 404 });
}

async function getWeights(userId) {
  const [rows] = await pool.execute("SELECT settings_json FROM user_weight_settings WHERE user_id = ?", [userId]);
  if (!rows[0]) {
    return defaultItems;
  }
  const value = rows[0].settings_json;
  return normalizeItems(typeof value === "string" ? JSON.parse(value) : value);
}

async function saveWeights(userId, items) {
  const normalized = normalizeItems(items);
  await pool.execute(
    `INSERT INTO user_weight_settings (user_id, settings_json, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = NOW()`,
    [userId, JSON.stringify(normalized)]
  );
  return normalized;
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let ticket = Math.random() * total;
  for (const item of items) {
    ticket -= item.weight;
    if (ticket <= 0) return item;
  }
  return items[items.length - 1];
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    send(res, 200, { ok: true, service: "eat-turntable", db: DB_NAME });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await parseBody(req);
    const user = await findOrCreateUser(body.username, body.password);
    const items = await getWeights(user.id);
    send(res, 200, { ok: true, user, items });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/weights") {
    const user = await resolveUser({
      userId: url.searchParams.get("userId"),
      username: url.searchParams.get("username"),
    });
    send(res, 200, { ok: true, user, items: await getWeights(user.id) });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/weights") {
    const body = await parseBody(req);
    const user = await resolveUser(body);
    send(res, 200, { ok: true, user, items: await saveWeights(user.id, body.items) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/spin") {
    const body = await parseBody(req);
    const user = await resolveUser(body);
    const items = await getWeights(user.id);
    const winner = pickWeighted(items);
    await pool.execute(
      "INSERT INTO spin_history (user_id, choice_name, choice_weight, snapshot_json, created_at) VALUES (?, ?, ?, ?, NOW())",
      [user.id, winner.name, winner.weight, JSON.stringify(items)]
    );
    send(res, 200, { ok: true, user, winner, items });
    return;
  }

  send(res, 404, { ok: false, error: "api route not found" });
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = path.resolve(CLIENT_ROOT, relative);
  const root = path.resolve(CLIENT_ROOT);
  const pathFromRoot = path.relative(root, filePath);
  return pathFromRoot && !pathFromRoot.startsWith("..") && !path.isAbsolute(pathFromRoot) ? filePath : null;
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(req.url || "/");
  if (!filePath) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : error.message, "text/plain; charset=utf-8");
      return;
    }
    send(res, 200, content, mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  });
}

async function main() {
  await initDb();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      handleApi(req, res, url).catch((error) => {
        log("api_error", { path: url.pathname, error: error.message });
        send(res, error.status || 500, { ok: false, error: error.message || "internal error" });
      });
      return;
    }
    serveStatic(req, res);
  });

  server.listen(PORT, HOST, () => {
    log("started", { host: HOST, port: PORT, clientRoot: CLIENT_ROOT, db: `${DB_HOST}:${DB_PORT}/${DB_NAME}` });
  });
}

main().catch((error) => {
  log("fatal", { error: error.stack || error.message });
  process.exit(1);
});
