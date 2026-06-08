const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const crypto = require("crypto");
const dns = require("dns").promises;
const { execFile, spawn } = require("child_process");

const host = "0.0.0.0";
const port = 8210;
const panelRoot = __dirname;
const serverRoot = path.resolve(panelRoot, "..");
const publicRoot = path.join(panelRoot, "public");
const authPath = path.join(panelRoot, "panel-auth.json");
const auditPath = path.join(panelRoot, "panel-audit.jsonl");
const settingsPath = path.join(serverRoot, "Pal", "Saved", "Config", "WindowsServer", "PalWorldSettings.ini");
const gameUserSettingsPath = path.join(serverRoot, "Pal", "Saved", "Config", "WindowsServer", "GameUserSettings.ini");
const saveGamesPath = path.join(serverRoot, "Pal", "Saved", "SaveGames");
const worldRootPath = path.join(saveGamesPath, "0");
const logsPath = path.join(serverRoot, "Pal", "Saved", "Logs");
const backupsPath = path.join(panelRoot, "backups");
const worldNotesPath = path.join(panelRoot, "world-notes.json");
const worldConfigsPath = path.join(panelRoot, "world-configs.json");
const eventsPath = path.join(panelRoot, "panel-events.log");
const playerEventsPath = path.join(panelRoot, "player-events.jsonl");
const usersPath = path.join(panelRoot, "panel-users.json");
const schedulesPath = path.join(panelRoot, "panel-schedules.json");
const playerNotesPath = path.join(panelRoot, "player-notes.json");
const monitorPath = path.join(panelRoot, "monitor-history.json");
const updateLogPath = path.join(panelRoot, "update.log");

fs.mkdirSync(backupsPath, { recursive: true });
let lastOnlinePlayers = new Map();
let playerPollStarted = false;
let schedulerStarted = false;
let scannedLogOffsets = new Map();
const sessions = new Map();

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function ensureAuthConfig() {
  if (fs.existsSync(authPath)) {
    return JSON.parse(fs.readFileSync(authPath, "utf8"));
  }
  const password = `Pal-${randomToken(6)}`;
  const salt = randomToken(16);
  const config = {
    username: "admin",
    salt,
    passwordHash: hashPassword(password, salt),
    initialPassword: password,
    createdAt: new Date().toLocaleString("sv-SE")
  };
  fs.writeFileSync(authPath, JSON.stringify(config, null, 2), "utf8");
  return config;
}

function authConfig() {
  return ensureAuthConfig();
}

function readJsonFile(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function ensureUsers() {
  const config = authConfig();
  const users = readJsonFile(usersPath, null);
  if (Array.isArray(users) && users.length) return users;
  const initial = [{
    username: config.username || "admin",
    role: "admin",
    salt: config.salt,
    passwordHash: config.passwordHash,
    createdAt: config.createdAt || new Date().toLocaleString("sv-SE")
  }];
  writeJsonFile(usersPath, initial);
  return initial;
}

function panelUsers() {
  return ensureUsers();
}

function publicUsers() {
  return panelUsers().map((user) => ({
    username: user.username,
    role: user.role || "operator",
    createdAt: user.createdAt || ""
  }));
}

function findPanelUser(username) {
  return panelUsers().find((user) => user.username === username);
}

function canWrite(req) {
  const session = getSession(req);
  return Boolean(session && session.role !== "viewer");
}

function requireWrite(req) {
  if (!canWrite(req)) throw new Error("当前账号是只读权限，不能执行该操作。");
}

function requireAdmin(req) {
  const session = getSession(req);
  if (!session || session.role !== "admin") throw new Error("需要管理员权限。");
}

function cookieValue(req, name) {
  const cookie = req.headers.cookie || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function getSession(req) {
  const token = cookieValue(req, "palpanel_session");
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expires) {
    sessions.delete(token);
    return null;
  }
  session.expires = Date.now() + 12 * 60 * 60 * 1000;
  return session;
}

function isAuthenticated(req) {
  return Boolean(getSession(req));
}

function requestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const raw = forwarded || req.socket.remoteAddress || "";
  return raw.replace(/^::ffff:/, "") || "unknown";
}

async function reverseHostname(ip) {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") return os.hostname();
  try {
    const names = await dns.reverse(ip);
    return names[0] || "";
  } catch {
    return "";
  }
}

async function auditEvent(req, action, detail = {}, success = true, username = "") {
  const ip = requestIp(req);
  const session = getSession(req);
  const record = {
    time: new Date().toLocaleString("sv-SE"),
    user: username || (session && session.username) || "",
    ip,
    computerName: await reverseHostname(ip),
    action,
    success,
    detail,
    userAgent: req.headers["user-agent"] || ""
  };
  fs.appendFileSync(auditPath, `${JSON.stringify(record)}\n`, "utf8");
}

function readAuditLogs(limit = 500, filters = {}) {
  if (!fs.existsSync(auditPath)) return [];
  const action = String(filters.action || "all");
  const result = String(filters.result || "all");
  const keyword = String(filters.keyword || "").toLowerCase();
  return fs.readFileSync(auditPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((item) => action === "all" || item.action === action)
    .filter((item) => result === "all" || String(Boolean(item.success)) === result)
    .filter((item) => {
      if (!keyword) return true;
      return JSON.stringify(item).toLowerCase().includes(keyword);
    })
    .slice(-Math.max(1, Math.min(2000, Number(limit) || 500)))
    .reverse();
}

const specificAuditPaths = new Set([
  "/api/config",
  "/api/config/raw",
  "/api/worlds/switch",
  "/api/worlds/restore"
]);

const configFieldLabels = {
  Difficulty: "难度",
  RandomizerType: "随机化类型",
  RandomizerSeed: "随机种子",
  bIsRandomizerPalLevelRandom: "随机帕鲁等级",
  DayTimeSpeedRate: "白天流逝速度",
  NightTimeSpeedRate: "夜晚流逝速度",
  ExpRate: "经验倍率",
  PalCaptureRate: "捕获倍率",
  PalSpawnNumRate: "帕鲁刷新倍率",
  PalDamageRateAttack: "帕鲁攻击伤害倍率",
  PalDamageRateDefense: "帕鲁承伤倍率",
  PlayerDamageRateAttack: "玩家攻击伤害倍率",
  PlayerDamageRateDefense: "玩家承伤倍率",
  PlayerStomachDecreaceRate: "玩家饥饿消耗倍率",
  PlayerStaminaDecreaceRate: "玩家体力消耗倍率",
  PlayerAutoHPRegeneRate: "玩家生命自然恢复倍率",
  PlayerAutoHpRegeneRateInSleep: "玩家睡眠生命恢复倍率",
  PalStomachDecreaceRate: "帕鲁饥饿消耗倍率",
  PalStaminaDecreaceRate: "帕鲁体力消耗倍率",
  PalAutoHPRegeneRate: "帕鲁生命自然恢复倍率",
  PalAutoHpRegeneRateInSleep: "帕鲁睡眠生命恢复倍率",
  BuildObjectHpRate: "建筑生命倍率",
  BuildObjectDamageRate: "建筑受伤倍率",
  BuildObjectDeteriorationDamageRate: "建筑劣化伤害倍率",
  CollectionDropRate: "采集掉落倍率",
  CollectionObjectHpRate: "采集物生命倍率",
  CollectionObjectRespawnSpeedRate: "采集物刷新速度倍率",
  EnemyDropItemRate: "敌人掉落倍率",
  DeathPenalty: "死亡惩罚",
  bEnablePlayerToPlayerDamage: "允许玩家互相伤害",
  bEnableFriendlyFire: "允许友伤",
  bEnableInvaderEnemy: "启用袭击事件",
  bActiveUNKO: "启用未使用参数 UNKO",
  bEnableAimAssistPad: "手柄辅助瞄准",
  bEnableAimAssistKeyboard: "键鼠辅助瞄准",
  DropItemMaxNum: "掉落物最大数量",
  DropItemMaxNum_UNKO: "UNKO 掉落物最大数量",
  BaseCampMaxNum: "据点最大数量",
  BaseCampWorkerMaxNum: "据点工作帕鲁上限",
  DropItemAliveMaxHours: "掉落物保留小时数",
  bAutoResetGuildNoOnlinePlayers: "无在线玩家时自动重置公会",
  AutoResetGuildTimeNoOnlinePlayers: "公会无在线玩家重置小时数",
  GuildPlayerMaxNum: "公会玩家上限",
  BaseCampMaxNumInGuild: "公会据点上限",
  PalEggDefaultHatchingTime: "默认孵蛋小时数",
  WorkSpeedRate: "工作速度倍率",
  AutoSaveSpan: "自动保存间隔秒数",
  bIsMultiplay: "多人模式",
  bIsPvP: "PvP 模式",
  bHardcore: "硬核模式",
  bPalLost: "死亡丢失帕鲁",
  bCharacterRecreateInHardcore: "硬核模式允许重建角色",
  bCanPickupOtherGuildDeathPenaltyDrop: "可拾取其他公会死亡掉落",
  bEnableNonLoginPenalty: "启用未登录惩罚",
  bEnableFastTravel: "允许快速传送",
  bEnableFastTravelOnlyBaseCamp: "仅允许据点快速传送",
  bIsStartLocationSelectByMap: "允许地图选择出生点",
  bExistPlayerAfterLogout: "玩家离线后角色保留",
  bEnableDefenseOtherGuildPlayer: "允许防御其他公会玩家",
  bInvisibleOtherGuildBaseCampAreaFX: "隐藏其他公会据点范围特效",
  bBuildAreaLimit: "启用建造区域限制",
  ItemWeightRate: "物品重量倍率",
  CoopPlayerMaxNum: "合作玩家上限",
  ServerPlayerMaxNum: "服务器人数上限",
  ServerName: "服务器名称",
  ServerDescription: "服务器描述",
  AdminPassword: "管理员密码",
  ServerPassword: "服务器密码",
  bAllowClientMod: "允许客户端 Mod",
  PublicPort: "游戏端口",
  PublicIP: "公网 IP",
  RCONEnabled: "启用 RCON",
  RCONPort: "RCON 端口",
  Region: "服务器区域",
  bUseAuth: "启用认证",
  BanListURL: "封禁列表地址",
  RESTAPIEnabled: "启用 REST API",
  RESTAPIPort: "REST API 端口",
  bShowPlayerList: "显示玩家列表",
  ChatPostLimitPerMinute: "每分钟聊天发送限制",
  CrossplayPlatforms: "跨平台列表",
  bIsUseBackupSaveData: "启用备份存档数据",
  LogFormatType: "日志格式",
  bIsShowJoinLeftMessage: "显示加入离开消息",
  SupplyDropSpan: "补给掉落间隔",
  EnablePredatorBossPal: "启用掠食者 Boss 帕鲁",
  MaxBuildingLimitNum: "最大建筑数量限制",
  ServerReplicatePawnCullDistance: "服务器角色同步裁剪距离",
  bAllowGlobalPalboxExport: "允许全局帕鲁箱导出",
  bAllowGlobalPalboxImport: "允许全局帕鲁箱导入",
  EquipmentDurabilityDamageRate: "装备耐久损耗倍率",
  ItemContainerForceMarkDirtyInterval: "容器强制标记变更间隔",
  ItemCorruptionMultiplier: "物品腐坏倍率",
  DenyTechnologyList: "禁用科技列表",
  GuildRejoinCooldownMinutes: "重新加入公会冷却分钟数",
  BlockRespawnTime: "阻止重生时间",
  RespawnPenaltyDurationThreshold: "重生惩罚持续阈值",
  RespawnPenaltyTimeScale: "重生惩罚时间倍率",
  bDisplayPvPItemNumOnWorldMap_BaseCamp: "地图显示据点 PvP 物品数量",
  bDisplayPvPItemNumOnWorldMap_Player: "地图显示玩家 PvP 物品数量",
  AdditionalDropItemWhenPlayerKillingInPvPMode: "PvP 击杀玩家额外掉落物",
  AdditionalDropItemNumWhenPlayerKillingInPvPMode: "PvP 击杀玩家额外掉落数量",
  bAdditionalDropItemWhenPlayerKillingInPvPMode: "启用 PvP 击杀玩家额外掉落",
  bAllowEnhanceStat_Health: "允许强化生命",
  bAllowEnhanceStat_Attack: "允许强化攻击",
  bAllowEnhanceStat_Stamina: "允许强化体力",
  bAllowEnhanceStat_Weight: "允许强化负重",
  bAllowEnhanceStat_WorkSpeed: "允许强化工作速度"
};

function configFieldLabel(key) {
  return configFieldLabels[key] || key;
}

function auditConfigFields(updates) {
  const sensitive = new Set(["AdminPassword", "ServerPassword"]);
  return Object.keys(updates || {}).map((key) => ({
    field: configFieldLabel(key),
    key,
    sensitive: sensitive.has(key)
  }));
}

function changedConfigFields(before, updates) {
  const sensitive = new Set(["AdminPassword", "ServerPassword"]);
  const comparableValue = (value) => {
    const text = stripQuotes(value);
    if (/^(true|false)$/i.test(text)) return text.toLowerCase();
    if (/^-?\d+(\.\d+)?$/.test(text)) return String(Number(text));
    return text;
  };
  return Object.keys(updates || {})
    .filter((key) => {
      if (!Object.prototype.hasOwnProperty.call(before, key)) return true;
      return comparableValue(before[key]) !== comparableValue(updates[key]);
    })
    .map((key) => ({
      field: configFieldLabel(key),
      key,
      oldValue: sensitive.has(key) ? "<敏感>" : stripQuotes(before[key]),
      newValue: sensitive.has(key) ? "<敏感>" : String(updates[key]),
      sensitive: sensitive.has(key)
    }));
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `palpanel_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "palpanel_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function event(message) {
  fs.appendFileSync(eventsPath, `${new Date().toLocaleString("sv-SE")} ${message}\n`, "utf8");
}

function playerEvent(record) {
  const next = {
    time: new Date().toLocaleString("sv-SE"),
    type: "event",
    player: "",
    playerId: "",
    message: "",
    source: "panel",
    ...record
  };
  fs.appendFileSync(playerEventsPath, `${JSON.stringify(next)}\n`, "utf8");
}

function sendJson(res, data, code = 200) {
  const body = Buffer.from(JSON.stringify(data, null, 2), "utf8");
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendTextError(res, code, message) {
  sendJson(res, { ok: false, error: message }, code);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function run(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 15000, ...options }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

async function ps(command) {
  const result = await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
  if (result.error && !result.stdout.trim()) return "";
  return result.stdout;
}

function readSettingsRaw() {
  if (!fs.existsSync(settingsPath)) return "";
  return fs.readFileSync(settingsPath, "utf8");
}

function splitOptionSettings(raw) {
  const match = raw.match(/OptionSettings=\(([\s\S]*)\)/);
  if (!match) return [];

  const text = match[1];
  const items = [];
  let buf = "";
  let inQuote = false;
  let depth = 0;

  for (const ch of text) {
    if (ch === '"') {
      inQuote = !inQuote;
      buf += ch;
      continue;
    }
    if (!inQuote) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        items.push(buf);
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  if (buf) items.push(buf);
  return items;
}

function settingsMap() {
  const map = {};
  for (const item of splitOptionSettings(readSettingsRaw())) {
    const idx = item.indexOf("=");
    if (idx > 0) {
      map[item.slice(0, idx).trim()] = item.slice(idx + 1).trim();
    }
  }
  return map;
}

function stripQuotes(value) {
  return String(value ?? "").replace(/^"|"$/g, "");
}

function isTrue(value) {
  return stripQuotes(value).toLowerCase() === "true";
}

const stringSettingKeys = new Set([
  "RandomizerSeed",
  "ServerName",
  "ServerDescription",
  "AdminPassword",
  "ServerPassword",
  "PublicIP",
  "Region",
  "BanListURL",
  "LogFormatType",
  "AdditionalDropItemWhenPlayerKillingInPvPMode"
]);

function settingValue(value, key = "") {
  if (value === null || value === undefined) return '""';
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  const text = String(value);
  if (stringSettingKeys.has(key)) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  if (/^(True|False|None|\d+(\.\d+)?|\(.*\)|https?:\/\/.*)$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function updateSettings(updates) {
  const raw = readSettingsRaw();
  if (!raw.trim()) throw new Error(`Settings file is empty: ${settingsPath}`);

  const seen = new Set();
  const items = splitOptionSettings(raw).map((item) => {
    const idx = item.indexOf("=");
    if (idx <= 0) return item;
    const key = item.slice(0, idx).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      return `${key}=${settingValue(updates[key], key)}`;
    }
    return item;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) items.push(`${key}=${settingValue(value, key)}`);
  }

  const next = raw.replace(/OptionSettings=\([\s\S]*\)/, `OptionSettings=(${items.join(",")})`);
  fs.writeFileSync(settingsPath, next, "utf8");
}

function readWorldNotes() {
  if (!fs.existsSync(worldNotesPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(worldNotesPath, "utf8"));
  } catch {
    return {};
  }
}

function writeWorldNotes(notes) {
  fs.writeFileSync(worldNotesPath, JSON.stringify(notes, null, 2), "utf8");
}

function readWorldConfigs() {
  if (!fs.existsSync(worldConfigsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(worldConfigsPath, "utf8"));
  } catch {
    return {};
  }
}

function writeWorldConfigs(configs) {
  fs.writeFileSync(worldConfigsPath, JSON.stringify(configs, null, 2), "utf8");
}

function backupCurrentSettings(reason = "manual") {
  fs.mkdirSync(backupsPath, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const target = path.join(backupsPath, `settings-${reason}-${stamp}.ini`);
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, target);
  }
  return target;
}

function currentWorldId() {
  if (!fs.existsSync(gameUserSettingsPath)) return "";
  const raw = fs.readFileSync(gameUserSettingsPath, "utf8");
  const match = raw.match(/^DedicatedServerName=(.+)$/m);
  return match ? match[1].trim() : "";
}

function setCurrentWorldId(worldId) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(worldId)) throw new Error("Invalid world id.");
  let raw = fs.existsSync(gameUserSettingsPath) ? fs.readFileSync(gameUserSettingsPath, "utf8") : "";
  if (/^DedicatedServerName=.+$/m.test(raw)) {
    raw = raw.replace(/^DedicatedServerName=.+$/m, `DedicatedServerName=${worldId}`);
  } else {
    if (raw && !raw.endsWith("\n")) raw += "\n";
    raw += `DedicatedServerName=${worldId}\n`;
  }
  fs.writeFileSync(gameUserSettingsPath, raw, "utf8");
}

function worldPath(worldId) {
  return path.join(worldRootPath, worldId);
}

function folderSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += folderSize(full);
    if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function listWorlds() {
  fs.mkdirSync(worldRootPath, { recursive: true });
  const current = currentWorldId();
  const notes = readWorldNotes();
  const configs = readWorldConfigs();
  const worldBackups = listWorldBackups();
  const worlds = fs.readdirSync(worldRootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const id = entry.name;
      const dir = worldPath(id);
      const level = path.join(dir, "Level.sav");
      const meta = path.join(dir, "LevelMeta.sav");
      const stat = fs.statSync(dir);
      return {
        id,
        name: notes[id] || "",
        active: id === current,
        created: fs.existsSync(level) || fs.existsSync(meta),
        sizeMb: Math.round((folderSize(dir) / 1024 / 1024) * 100) / 100,
        lastWriteTime: stat.mtime.toLocaleString("sv-SE"),
        hasLevel: fs.existsSync(level),
        hasLevelMeta: fs.existsSync(meta),
        hasConfig: Boolean(configs[id] && configs[id].raw),
        backups: worldBackups[id] || []
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.lastWriteTime.localeCompare(a.lastWriteTime));
  return { current, worlds };
}

function parseWorldBackupName(name) {
  const match = String(name || "").match(/^world-([A-Za-z0-9_-]{8,64})-(\d{8}-\d{6})\.zip$/);
  if (!match) return null;
  return { worldId: match[1], stamp: match[2] };
}

function listWorldBackups() {
  fs.mkdirSync(backupsPath, { recursive: true });
  const grouped = {};
  for (const entry of fs.readdirSync(backupsPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const parsed = parseWorldBackupName(entry.name);
    if (!parsed) continue;
    const full = path.join(backupsPath, entry.name);
    const stat = fs.statSync(full);
    const item = {
      name: entry.name,
      worldId: parsed.worldId,
      stamp: parsed.stamp,
      sizeMb: Math.round((stat.size / 1024 / 1024) * 100) / 100,
      createdAt: stat.mtime.toLocaleString("sv-SE")
    };
    if (!grouped[parsed.worldId]) grouped[parsed.worldId] = [];
    grouped[parsed.worldId].push(item);
  }
  Object.values(grouped).forEach((items) => items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  return grouped;
}

function generateWorldId() {
  const chars = "0123456789ABCDEF";
  let id = "";
  for (let i = 0; i < 32; i += 1) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function assertServerStopped() {
  const current = await status();
  if (current.running) throw new Error("Please stop the server before changing worlds.");
}

async function createWorld(name) {
  await assertServerStopped();
  const id = generateWorldId();
  fs.mkdirSync(worldPath(id), { recursive: true });
  setCurrentWorldId(id);
  if (name) {
    const notes = readWorldNotes();
    notes[id] = String(name).trim();
    writeWorldNotes(notes);
  }
  event(`create world ${id}`);
  return { id, worlds: listWorlds() };
}

async function switchWorld(worldId) {
  await assertServerStopped();
  if (!fs.existsSync(worldPath(worldId))) throw new Error("World not found.");
  backupCurrentSettings("before-world-switch");
  setCurrentWorldId(worldId);
  applyWorldConfigIfExists(worldId);
  event(`switch world ${worldId}`);
  return listWorlds();
}

async function backupWorld(worldId) {
  if (!fs.existsSync(worldPath(worldId))) throw new Error("World not found.");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const target = path.join(backupsPath, `world-${worldId}-${stamp}.zip`);
  const escapedWorld = worldPath(worldId).replace(/'/g, "''");
  const escapedTarget = target.replace(/'/g, "''");
  await ps(`Compress-Archive -LiteralPath '${escapedWorld}' -DestinationPath '${escapedTarget}' -Force`);
  event(`backup world ${worldId}`);
  return { name: path.basename(target), sizeMb: Math.round((fs.statSync(target).size / 1024 / 1024) * 100) / 100 };
}

async function restoreWorld(worldId, backupName) {
  await assertServerStopped();
  if (!fs.existsSync(worldPath(worldId))) throw new Error("World not found.");
  const parsed = parseWorldBackupName(backupName);
  if (!parsed || parsed.worldId !== worldId) throw new Error("Invalid backup for this world.");

  const backupFile = path.resolve(backupsPath, backupName);
  if (!backupFile.startsWith(backupsPath) || !fs.existsSync(backupFile)) throw new Error("Backup file not found.");

  await backupWorld(worldId);

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const tempRoot = path.join(backupsPath, `restore-${worldId}-${stamp}`);
  const escapedBackup = backupFile.replace(/'/g, "''");
  const escapedTemp = tempRoot.replace(/'/g, "''");
  fs.mkdirSync(tempRoot, { recursive: true });

  try {
    await ps(`Expand-Archive -LiteralPath '${escapedBackup}' -DestinationPath '${escapedTemp}' -Force`);
    const entries = fs.readdirSync(tempRoot, { withFileTypes: true });
    const extractedDir = entries.length === 1 && entries[0].isDirectory()
      ? path.join(tempRoot, entries[0].name)
      : tempRoot;
    const level = path.join(extractedDir, "Level.sav");
    const meta = path.join(extractedDir, "LevelMeta.sav");
    if (!fs.existsSync(level) && !fs.existsSync(meta)) throw new Error("Backup content is not a valid Palworld world.");

    const target = worldPath(worldId);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(extractedDir, target);
  } finally {
    if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  event(`restore world ${worldId} from ${backupName}`);
  return listWorlds();
}

function renameWorld(worldId, name) {
  if (!fs.existsSync(worldPath(worldId))) throw new Error("World not found.");
  const notes = readWorldNotes();
  notes[worldId] = String(name || "").trim();
  writeWorldNotes(notes);
  event(`rename world ${worldId}`);
  return listWorlds();
}

function saveConfigForWorld(worldId) {
  if (!fs.existsSync(worldPath(worldId))) throw new Error("World not found.");
  const configs = readWorldConfigs();
  configs[worldId] = {
    savedAt: new Date().toLocaleString("sv-SE"),
    raw: readSettingsRaw()
  };
  writeWorldConfigs(configs);
  event(`save config for world ${worldId}`);
  return listWorlds();
}

function applyWorldConfigIfExists(worldId) {
  const configs = readWorldConfigs();
  if (!configs[worldId] || !configs[worldId].raw) return false;
  backupCurrentSettings("before-apply-world-config");
  fs.writeFileSync(settingsPath, configs[worldId].raw, "utf8");
  event(`apply config for world ${worldId}`);
  return true;
}

function applyConfigForWorld(worldId) {
  if (!fs.existsSync(worldPath(worldId))) throw new Error("World not found.");
  const applied = applyWorldConfigIfExists(worldId);
  if (!applied) throw new Error("This world has no saved config.");
  return { applied, worlds: listWorlds(), settings: settingsMap() };
}

function deleteConfigForWorld(worldId) {
  const configs = readWorldConfigs();
  delete configs[worldId];
  writeWorldConfigs(configs);
  event(`delete config for world ${worldId}`);
  return listWorlds();
}

function localIp() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        return entry.address;
      }
    }
  }
  return "127.0.0.1";
}

async function palProcesses() {
  const command = [
    "$items = Get-Process -Name 'PalServer','PalServer-Win64-Shipping-Cmd' -ErrorAction SilentlyContinue |",
    "ForEach-Object { [pscustomobject]@{ id=$_.Id; name=$_.ProcessName; cpu=[math]::Round([double]$_.CPU,2); memoryMb=[math]::Round($_.WorkingSet64/1MB,1); startedAt=$_.StartTime.ToString('yyyy-MM-dd HH:mm:ss') } };",
    "$items | ConvertTo-Json -Depth 4"
  ].join(" ");
  const out = (await ps(command)).trim();
  if (!out) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function udpEndpoint(portValue) {
  const numericPort = Number(portValue) || 8211;
  const command = [
    `$ep = Get-NetUDPEndpoint -LocalPort ${numericPort} -ErrorAction SilentlyContinue | Select-Object -First 1;`,
    "if ($ep) { [pscustomobject]@{ localAddress=$ep.LocalAddress; localPort=$ep.LocalPort; owningProcess=$ep.OwningProcess } | ConvertTo-Json -Depth 3 }"
  ].join(" ");
  const out = (await ps(command)).trim();
  return out ? JSON.parse(out) : null;
}

async function status() {
  const settings = settingsMap();
  const portValue = stripQuotes(settings.PublicPort || "8211");
  const [processes, endpoint, playerInfo] = await Promise.all([palProcesses(), udpEndpoint(portValue), onlinePlayers()]);
  const running = processes.some((p) => p.name === "PalServer-Win64-Shipping-Cmd") || Boolean(endpoint);
  const ip = localIp();

  return {
    running,
    state: running ? "running" : "stopped",
    address: `${ip}:${portValue}`,
    localIp: ip,
    port: portValue,
    serverName: stripQuotes(settings.ServerName || "PalServer"),
    maxPlayers: stripQuotes(settings.ServerPlayerMaxNum || "32"),
    pvp: stripQuotes(settings.bIsPvP || "False"),
    passwordEnabled: stripQuotes(settings.ServerPassword || "").length > 0,
    restApiEnabled: isTrue(settings.RESTAPIEnabled),
    restApiPort: stripQuotes(settings.RESTAPIPort || "8212"),
    adminPasswordSet: stripQuotes(settings.AdminPassword || "").length > 0,
    onlinePlayers: playerInfo.count,
    playersAvailable: playerInfo.available,
    processes,
    endpoint,
    time: new Date().toLocaleString("sv-SE")
  };
}

async function startServer() {
  const current = await status();
  if (current.running) return "Server is already running.";
  const exe = path.join(serverRoot, "PalServer.exe");
  if (!fs.existsSync(exe)) throw new Error("PalServer.exe not found.");
  const child = spawn(exe, ["-log"], {
    cwd: serverRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  event("start server");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return "Server start requested.";
}

async function stopServer() {
  const processes = await palProcesses();
  if (!processes.length) return "Server is not running.";
  await run("taskkill.exe", ["/IM", "PalServer-Win64-Shipping-Cmd.exe", "/F", "/T"]);
  await run("taskkill.exe", ["/IM", "PalServer.exe", "/F", "/T"]);
  event("stop server");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return "Server stop requested.";
}

function listBackups() {
  if (!fs.existsSync(backupsPath)) return [];
  return fs.readdirSync(backupsPath)
    .filter((name) => name.toLowerCase().endsWith(".zip"))
    .map((name) => {
      const full = path.join(backupsPath, name);
      const stat = fs.statSync(full);
      return {
        name,
        sizeMb: Math.round((stat.size / 1024 / 1024) * 100) / 100,
        createdAt: stat.mtime.toLocaleString("sv-SE")
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function createBackup() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const target = path.join(backupsPath, `pal-save-${stamp}.zip`);
  const escapedSave = saveGamesPath.replace(/'/g, "''");
  const escapedSettings = settingsPath.replace(/'/g, "''");
  const escapedTarget = target.replace(/'/g, "''");
  const command = `$items=@(); if(Test-Path -LiteralPath '${escapedSave}'){$items+='${escapedSave}'}; if(Test-Path -LiteralPath '${escapedSettings}'){$items+='${escapedSettings}'}; Compress-Archive -LiteralPath $items -DestinationPath '${escapedTarget}' -Force`;
  await ps(command);
  event(`backup ${target}`);
  return listBackups()[0] || null;
}

function logText() {
  const chunks = [];
  if (fs.existsSync(logsPath)) {
    const files = fs.readdirSync(logsPath)
      .map((name) => path.join(logsPath, name))
      .filter((file) => fs.statSync(file).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (files[0]) {
      chunks.push(`== ${path.basename(files[0])} ==`);
      chunks.push(fs.readFileSync(files[0], "utf8").split(/\r?\n/).slice(-220).join("\n"));
    }
  }
  if (fs.existsSync(eventsPath)) {
    chunks.push("== panel-events.log ==");
    chunks.push(fs.readFileSync(eventsPath, "utf8").split(/\r?\n/).slice(-80).join("\n"));
  }
  return chunks.join("\n") || "No logs yet.";
}

function palApiGet(apiPath) {
  return palApiRequest("GET", apiPath);
}

function palApiRequest(method, apiPath, body = null) {
  return new Promise((resolve) => {
    const settings = settingsMap();
    const restEnabled = isTrue(settings.RESTAPIEnabled);
    const adminPassword = stripQuotes(settings.AdminPassword || "");
    const restPort = Number(stripQuotes(settings.RESTAPIPort || "8212")) || 8212;
    const requestBody = body !== null && body !== undefined ? Buffer.from(JSON.stringify(body), "utf8") : null;

    if (!restEnabled) {
      return resolve({ ok: false, setupRequired: true, reason: "REST API is disabled. Enable REST API, save, and restart the server." });
    }
    if (!adminPassword) {
      return resolve({ ok: false, setupRequired: true, reason: "AdminPassword is empty. Set an admin password, save, and restart the server." });
    }

    const req = http.request({
      hostname: "127.0.0.1",
      port: restPort,
      path: `/v1/api/${apiPath}`,
      method,
      timeout: 4000,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": requestBody ? requestBody.length : 0,
        "Authorization": `Basic ${Buffer.from(`admin:${adminPassword}`).toString("base64")}`
      }
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        if (res.statusCode === 401) {
          return resolve({ ok: false, unauthorized: true, reason: "REST API rejected the admin password." });
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return resolve({ ok: false, reason: `REST API returned HTTP ${res.statusCode}.` });
        }
        try {
          resolve({ ok: true, data: raw.trim() ? JSON.parse(raw) : {} });
        } catch {
          resolve({ ok: false, reason: "REST API returned invalid JSON." });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, reason: "REST API request timed out. The server may need a restart after enabling REST API." });
    });
    req.on("error", () => {
      resolve({ ok: false, reason: `REST API is not reachable on 127.0.0.1:${restPort}.` });
    });
    if (requestBody) {
      req.write(requestBody);
    }
    req.end();
  });
}

async function palApiCommand(apiPath, body = null) {
  const result = await palApiRequest("POST", apiPath, body);
  if (!result.ok) throw new Error(result.reason || "REST API command failed.");
  return result.data || {};
}

async function onlinePlayers() {
  const result = await palApiGet("players");
  if (!result.ok) {
    return {
      available: false,
      count: null,
      players: [],
      reason: result.reason,
      setupRequired: Boolean(result.setupRequired),
      unauthorized: Boolean(result.unauthorized)
    };
  }
  const players = Array.isArray(result.data.players) ? result.data.players : [];
  return {
    available: true,
    count: players.length,
    players,
    reason: ""
  };
}

function playerKey(player) {
  return String(player.playerId || player.userId || player.accountName || player.name || "").trim();
}

function readPlayerEvents() {
  if (!fs.existsSync(playerEventsPath)) return [];
  return fs.readFileSync(playerEventsPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function filterPlayerEvents(query) {
  const type = query.get("type") || "all";
  const player = (query.get("player") || "").toLowerCase();
  const limit = Math.max(1, Math.min(1000, Number(query.get("limit") || 300)));
  return readPlayerEvents()
    .filter((item) => type === "all" || item.type === type)
    .filter((item) => {
      if (!player) return true;
      return String(item.player || "").toLowerCase().includes(player) ||
        String(item.playerId || "").toLowerCase().includes(player);
    })
    .slice(-limit)
    .reverse();
}

function parsePanelTime(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0秒";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}天`);
  if (hours) parts.push(`${hours}小时`);
  if (minutes) parts.push(`${minutes}分钟`);
  if (!parts.length) parts.push(`${seconds}秒`);
  return parts.join("");
}

function buildPlayerStats() {
  const events = readPlayerEvents()
    .map((event) => ({ ...event, date: parsePanelTime(event.time) }))
    .filter((event) => event.date && (event.type === "join" || event.type === "leave"))
    .sort((a, b) => a.date - b.date);

  const players = new Map();

  function ensurePlayer(event) {
    const key = String(event.playerId || event.player || "unknown").trim() || "unknown";
    if (!players.has(key)) {
      players.set(key, {
        playerKey: key,
        player: event.player || key,
        playerId: event.playerId || "",
        totalMs: 0,
        online: false,
        currentJoin: null,
        lastJoin: null,
        lastLeave: null,
        sessions: []
      });
    }
    const item = players.get(key);
    if (event.player) item.player = event.player;
    if (event.playerId) item.playerId = event.playerId;
    return item;
  }

  for (const event of events) {
    const item = ensurePlayer(event);
    if (event.type === "join") {
      if (item.currentJoin) {
        const durationMs = event.date - item.currentJoin.date;
        item.totalMs += Math.max(0, durationMs);
        item.sessions.push({
          join: item.currentJoin.time,
          leave: event.time,
          durationMs,
          duration: formatDuration(durationMs),
          closedBy: "next-join"
        });
      }
      item.online = true;
      item.currentJoin = event;
      item.lastJoin = event.time;
    }
    if (event.type === "leave") {
      item.lastLeave = event.time;
      if (item.currentJoin) {
        const durationMs = event.date - item.currentJoin.date;
        item.totalMs += Math.max(0, durationMs);
        item.sessions.push({
          join: item.currentJoin.time,
          leave: event.time,
          durationMs,
          duration: formatDuration(durationMs),
          closedBy: "leave"
        });
        item.currentJoin = null;
      } else {
        item.sessions.push({
          join: "",
          leave: event.time,
          durationMs: 0,
          duration: "未知",
          closedBy: "leave-without-join"
        });
      }
      item.online = false;
    }
  }

  const now = new Date();
  const result = Array.from(players.values()).map((item) => {
    let totalMs = item.totalMs;
    let currentSession = null;
    if (item.currentJoin) {
      const durationMs = now - item.currentJoin.date;
      totalMs += Math.max(0, durationMs);
      currentSession = {
        join: item.currentJoin.time,
        leave: "",
        durationMs,
        duration: formatDuration(durationMs),
        closedBy: "online"
      };
    }
    return {
      playerKey: item.playerKey,
      player: item.player,
      playerId: item.playerId,
      online: Boolean(item.currentJoin),
      totalMs,
      totalDuration: formatDuration(totalMs),
      lastJoin: item.lastJoin,
      lastLeave: item.lastLeave,
      currentSession,
      sessions: [...item.sessions, ...(currentSession ? [currentSession] : [])].reverse()
    };
  });

  result.sort((a, b) => b.totalMs - a.totalMs || a.player.localeCompare(b.player));
  return result;
}

function parseLogLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const chatPatterns = [
    /\[CHAT\]\s*([^:：]+)[:：]\s*(.+)$/i,
    /Chat(?:Message)?[^A-Za-z0-9]+([^:：\]]+)[:：]\s*(.+)$/i
  ];
  for (const pattern of chatPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return { type: "chat", player: match[1].trim(), message: match[2].trim(), source: "server-log" };
    }
  }

  const joinPatterns = [
    /(.+?)\s+(?:joined|login|connected)/i,
    /Join(?:ed)?[^A-Za-z0-9]+(.+)$/i
  ];
  for (const pattern of joinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return { type: "join", player: match[1].trim(), message: "加入服务器", source: "server-log" };
    }
  }

  const leavePatterns = [
    /(.+?)\s+(?:left|logout|disconnected)/i,
    /Leave|Left/i
  ];
  for (const pattern of leavePatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return { type: "leave", player: (match[1] || "").trim(), message: "离开服务器", source: "server-log" };
    }
  }
  return null;
}

function scanServerLogsForPlayerEvents() {
  if (!fs.existsSync(logsPath)) return;
  const files = fs.readdirSync(logsPath)
    .map((name) => path.join(logsPath, name))
    .filter((file) => fs.statSync(file).isFile());

  for (const file of files) {
    const stat = fs.statSync(file);
    const previous = scannedLogOffsets.get(file) || 0;
    if (stat.size < previous) scannedLogOffsets.set(file, 0);
    const start = scannedLogOffsets.get(file) || 0;
    if (stat.size <= start) continue;

    const fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    scannedLogOffsets.set(file, stat.size);

    for (const line of buffer.toString("utf8").split(/\r?\n/)) {
      const parsed = parseLogLine(line);
      if (parsed) playerEvent(parsed);
    }
  }
}

async function pollPlayerPresence() {
  try {
    scanServerLogsForPlayerEvents();
    const current = await onlinePlayers();
    if (!current.available) return;

    const nextOnlinePlayers = new Map();
    for (const player of current.players) {
      const key = playerKey(player);
      if (!key) continue;
      nextOnlinePlayers.set(key, player);
      if (!lastOnlinePlayers.has(key)) {
        playerEvent({
          type: "join",
          player: player.name || player.accountName || key,
          playerId: key,
          message: "加入服务器",
          source: "rest-poll"
        });
      }
    }

    for (const [key, player] of lastOnlinePlayers.entries()) {
      if (!nextOnlinePlayers.has(key)) {
        playerEvent({
          type: "leave",
          player: player.name || player.accountName || key,
          playerId: key,
          message: "离开服务器",
          source: "rest-poll"
        });
      }
    }

    lastOnlinePlayers = nextOnlinePlayers;
  } catch (error) {
    event(`player poll error ${error.message || error}`);
  }
}

function startPlayerPoller() {
  if (playerPollStarted) return;
  playerPollStarted = true;
  pollPlayerPresence();
  setInterval(pollPlayerPresence, 5000);
}

function generatePassword() {
  return Array.from({ length: 14 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[Math.floor(Math.random() * 58)]).join("");
}

function ensureRestApiConfig() {
  const settings = settingsMap();
  const updates = {
    RESTAPIEnabled: true,
    RESTAPIPort: Number(stripQuotes(settings.RESTAPIPort || "8212")) || 8212
  };
  let generatedPassword = null;
  if (!stripQuotes(settings.AdminPassword || "")) {
    generatedPassword = generatePassword();
    updates.AdminPassword = generatedPassword;
  }
  updateSettings(updates);
  event("enable rest api for player list");
  return { generatedPassword, restPort: updates.RESTAPIPort };
}

function rconPacket(id, type, body) {
  const bodyBuffer = Buffer.from(String(body || ""), "utf8");
  const size = 4 + 4 + bodyBuffer.length + 2;
  const buffer = Buffer.alloc(4 + size);
  buffer.writeInt32LE(size, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  bodyBuffer.copy(buffer, 12);
  buffer.writeInt8(0, 12 + bodyBuffer.length);
  buffer.writeInt8(0, 13 + bodyBuffer.length);
  return buffer;
}

function parseRconPackets(buffer) {
  const packets = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const size = buffer.readInt32LE(offset);
    if (size < 10 || buffer.length - offset < size + 4) break;
    const start = offset + 4;
    const id = buffer.readInt32LE(start);
    const type = buffer.readInt32LE(start + 4);
    const body = buffer.slice(start + 8, start + size - 2).toString("utf8");
    packets.push({ id, type, body });
    offset += size + 4;
  }
  return { packets, rest: buffer.slice(offset) };
}

function executeRcon(command) {
  return new Promise((resolve, reject) => {
    const settings = settingsMap();
    if (!isTrue(settings.RCONEnabled)) {
      reject(new Error("RCON is disabled. Enable RCON and restart the server."));
      return;
    }

    const password = stripQuotes(settings.AdminPassword || "");
    if (!password) {
      reject(new Error("AdminPassword is empty. RCON needs the admin password."));
      return;
    }

    const rconPort = Number(stripQuotes(settings.RCONPort || "25575")) || 25575;
    const socket = net.createConnection({ host: "127.0.0.1", port: rconPort });
    const authId = 9101;
    const commandId = 9102;
    let pending = Buffer.alloc(0);
    let authed = false;
    let commandSent = false;
    let response = "";
    let settleTimer = null;
    let commandFallbackTimer = null;

    const failTimer = setTimeout(() => {
      socket.destroy();
      reject(new Error("RCON request timed out."));
    }, 8000);

    function finish() {
      clearTimeout(failTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (commandFallbackTimer) clearTimeout(commandFallbackTimer);
      socket.end();
      resolve(response.trim());
    }

    socket.on("connect", () => {
      socket.write(rconPacket(authId, 3, password));
    });

    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const parsed = parseRconPackets(pending);
      pending = parsed.rest;

      for (const packet of parsed.packets) {
        if (!authed) {
          if (packet.id === -1) {
            clearTimeout(failTimer);
            socket.destroy();
            reject(new Error("RCON authentication failed."));
            return;
          }
          if (packet.id === authId) {
            authed = true;
            if (!commandSent) {
              commandSent = true;
              socket.write(rconPacket(commandId, 2, command));
              commandFallbackTimer = setTimeout(finish, 1200);
            }
          }
          continue;
        }

        if (packet.id === commandId) {
          response += packet.body;
          if (settleTimer) clearTimeout(settleTimer);
          if (commandFallbackTimer) clearTimeout(commandFallbackTimer);
          settleTimer = setTimeout(finish, 300);
        }
      }
    });

    socket.on("error", (error) => {
      clearTimeout(failTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (commandFallbackTimer) clearTimeout(commandFallbackTimer);
      reject(new Error(`RCON connection failed: ${error.message}`));
    });

    socket.on("close", () => {
      if (commandSent && !settleTimer) {
        clearTimeout(failTimer);
        resolve(response.trim());
      }
    });
  });
}

function ensureRconConfig() {
  const settings = settingsMap();
  const updates = {
    RCONEnabled: true,
    RCONPort: Number(stripQuotes(settings.RCONPort || "25575")) || 25575
  };
  let generatedPassword = null;
  if (!stripQuotes(settings.AdminPassword || "")) {
    generatedPassword = generatePassword();
    updates.AdminPassword = generatedPassword;
  }
  updateSettings(updates);
  event("enable rcon");
  return { generatedPassword, rconPort: updates.RCONPort };
}

function readSchedules() {
  return readJsonFile(schedulesPath, []);
}

function writeSchedules(items) {
  writeJsonFile(schedulesPath, items);
}

function scheduleLabel(type) {
  return { restart: "定时重启", save: "定时保存", backup: "定时备份" }[type] || type;
}

async function runScheduleTask(task) {
  if (task.type === "save") {
    await palApiCommand("save");
  } else if (task.type === "backup") {
    await createBackup();
  } else if (task.type === "restart") {
    const warning = String(task.warning || "").trim();
    if (warning) {
      try { await palApiCommand("announce", { message: warning }); } catch {}
    }
    await stopServer();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await startServer();
  }
  event(`schedule ${task.type}`);
}

function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  setInterval(async () => {
    const now = Date.now();
    const tasks = readSchedules();
    let changed = false;
    for (const task of tasks) {
      if (!task.enabled) continue;
      const intervalMs = Math.max(1, Number(task.intervalMinutes || 60)) * 60 * 1000;
      if (task.lastRun && now - task.lastRun < intervalMs) continue;
      task.lastRun = now;
      task.lastRunText = new Date().toLocaleString("sv-SE");
      changed = true;
      try {
        await runScheduleTask(task);
        task.lastResult = "成功";
      } catch (error) {
        task.lastResult = error.message || String(error);
      }
    }
    if (changed) writeSchedules(tasks);
  }, 30000);
}

function saveSchedule(body) {
  const tasks = readSchedules();
  const id = body.id || randomToken(8);
  const next = {
    id,
    name: String(body.name || scheduleLabel(body.type || "save")).trim(),
    type: String(body.type || "save"),
    intervalMinutes: Math.max(1, Number(body.intervalMinutes || 60)),
    warning: String(body.warning || ""),
    enabled: Boolean(body.enabled),
    lastRun: Number(body.lastRun || 0),
    lastRunText: body.lastRunText || "",
    lastResult: body.lastResult || ""
  };
  const index = tasks.findIndex((item) => item.id === id);
  if (index >= 0) tasks[index] = { ...tasks[index], ...next };
  else tasks.push(next);
  writeSchedules(tasks);
  return tasks;
}

function deleteSchedule(id) {
  const tasks = readSchedules().filter((item) => item.id !== id);
  writeSchedules(tasks);
  return tasks;
}

function readPlayerNotes() {
  return readJsonFile(playerNotesPath, {});
}

function savePlayerNote(playerId, note) {
  const notes = readPlayerNotes();
  notes[playerId] = { note: String(note || ""), updatedAt: new Date().toLocaleString("sv-SE") };
  writeJsonFile(playerNotesPath, notes);
  return notes;
}

function monitorSnapshot() {
  const memory = process.memoryUsage();
  const disks = [];
  try {
    const root = path.parse(serverRoot).root;
    const stat = fs.statSync(root);
    disks.push({ path: root, available: stat ? "" : "" });
  } catch {}
  const worlds = listWorlds().worlds || [];
  return {
    time: new Date().toLocaleString("sv-SE"),
    uptimeSeconds: Math.round(os.uptime()),
    loadavg: os.loadavg(),
    totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemMb: Math.round(os.freemem() / 1024 / 1024),
    panelMemMb: Math.round(memory.rss / 1024 / 1024),
    saveSizeMb: Math.round((folderSize(saveGamesPath) / 1024 / 1024) * 100) / 100,
    worlds: worlds.map((world) => ({ id: world.id, name: world.name, sizeMb: world.sizeMb })),
    disks
  };
}

function monitorHistory() {
  const history = readJsonFile(monitorPath, []);
  const next = monitorSnapshot();
  history.push(next);
  while (history.length > 288) history.shift();
  writeJsonFile(monitorPath, history);
  return { current: next, history };
}

function filteredLogText(params) {
  const keyword = String(params.get("keyword") || "").toLowerCase();
  const level = String(params.get("level") || "all").toLowerCase();
  const text = logText();
  const lines = text.split(/\r?\n/).filter((line) => {
    const lower = line.toLowerCase();
    if (keyword && !lower.includes(keyword)) return false;
    if (level !== "all" && !lower.includes(level)) return false;
    return true;
  });
  return lines.slice(-1000).join("\n");
}

async function connectivityCheck() {
  const settings = settingsMap();
  const gamePort = Number(stripQuotes(settings.PublicPort || "8211")) || 8211;
  const panelPort = port;
  const hostName = "3t80x98154.vicp.fun";
  let resolvedIp = "";
  try {
    const addresses = await dns.lookup(hostName);
    resolvedIp = addresses.address || "";
  } catch {}
  const udpListening = (await udpEndpoint(gamePort)) ? true : false;
  const tcpListening = await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: panelPort });
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 1500);
    socket.on("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on("error", () => { clearTimeout(timer); resolve(false); });
  });
  return { host: hostName, resolvedIp, gamePort, panelPort, udpListening, tcpListening, localIp: localIp() };
}

function findSteamCmd() {
  const candidates = [
    path.join(serverRoot, "steamcmd.exe"),
    path.join(path.dirname(serverRoot), "steamcmd.exe"),
    "C:\\steamcmd\\steamcmd.exe"
  ];
  return candidates.find((item) => fs.existsSync(item)) || "steamcmd.exe";
}

async function updateServer() {
  fs.appendFileSync(updateLogPath, `${new Date().toLocaleString("sv-SE")} update start\n`, "utf8");
  await stopServer();
  await createBackup();
  const steamcmd = findSteamCmd();
  const result = await run(steamcmd, ["+force_install_dir", serverRoot, "+login", "anonymous", "+app_update", "2394010", "validate", "+quit"], { timeout: 20 * 60 * 1000 });
  fs.appendFileSync(updateLogPath, `${result.stdout}\n${result.stderr}\n`, "utf8");
  if (result.error) throw new Error(`SteamCMD update failed: ${result.error.message}`);
  event("steam update server");
  return { output: fs.existsSync(updateLogPath) ? fs.readFileSync(updateLogPath, "utf8").slice(-8000) : "" };
}

const configTemplates = {
  casual: {
    name: "休闲服",
    settings: { ExpRate: 2, PalCaptureRate: 2, CollectionDropRate: 2, PalEggDefaultHatchingTime: 1, DeathPenalty: "None" }
  },
  highrate: {
    name: "高倍率服",
    settings: { ExpRate: 5, PalCaptureRate: 4, CollectionDropRate: 5, PalEggDefaultHatchingTime: 0, DeathPenalty: "Item" }
  },
  hardcore: {
    name: "硬核服",
    settings: { ExpRate: 0.8, PalCaptureRate: 0.8, CollectionDropRate: 0.8, DeathPenalty: "All", bHardcore: true }
  }
};

function applyConfigTemplate(name) {
  const template = configTemplates[name];
  if (!template) throw new Error("配置模板不存在。");
  const before = settingsMap();
  updateSettings(template.settings);
  return { template: template.name, changed: changedConfigFields(before, template.settings), settings: settingsMap() };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const full = path.resolve(publicRoot, `.${requestPath}`);
  if (!full.startsWith(publicRoot) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return sendTextError(res, 404, "Not found");
  }
  const ext = path.extname(full).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
  const body = fs.readFileSync(full);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  const pathname = url.pathname;
  const method = req.method || "GET";

  try {
    if (method === "POST" && pathname === "/api/auth/login") {
      const body = await readBody(req);
      const user = findPanelUser(body.username || "");
      const ok = user && hashPassword(String(body.password || ""), user.salt) === user.passwordHash;
      if (!ok) {
        await auditEvent(req, "登录失败", { username: body.username || "" }, false, body.username || "");
        return sendJson(res, { ok: false, error: "用户名或密码错误。" }, 401);
      }
      const config = authConfig();
      if (config.initialPassword) {
        delete config.initialPassword;
        fs.writeFileSync(authPath, JSON.stringify(config, null, 2), "utf8");
      }
      const token = randomToken(32);
      sessions.set(token, { username: user.username, role: user.role || "operator", expires: Date.now() + 12 * 60 * 60 * 1000 });
      setSessionCookie(res, token);
      await auditEvent(req, "登录成功", { username: config.username }, true, config.username);
      return sendJson(res, { ok: true });
    }
    if (method === "POST" && pathname === "/api/auth/logout") {
      await auditEvent(req, "退出登录", {}, true);
      const token = cookieValue(req, "palpanel_session");
      if (token) sessions.delete(token);
      clearSessionCookie(res);
      return sendJson(res, { ok: true });
    }
    if (method === "POST" && pathname === "/api/auth/change-password") {
      if (!isAuthenticated(req)) return sendJson(res, { ok: false, error: "Unauthorized" }, 401);
      const body = await readBody(req);
      const config = authConfig();
      if (hashPassword(String(body.oldPassword || ""), config.salt) !== config.passwordHash) {
        return sendJson(res, { ok: false, error: "旧密码错误。" }, 400);
      }
      const nextPassword = String(body.newPassword || "");
      if (nextPassword.length < 8) return sendJson(res, { ok: false, error: "新密码至少 8 位。" }, 400);
      config.salt = randomToken(16);
      config.passwordHash = hashPassword(nextPassword, config.salt);
      delete config.initialPassword;
      fs.writeFileSync(authPath, JSON.stringify(config, null, 2), "utf8");
      return sendJson(res, { ok: true });
    }
    if (method === "GET" && pathname === "/api/auth/status") {
      return sendJson(res, { authenticated: isAuthenticated(req) });
    }

    const anonymousStatic = ["/login.html", "/login.js", "/styles.css"];
    if (!isAuthenticated(req)) {
      if (method === "GET" && anonymousStatic.includes(pathname)) return serveStatic(req, res);
      if (method === "GET" && pathname === "/") return sendRedirect(res, "/login.html");
      return sendJson(res, { ok: false, error: "Unauthorized" }, 401);
    }

    if (method === "POST" && pathname !== "/api/auth/logout" && !specificAuditPaths.has(pathname)) {
      requireWrite(req);
      await auditEvent(req, "面板操作", { path: pathname }, true);
    }

    if (method === "GET" && pathname === "/login.html") return sendRedirect(res, "/");

    if (method === "GET" && pathname === "/api/status") return sendJson(res, await status());
    if (method === "GET" && pathname === "/api/audit-logs") {
      return sendJson(res, {
        logs: readAuditLogs(url.searchParams.get("limit") || 500, {
          action: url.searchParams.get("action") || "all",
          result: url.searchParams.get("result") || "all",
          keyword: url.searchParams.get("keyword") || ""
        })
      });
    }
    if (method === "GET" && pathname === "/api/config") return sendJson(res, { settings: settingsMap(), raw: readSettingsRaw() });
    if (method === "GET" && pathname === "/api/players") return sendJson(res, await onlinePlayers());
    if (method === "GET" && pathname === "/api/users") return sendJson(res, { users: publicUsers() });
    if (method === "GET" && pathname === "/api/schedules") return sendJson(res, { schedules: readSchedules() });
    if (method === "GET" && pathname === "/api/monitor") return sendJson(res, monitorHistory());
    if (method === "GET" && pathname === "/api/connectivity") return sendJson(res, await connectivityCheck());
    if (method === "GET" && pathname === "/api/player-notes") return sendJson(res, { notes: readPlayerNotes() });
    if (method === "GET" && pathname === "/api/config/templates") return sendJson(res, { templates: configTemplates });
    if (method === "GET" && pathname === "/api/player-stats") return sendJson(res, { players: buildPlayerStats() });
    if (method === "GET" && pathname === "/api/player-events") return sendJson(res, { events: filterPlayerEvents(url.searchParams) });
    if (method === "GET" && pathname === "/api/worlds") return sendJson(res, listWorlds());
    if (method === "GET" && pathname === "/api/backups") return sendJson(res, { backups: listBackups() });
    if (method === "GET" && pathname === "/api/logs") return sendJson(res, { text: filteredLogText(url.searchParams) });
    if (method === "GET" && pathname === "/api/rcon/status") {
      const settings = settingsMap();
      return sendJson(res, {
        enabled: isTrue(settings.RCONEnabled),
        port: stripQuotes(settings.RCONPort || "25575"),
        adminPasswordSet: stripQuotes(settings.AdminPassword || "").length > 0
      });
    }

    if (method === "POST" && pathname === "/api/server/start") {
      const message = await startServer();
      return sendJson(res, { ok: true, message, status: await status() });
    }
    if (method === "POST" && pathname === "/api/server/stop") {
      const message = await stopServer();
      return sendJson(res, { ok: true, message, status: await status() });
    }
    if (method === "POST" && pathname === "/api/server/restart") {
      await stopServer();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const message = await startServer();
      event("restart server");
      return sendJson(res, { ok: true, message, status: await status() });
    }
    if (method === "POST" && pathname === "/api/config") {
      const body = await readBody(req);
      const before = settingsMap();
      updateSettings(body);
      const changedFields = changedConfigFields(before, body);
      if (changedFields.length) {
        await auditEvent(req, "修改配置", { fields: changedFields }, true);
      }
      event("update settings");
      return sendJson(res, { ok: true, settings: settingsMap() });
    }
    if (method === "POST" && pathname === "/api/config/raw") {
      const body = await readBody(req);
      fs.writeFileSync(settingsPath, String(body.raw || ""), "utf8");
      await auditEvent(req, "修改原始配置", { bytes: Buffer.byteLength(String(body.raw || ""), "utf8") }, true);
      event("update raw settings");
      return sendJson(res, { ok: true });
    }
    if (method === "POST" && pathname === "/api/rest/setup") {
      const setup = ensureRestApiConfig();
      return sendJson(res, { ok: true, message: "REST API settings saved. Restart the server to apply them.", setup, settings: settingsMap() });
    }
    if (method === "POST" && pathname === "/api/update") {
      return sendJson(res, { ok: true, result: await updateServer() });
    }
    if (method === "POST" && pathname === "/api/users") {
      requireAdmin(req);
      const body = await readBody(req);
      const users = panelUsers();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || password.length < 8) throw new Error("用户名不能为空，新密码至少 8 位。");
      const salt = randomToken(16);
      const next = { username, role: String(body.role || "operator"), salt, passwordHash: hashPassword(password, salt), createdAt: new Date().toLocaleString("sv-SE") };
      const index = users.findIndex((user) => user.username === username);
      if (index >= 0) users[index] = next;
      else users.push(next);
      writeJsonFile(usersPath, users);
      return sendJson(res, { ok: true, users: publicUsers() });
    }
    if (method === "POST" && pathname === "/api/users/delete") {
      requireAdmin(req);
      const body = await readBody(req);
      const username = String(body.username || "");
      const users = panelUsers().filter((user) => user.username !== username);
      if (!users.some((user) => user.role === "admin")) throw new Error("至少保留一个管理员。");
      writeJsonFile(usersPath, users);
      return sendJson(res, { ok: true, users: publicUsers() });
    }
    if (method === "POST" && pathname === "/api/schedules") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, schedules: saveSchedule(body) });
    }
    if (method === "POST" && pathname === "/api/schedules/delete") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, schedules: deleteSchedule(String(body.id || "")) });
    }
    if (method === "POST" && pathname === "/api/player-notes") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, notes: savePlayerNote(String(body.playerId || ""), body.note || "") });
    }
    if (method === "POST" && pathname === "/api/config/template") {
      const body = await readBody(req);
      const result = applyConfigTemplate(String(body.name || ""));
      await auditEvent(req, "应用配置模板", result, true);
      return sendJson(res, { ok: true, result });
    }
    if (method === "POST" && pathname === "/api/admin/announce") {
      const body = await readBody(req);
      const message = String(body.message || "").trim();
      if (!message) throw new Error("Broadcast message is empty.");
      await palApiCommand("announce", { message });
      event("rest announce");
      return sendJson(res, { ok: true, message: "广播已发送。" });
    }
    if (method === "POST" && pathname === "/api/admin/save") {
      await palApiCommand("save");
      event("rest save");
      return sendJson(res, { ok: true, message: "世界已保存。" });
    }
    if (method === "POST" && pathname === "/api/admin/kick") {
      const body = await readBody(req);
      const userid = String(body.userid || "").trim();
      const message = String(body.message || "已被管理员踢出").trim();
      if (!userid) throw new Error("Kick target userid is empty.");
      await palApiCommand("kick", { userid, message });
      event(`rest kick ${userid}`);
      return sendJson(res, { ok: true, message: "踢出命令已发送。" });
    }
    if (method === "POST" && pathname === "/api/admin/ban") {
      const body = await readBody(req);
      const userid = String(body.userid || "").trim();
      const message = String(body.message || "已被管理员封禁").trim();
      if (!userid) throw new Error("Ban target userid is empty.");
      await palApiCommand("ban", { userid, message });
      event(`rest ban ${userid}`);
      return sendJson(res, { ok: true, message: "封禁命令已发送。" });
    }
    if (method === "POST" && pathname === "/api/rcon/setup") {
      const setup = ensureRconConfig();
      return sendJson(res, { ok: true, message: "RCON settings saved. Restart the server to apply them.", setup, settings: settingsMap() });
    }
    if (method === "POST" && pathname === "/api/rcon/command") {
      const body = await readBody(req);
      const command = String(body.command || "").trim();
      if (!command) throw new Error("RCON command is empty.");
      const output = await executeRcon(command);
      event(`rcon ${command}`);
      return sendJson(res, { ok: true, command, output });
    }
    if (method === "POST" && pathname === "/api/worlds") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, result: await createWorld(body.name || "") });
    }
    if (method === "POST" && pathname === "/api/worlds/switch") {
      const body = await readBody(req);
      const targetWorldId = String(body.id || "");
      const worlds = await switchWorld(targetWorldId);
      await auditEvent(req, "切换地图", { worldId: targetWorldId }, true);
      return sendJson(res, { ok: true, worlds });
    }
    if (method === "POST" && pathname === "/api/worlds/backup") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, backup: await backupWorld(String(body.id || "")), worlds: listWorlds() });
    }
    if (method === "POST" && pathname === "/api/worlds/restore") {
      const body = await readBody(req);
      const targetWorldId = String(body.id || "");
      const backupName = String(body.backup || "");
      const worlds = await restoreWorld(targetWorldId, backupName);
      await auditEvent(req, "鎭㈠鍦板浘", { worldId: targetWorldId, backup: backupName }, true);
      return sendJson(res, { ok: true, worlds });
    }
    if (method === "POST" && pathname === "/api/worlds/rename") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, worlds: renameWorld(String(body.id || ""), body.name || "") });
    }
    if (method === "POST" && pathname === "/api/worlds/config/save") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, worlds: saveConfigForWorld(String(body.id || "")) });
    }
    if (method === "POST" && pathname === "/api/worlds/config/apply") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, result: applyConfigForWorld(String(body.id || "")) });
    }
    if (method === "POST" && pathname === "/api/worlds/config/delete") {
      const body = await readBody(req);
      return sendJson(res, { ok: true, worlds: deleteConfigForWorld(String(body.id || "")) });
    }
    if (method === "POST" && pathname === "/api/backups") {
      const backup = await createBackup();
      return sendJson(res, { ok: true, backup, backups: listBackups() });
    }

    if (method === "GET") return serveStatic(req, res);
    return sendTextError(res, 405, "Method not allowed");
  } catch (error) {
    return sendTextError(res, 500, error.message || String(error));
  }
}

const server = http.createServer((req, res) => {
  route(req, res);
});

server.listen(port, host, () => {
  ensureAuthConfig();
  event(`node panel started http://${host}:${port}/`);
  startPlayerPoller();
  startScheduler();
  console.log(`Palworld web panel is running at http://${host}:${port}/`);
});
