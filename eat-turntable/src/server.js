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

const match3Tiles = [
  { id: "heart", name: "甜心", image: "/resources/icon/甜心头像-icon-256x256.png" },
  { id: "mint", name: "薄荷", image: "/resources/icon/甜心头像-icon-256x256%20(1).png" },
  { id: "berry", name: "莓果", image: "/resources/icon/甜心头像-icon-256x256%20(2).png" },
  { id: "sun", name: "暖阳", image: "/resources/icon/甜心头像-icon-256x256%20(3).png" },
  { id: "star", name: "星星", image: "/resources/icon/甜心头像-icon-256x256%20(4).png" },
];

const match3SkinCards = [
  ["zodiac_aries", "白羊座", "constellation/150aee206f7ed5fabfa8724ac2419d70-card-512x768.png", "150aee206f7ed5fabfa8724ac2419d70-slap-1024x1024.png"],
  ["zodiac_taurus", "金牛座", "constellation/1991d1344c0b603bb1e6226cbdc4df8d-card-512x768.png", "1991d1344c0b603bb1e6226cbdc4df8d-slap-1024x1024.png"],
  ["zodiac_gemini", "双子座", "constellation/248a39a740a27b1058858d241be9dca2-card-512x768.png", "248a39a740a27b1058858d241be9dca2-slap-1024x1024.png"],
  ["zodiac_cancer", "巨蟹座", "constellation/4f496a0279f670ca8c2e1d457696032c-card-512x768.png", "4f496a0279f670ca8c2e1d457696032c-slap-1024x1024.png"],
  ["zodiac_leo", "狮子座", "constellation/5599d2ae3644c835b08689e77367084d-card-512x768.png", "5599d2ae3644c835b08689e77367084d-slap-1024x1024.png"],
  ["zodiac_virgo", "处女座", "constellation/92a8403e9e660ff3dcc2e54c4c8b542f-card-512x768.png", "92a8403e9e660ff3dcc2e54c4c8b542f-slap-1024x1024.png"],
  ["zodiac_libra", "天秤座", "constellation/b20d4c22422f5e7b389925dab66f0736-card-512x768.png", "b20d4c22422f5e7b389925dab66f0736-slap-1024x1024.png"],
  ["zodiac_scorpio", "天蝎座", "constellation/b67dba4d16d2e50d52eb6d82bf1dbed4-card-512x768.png", "b67dba4d16d2e50d52eb6d82bf1dbed4-slap-1024x1024.png"],
  ["zodiac_sagittarius", "射手座", "constellation/c02dfbcce611d97b314651bba53a34e6-card-512x768.png", "c02dfbcce611d97b314651bba53a34e6-slap-1024x1024.png"],
  ["zodiac_capricorn", "摩羯座", "constellation/f32276163f85ecdee8d2ac77fcbd4679-card-512x768.png", "f32276163f85ecdee8d2ac77fcbd4679-slap-1024x1024.png"],
  ["zodiac_aquarius", "水瓶座", "constellation_zhizhen/09a6bcdefd06cfdd8dd6e58473c326d8-card-512x768.png", "09a6bcdefd06cfdd8dd6e58473c326d8-slap-1024x1024.png"],
  ["zodiac_pisces", "双鱼座", "constellation_zhizhen/ca2f8146228428a8074af677c671072d-card-512x768.png", "ca2f8146228428a8074af677c671072d-slap-1024x1024.png"],
  ["dream_guardian", "梦境守护", "constellation_zhizhen/e11bc1a1d694b7085ce28c4e27b01d6b-card-512x768.png", "e11bc1a1d694b7085ce28c4e27b01d6b-slap-1024x1024.png"],
  ["star_oracle", "星海先知", "constellation_zhizhen/ef099a868dc0e82c487ae13710a333f6-card-512x768.png", "ef099a868dc0e82c487ae13710a333f6-slap-1024x1024.png"],
].map(([id, name, card, slap], index) => ({
  id,
  name,
  rarity: index > 11 ? "SSR" : index % 4 === 0 ? "SR" : "R",
  cardImage: `/resources/card/${card}`,
  slapImage: `/resources/slap/${slap}`,
}));

const match3Albums = [
  {
    id: "album_zodiac",
    name: "星座收集册",
    description: "集齐十二星座卡片后激活，领取大量升级经验。",
    skinIds: match3SkinCards.slice(0, 12).map((card) => card.id),
    rewardExp: 1200,
    rewardEnergy: 30,
  },
];

const match3Levels = Array.from({ length: 12 }, (_, index) => {
  const level = index + 1;
  return {
    id: level,
    name: `星糖试炼 ${level}`,
    tileCount: Math.min(5, 3 + Math.floor(index / 3)),
    timeLimitSec: Math.max(55, 110 - index * 4),
    moveLimit: Math.max(18, 30 - Math.floor(index / 2)),
    targetScore: 900 + index * 420,
    firstChallengeEnergyCost: 8 + Math.floor(index / 4),
    retryEnergyCost: 4 + Math.floor(index / 5),
    firstClearExp: 80 + index * 22,
    retryClearExp: 26 + index * 8,
    failExp: 5 + Math.floor(index / 3),
    rewardEnergy: level % 3 === 0 ? 12 : 5,
    rewardSkinId: match3SkinCards[(level - 1) % match3SkinCards.length].id,
  };
});

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match3_profiles (
      user_id BIGINT UNSIGNED NOT NULL,
      level INT NOT NULL,
      exp INT NOT NULL,
      total_exp INT NOT NULL,
      energy INT NOT NULL,
      energy_daily_cap INT NOT NULL,
      highest_unlocked_level INT NOT NULL,
      active_skin_id VARCHAR(64) NOT NULL DEFAULT '',
      energy_updated_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_match3_profiles_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match3_level_progress (
      user_id BIGINT UNSIGNED NOT NULL,
      level_id INT NOT NULL,
      first_challenged TINYINT NOT NULL,
      cleared TINYINT NOT NULL,
      clear_count INT NOT NULL,
      best_score INT NOT NULL,
      best_stars INT NOT NULL,
      best_time_left INT NOT NULL,
      first_clear_at DATETIME NULL,
      last_played_at DATETIME NULL,
      PRIMARY KEY (user_id, level_id),
      CONSTRAINT fk_match3_level_progress_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match3_skin_cards (
      user_id BIGINT UNSIGNED NOT NULL,
      skin_id VARCHAR(64) NOT NULL,
      owned TINYINT NOT NULL,
      active TINYINT NOT NULL,
      copies INT NOT NULL,
      fragments INT NOT NULL,
      unlocked_at DATETIME NULL,
      PRIMARY KEY (user_id, skin_id),
      CONSTRAINT fk_match3_skin_cards_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match3_albums (
      user_id BIGINT UNSIGNED NOT NULL,
      album_id VARCHAR(64) NOT NULL,
      activated TINYINT NOT NULL,
      reward_claimed TINYINT NOT NULL,
      activated_at DATETIME NULL,
      reward_claimed_at DATETIME NULL,
      PRIMARY KEY (user_id, album_id),
      CONSTRAINT fk_match3_albums_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match3_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      level_id INT NOT NULL,
      energy_cost INT NOT NULL,
      first_challenge TINYINT NOT NULL,
      seed INT NOT NULL,
      status VARCHAR(20) NOT NULL,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      finished_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_match3_sessions_user_status (user_id, status),
      CONSTRAINT fk_match3_sessions_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match3_results (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      session_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      level_id INT NOT NULL,
      success TINYINT NOT NULL,
      score INT NOT NULL,
      stars INT NOT NULL,
      exp_gained INT NOT NULL,
      rewards_json LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_match3_results_user_level (user_id, level_id),
      CONSTRAINT fk_match3_results_user
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

function expToNext(level) {
  return 100 + level * 50;
}

function sameLocalDay(value) {
  if (!value) return false;
  const then = new Date(value);
  const now = new Date();
  return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
}

function getMatch3Level(levelId) {
  return match3Levels.find((level) => level.id === Number(levelId));
}

function getSkin(skinId) {
  return match3SkinCards.find((skin) => skin.id === skinId);
}

function fragmentValue(skin) {
  if (!skin) return 5;
  if (skin.rarity === "SSR") return 80;
  if (skin.rarity === "SR") return 35;
  if (skin.rarity === "R") return 15;
  return 5;
}

async function ensureMatch3Profile(userId) {
  const starterSkin = match3SkinCards[0]?.id || "";
  await pool.execute(
    `INSERT IGNORE INTO match3_profiles
       (user_id, level, exp, total_exp, energy, energy_daily_cap, highest_unlocked_level, active_skin_id, energy_updated_at, created_at, updated_at)
     VALUES (?, 1, 0, 0, 100, 100, 1, ?, NOW(), NOW(), NOW())`,
    [userId, starterSkin]
  );
  if (starterSkin) {
    await pool.execute(
      `INSERT IGNORE INTO match3_skin_cards
         (user_id, skin_id, owned, active, copies, fragments, unlocked_at)
       VALUES (?, ?, 1, 1, 1, 0, NOW())`,
      [userId, starterSkin]
    );
  }

  const [rows] = await pool.execute("SELECT * FROM match3_profiles WHERE user_id = ?", [userId]);
  const profile = rows[0];
  if (profile && !sameLocalDay(profile.energy_updated_at)) {
    await pool.execute(
      "UPDATE match3_profiles SET energy = energy_daily_cap, energy_updated_at = NOW(), updated_at = NOW() WHERE user_id = ?",
      [userId]
    );
    profile.energy = profile.energy_daily_cap;
  }
  return profile;
}

function normalizeProfile(row) {
  return {
    userId: row.user_id,
    level: row.level,
    exp: row.exp,
    totalExp: row.total_exp,
    nextLevelExp: expToNext(row.level),
    energy: row.energy,
    energyDailyCap: row.energy_daily_cap,
    highestUnlockedLevel: row.highest_unlocked_level,
    activeSkinId: row.active_skin_id || "",
  };
}

async function getMatch3State(userId) {
  const profileRow = await ensureMatch3Profile(userId);
  const [progressRows] = await pool.execute("SELECT * FROM match3_level_progress WHERE user_id = ?", [userId]);
  const [skinRows] = await pool.execute("SELECT * FROM match3_skin_cards WHERE user_id = ?", [userId]);
  const [albumRows] = await pool.execute("SELECT * FROM match3_albums WHERE user_id = ?", [userId]);

  const progressByLevel = new Map(progressRows.map((row) => [Number(row.level_id), row]));
  const skinsById = new Map(skinRows.map((row) => [row.skin_id, row]));
  const albumsById = new Map(albumRows.map((row) => [row.album_id, row]));
  const ownedSkinIds = new Set(skinRows.filter((row) => row.owned).map((row) => row.skin_id));

  return {
    config: {
      tiles: match3Tiles,
      levels: match3Levels,
      skins: match3SkinCards,
      albums: match3Albums,
    },
    profile: normalizeProfile(profileRow),
    levels: match3Levels.map((level) => {
      const row = progressByLevel.get(level.id);
      return {
        ...level,
        unlocked: level.id <= profileRow.highest_unlocked_level,
        firstChallenged: Boolean(row?.first_challenged),
        cleared: Boolean(row?.cleared),
        clearCount: row?.clear_count || 0,
        bestScore: row?.best_score || 0,
        bestStars: row?.best_stars || 0,
        bestTimeLeft: row?.best_time_left || 0,
      };
    }),
    skins: match3SkinCards.map((skin) => {
      const row = skinsById.get(skin.id);
      return {
        ...skin,
        owned: Boolean(row?.owned),
        active: Boolean(row?.active),
        copies: row?.copies || 0,
        fragments: row?.fragments || 0,
      };
    }),
    albums: match3Albums.map((album) => {
      const row = albumsById.get(album.id);
      const ownedCount = album.skinIds.filter((skinId) => ownedSkinIds.has(skinId)).length;
      return {
        ...album,
        progress: ownedCount,
        total: album.skinIds.length,
        complete: ownedCount === album.skinIds.length,
        activated: Boolean(row?.activated),
        rewardClaimed: Boolean(row?.reward_claimed),
      };
    }),
  };
}

async function addMatch3Energy(userId, amount) {
  await pool.execute(
    `UPDATE match3_profiles
     SET energy = LEAST(energy_daily_cap, energy + ?), energy_updated_at = NOW(), updated_at = NOW()
     WHERE user_id = ?`,
    [amount, userId]
  );
}

async function applyMatch3Exp(userId, amount) {
  const [rows] = await pool.execute("SELECT * FROM match3_profiles WHERE user_id = ?", [userId]);
  const profile = rows[0];
  const fromLevel = profile.level;
  let level = profile.level;
  let exp = profile.exp + amount;
  while (exp >= expToNext(level)) {
    exp -= expToNext(level);
    level += 1;
  }
  await pool.execute(
    "UPDATE match3_profiles SET level = ?, exp = ?, total_exp = total_exp + ?, updated_at = NOW() WHERE user_id = ?",
    [level, exp, amount, userId]
  );
  return { fromLevel, toLevel: level, leveledUp: level > fromLevel, gained: amount, exp, nextLevelExp: expToNext(level) };
}

async function awardMatch3Skin(userId, skinId) {
  const skin = getSkin(skinId);
  if (!skin) return null;
  const [rows] = await pool.execute("SELECT * FROM match3_skin_cards WHERE user_id = ? AND skin_id = ?", [userId, skinId]);
  if (rows[0]?.owned) {
    const fragments = fragmentValue(skin);
    await pool.execute(
      "UPDATE match3_skin_cards SET copies = copies + 1, fragments = fragments + ? WHERE user_id = ? AND skin_id = ?",
      [fragments, userId, skinId]
    );
    return { type: "fragments", skinId, amount: fragments };
  }
  await pool.execute(
    `INSERT INTO match3_skin_cards (user_id, skin_id, owned, active, copies, fragments, unlocked_at)
     VALUES (?, ?, 1, 0, 1, 0, NOW())
     ON DUPLICATE KEY UPDATE owned = 1, copies = copies + 1, unlocked_at = IFNULL(unlocked_at, NOW())`,
    [userId, skinId]
  );
  return { type: "skin", skin };
}

async function startMatch3Session(userId, levelId) {
  const level = getMatch3Level(levelId);
  if (!level) throw Object.assign(new Error("level not found"), { status: 404 });
  const profile = await ensureMatch3Profile(userId);
  if (level.id > profile.highest_unlocked_level) {
    throw Object.assign(new Error("level is locked"), { status: 403 });
  }

  const [progressRows] = await pool.execute(
    "SELECT * FROM match3_level_progress WHERE user_id = ? AND level_id = ?",
    [userId, level.id]
  );
  const isFirstChallenge = !progressRows[0]?.first_challenged;
  const energyCost = isFirstChallenge ? level.firstChallengeEnergyCost : level.retryEnergyCost;
  if (profile.energy < energyCost) {
    throw Object.assign(new Error("not enough energy"), { status: 402 });
  }

  await pool.execute(
    "UPDATE match3_profiles SET energy = energy - ?, energy_updated_at = NOW(), updated_at = NOW() WHERE user_id = ?",
    [energyCost, userId]
  );
  await pool.execute(
    `INSERT INTO match3_level_progress
       (user_id, level_id, first_challenged, cleared, clear_count, best_score, best_stars, best_time_left, last_played_at)
     VALUES (?, ?, 1, 0, 0, 0, 0, 0, NOW())
     ON DUPLICATE KEY UPDATE first_challenged = 1, last_played_at = NOW()`,
    [userId, level.id]
  );

  const seed = Math.floor(Math.random() * 2147483647);
  const [result] = await pool.execute(
    `INSERT INTO match3_sessions
       (user_id, level_id, energy_cost, first_challenge, seed, status, started_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'started', NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [userId, level.id, energyCost, isFirstChallenge ? 1 : 0, seed, level.timeLimitSec + 15]
  );

  return { sessionId: result.insertId, seed, energyCost, firstChallenge: isFirstChallenge, level };
}

async function finishMatch3Session(userId, sessionId, result) {
  const [sessionRows] = await pool.execute(
    "SELECT * FROM match3_sessions WHERE id = ? AND user_id = ?",
    [Number(sessionId), userId]
  );
  const session = sessionRows[0];
  if (!session) throw Object.assign(new Error("session not found"), { status: 404 });
  if (session.status !== "started") throw Object.assign(new Error("session already finished"), { status: 409 });

  const expired = new Date(session.expires_at).getTime() < Date.now();
  const level = getMatch3Level(session.level_id);
  const score = Math.max(0, Math.floor(Number(result.score) || 0));
  const stars = Math.max(0, Math.min(3, Math.floor(Number(result.stars) || 0)));
  const timeLeft = Math.max(0, Math.floor(Number(result.timeLeft) || 0));
  const success = Boolean(result.success) && !expired && score >= level.targetScore;

  const [progressRows] = await pool.execute(
    "SELECT * FROM match3_level_progress WHERE user_id = ? AND level_id = ?",
    [userId, level.id]
  );
  const firstClear = success && !progressRows[0]?.cleared;
  const expGained = success ? (firstClear ? level.firstClearExp : level.retryClearExp) : level.failExp;
  const rewards = [];

  if (firstClear) {
    await addMatch3Energy(userId, level.rewardEnergy);
    rewards.push({ type: "energy", amount: level.rewardEnergy });
    const skinReward = await awardMatch3Skin(userId, level.rewardSkinId);
    if (skinReward) rewards.push(skinReward);
    await pool.execute(
      "UPDATE match3_profiles SET highest_unlocked_level = GREATEST(highest_unlocked_level, ?), updated_at = NOW() WHERE user_id = ?",
      [Math.min(match3Levels.length, level.id + 1), userId]
    );
  }

  const levelUp = await applyMatch3Exp(userId, expGained);
  await pool.execute(
    `UPDATE match3_level_progress
     SET cleared = GREATEST(cleared, ?),
         clear_count = clear_count + ?,
         best_score = GREATEST(best_score, ?),
         best_stars = GREATEST(best_stars, ?),
         best_time_left = GREATEST(best_time_left, ?),
         first_clear_at = IF(first_clear_at IS NULL AND ? = 1, NOW(), first_clear_at),
         last_played_at = NOW()
     WHERE user_id = ? AND level_id = ?`,
    [success ? 1 : 0, success ? 1 : 0, score, stars, timeLeft, firstClear ? 1 : 0, userId, level.id]
  );
  await pool.execute(
    "UPDATE match3_sessions SET status = ?, finished_at = NOW() WHERE id = ?",
    [success ? "success" : "failed", session.id]
  );
  await pool.execute(
    `INSERT INTO match3_results (session_id, user_id, level_id, success, score, stars, exp_gained, rewards_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [session.id, userId, level.id, success ? 1 : 0, score, stars, expGained, JSON.stringify(rewards)]
  );

  return { success, expired, score, stars, expGained, levelUp, rewards };
}

async function activateMatch3Skin(userId, skinId) {
  const [rows] = await pool.execute(
    "SELECT * FROM match3_skin_cards WHERE user_id = ? AND skin_id = ? AND owned = 1",
    [userId, skinId]
  );
  if (!rows[0]) throw Object.assign(new Error("skin not owned"), { status: 403 });
  await pool.execute("UPDATE match3_skin_cards SET active = 0 WHERE user_id = ?", [userId]);
  await pool.execute("UPDATE match3_skin_cards SET active = 1 WHERE user_id = ? AND skin_id = ?", [userId, skinId]);
  await pool.execute("UPDATE match3_profiles SET active_skin_id = ?, updated_at = NOW() WHERE user_id = ?", [skinId, userId]);
}

async function activateMatch3Album(userId, albumId) {
  const album = match3Albums.find((item) => item.id === albumId);
  if (!album) throw Object.assign(new Error("album not found"), { status: 404 });
  const [rows] = await pool.execute(
    `SELECT skin_id FROM match3_skin_cards
     WHERE user_id = ? AND owned = 1 AND skin_id IN (${album.skinIds.map(() => "?").join(",")})`,
    [userId, ...album.skinIds]
  );
  if (rows.length < album.skinIds.length) throw Object.assign(new Error("album is not complete"), { status: 403 });
  await pool.execute(
    `INSERT INTO match3_albums (user_id, album_id, activated, reward_claimed, activated_at)
     VALUES (?, ?, 1, 0, NOW())
     ON DUPLICATE KEY UPDATE activated = 1, activated_at = IFNULL(activated_at, NOW())`,
    [userId, album.id]
  );
  return album;
}

async function claimMatch3Album(userId, albumId) {
  const album = await activateMatch3Album(userId, albumId);
  const [rows] = await pool.execute(
    "SELECT * FROM match3_albums WHERE user_id = ? AND album_id = ?",
    [userId, album.id]
  );
  if (rows[0]?.reward_claimed) throw Object.assign(new Error("album reward already claimed"), { status: 409 });
  await addMatch3Energy(userId, album.rewardEnergy);
  const levelUp = await applyMatch3Exp(userId, album.rewardExp);
  await pool.execute(
    "UPDATE match3_albums SET reward_claimed = 1, reward_claimed_at = NOW() WHERE user_id = ? AND album_id = ?",
    [userId, album.id]
  );
  return { album, rewards: [{ type: "exp", amount: album.rewardExp }, { type: "energy", amount: album.rewardEnergy }], levelUp };
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

  if (req.method === "GET" && url.pathname === "/api/match3/config") {
    send(res, 200, { ok: true, config: { tiles: match3Tiles, levels: match3Levels, skins: match3SkinCards, albums: match3Albums } });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match3/login") {
    const body = await parseBody(req);
    const user = await findOrCreateUser(body.username, body.password);
    send(res, 200, { ok: true, user, ...(await getMatch3State(user.id)) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/match3/state") {
    const user = await resolveUser({
      userId: url.searchParams.get("userId"),
      username: url.searchParams.get("username"),
    });
    send(res, 200, { ok: true, user, ...(await getMatch3State(user.id)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match3/session/start") {
    const body = await parseBody(req);
    const user = await resolveUser(body);
    const session = await startMatch3Session(user.id, body.levelId);
    send(res, 200, { ok: true, user, session, ...(await getMatch3State(user.id)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match3/session/finish") {
    const body = await parseBody(req);
    const user = await resolveUser(body);
    const result = await finishMatch3Session(user.id, body.sessionId, body);
    send(res, 200, { ok: true, user, result, ...(await getMatch3State(user.id)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match3/skins/activate") {
    const body = await parseBody(req);
    const user = await resolveUser(body);
    await activateMatch3Skin(user.id, body.skinId);
    send(res, 200, { ok: true, user, ...(await getMatch3State(user.id)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match3/albums/activate") {
    const body = await parseBody(req);
    const user = await resolveUser(body);
    const album = await activateMatch3Album(user.id, body.albumId);
    send(res, 200, { ok: true, user, album, ...(await getMatch3State(user.id)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/match3/albums/claim") {
    const body = await parseBody(req);
    const user = await resolveUser(body);
    const result = await claimMatch3Album(user.id, body.albumId);
    send(res, 200, { ok: true, user, result, ...(await getMatch3State(user.id)) });
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
  const clientRoot = path.resolve(CLIENT_ROOT);
  const clientBase = path.basename(clientRoot) === "eat" ? path.dirname(clientRoot) : clientRoot;
  let root = clientRoot;
  let relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");

  if (decoded === "/match-3-game") {
    root = clientBase;
    relative = "match-3-game/index.html";
  } else if (decoded.startsWith("/match-3-game/") || decoded.startsWith("/resources/")) {
    root = clientBase;
    relative = decoded.replace(/^\/+/, "");
    if (relative.endsWith("/")) relative += "index.html";
  }

  const filePath = path.resolve(root, relative);
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
