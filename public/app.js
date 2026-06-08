const $ = (selector) => document.querySelector(selector);

const fields = [
  "ServerName", "ServerDescription", "ServerPassword", "AdminPassword",
  "PublicPort", "ServerPlayerMaxNum", "RESTAPIPort", "RCONPort",
  "Difficulty", "DeathPenalty", "ExpRate", "PalCaptureRate",
  "CollectionDropRate", "PalEggDefaultHatchingTime",
  "bIsPvP", "bEnableFriendlyFire", "RCONEnabled", "RESTAPIEnabled"
];

const textFields = new Set(["ServerName", "ServerDescription", "ServerPassword", "AdminPassword"]);
const boolFields = new Set(["bIsPvP", "bEnableFriendlyFire", "RCONEnabled", "RESTAPIEnabled"]);
const enumOptions = {
  Difficulty: [["None", "None / 默认"], ["Normal", "Normal / 普通"], ["Difficult", "Difficult / 困难"]],
  DeathPenalty: [["None", "None / 不掉落"], ["Item", "Item / 只掉落物品"], ["ItemAndEquipment", "ItemAndEquipment / 掉落物品和装备"], ["All", "All / 全部掉落"]]
};

let latestStatus = null;
let latestPlayerStats = [];

const settingLabels = {
  Difficulty: "难度", RandomizerType: "随机化类型", RandomizerSeed: "随机种子",
  bIsRandomizerPalLevelRandom: "随机帕鲁等级", DayTimeSpeedRate: "白天流速", NightTimeSpeedRate: "夜晚流速",
  ExpRate: "经验倍率", PalCaptureRate: "捕获倍率", PalSpawnNumRate: "帕鲁刷新倍率",
  PalDamageRateAttack: "帕鲁攻击伤害倍率", PalDamageRateDefense: "帕鲁承伤倍率",
  PlayerDamageRateAttack: "玩家攻击伤害倍率", PlayerDamageRateDefense: "玩家承伤倍率",
  PlayerStomachDecreaceRate: "玩家饥饿消耗倍率", PlayerStaminaDecreaceRate: "玩家体力消耗倍率",
  PlayerAutoHPRegeneRate: "玩家生命自然恢复倍率", PlayerAutoHpRegeneRateInSleep: "玩家睡眠生命恢复倍率",
  PalStomachDecreaceRate: "帕鲁饥饿消耗倍率", PalStaminaDecreaceRate: "帕鲁体力消耗倍率",
  PalAutoHPRegeneRate: "帕鲁生命自然恢复倍率", PalAutoHpRegeneRateInSleep: "帕鲁睡眠生命恢复倍率",
  BuildObjectHpRate: "建筑生命倍率", BuildObjectDamageRate: "建筑受伤倍率",
  BuildObjectDeteriorationDamageRate: "建筑劣化伤害倍率", CollectionDropRate: "采集掉落倍率",
  CollectionObjectHpRate: "采集物生命倍率", CollectionObjectRespawnSpeedRate: "采集物刷新速度倍率",
  EnemyDropItemRate: "敌人掉落倍率", DeathPenalty: "死亡惩罚",
  bEnablePlayerToPlayerDamage: "允许玩家互相伤害", bEnableFriendlyFire: "允许友伤",
  bEnableInvaderEnemy: "启用袭击事件", bActiveUNKO: "启用未使用参数 UNKO",
  bEnableAimAssistPad: "手柄辅助瞄准", bEnableAimAssistKeyboard: "键鼠辅助瞄准",
  DropItemMaxNum: "掉落物最大数量", DropItemMaxNum_UNKO: "UNKO 掉落物最大数量",
  BaseCampMaxNum: "据点最大数量", BaseCampWorkerMaxNum: "据点工作帕鲁上限",
  DropItemAliveMaxHours: "掉落物保留小时数", bAutoResetGuildNoOnlinePlayers: "无在线玩家时自动重置公会",
  AutoResetGuildTimeNoOnlinePlayers: "公会无在线玩家重置小时数", GuildPlayerMaxNum: "公会玩家上限",
  BaseCampMaxNumInGuild: "公会据点上限", PalEggDefaultHatchingTime: "默认孵蛋小时数",
  WorkSpeedRate: "工作速度倍率", AutoSaveSpan: "自动保存间隔秒数",
  bIsMultiplay: "多人模式", bIsPvP: "PvP 模式", bHardcore: "硬核模式", bPalLost: "死亡丢失帕鲁",
  bCharacterRecreateInHardcore: "硬核模式允许重建角色", bCanPickupOtherGuildDeathPenaltyDrop: "可拾取其他公会死亡掉落",
  bEnableNonLoginPenalty: "启用未登录惩罚", bEnableFastTravel: "允许快速传送",
  bEnableFastTravelOnlyBaseCamp: "仅允许据点快速传送", bIsStartLocationSelectByMap: "允许地图选择出生点",
  bExistPlayerAfterLogout: "玩家离线后角色保留", bEnableDefenseOtherGuildPlayer: "允许防御其他公会玩家",
  bInvisibleOtherGuildBaseCampAreaFX: "隐藏其他公会据点范围特效", bBuildAreaLimit: "启用建造区域限制",
  ItemWeightRate: "物品重量倍率", CoopPlayerMaxNum: "合作玩家上限", ServerPlayerMaxNum: "服务器人数上限",
  ServerName: "服务器名称", ServerDescription: "服务器描述", AdminPassword: "管理员密码", ServerPassword: "服务器密码",
  bAllowClientMod: "允许客户端 Mod", PublicPort: "游戏端口", PublicIP: "公网 IP",
  RCONEnabled: "启用 RCON", RCONPort: "RCON 端口", Region: "服务器区域", bUseAuth: "启用认证",
  BanListURL: "封禁列表地址", RESTAPIEnabled: "启用 REST API", RESTAPIPort: "REST API 端口",
  bShowPlayerList: "显示玩家列表", ChatPostLimitPerMinute: "每分钟聊天发送限制",
  CrossplayPlatforms: "跨平台平台列表", bIsUseBackupSaveData: "启用备份存档数据",
  LogFormatType: "日志格式", bIsShowJoinLeftMessage: "显示加入离开消息",
  SupplyDropSpan: "补给掉落间隔", EnablePredatorBossPal: "启用掠食者 Boss 帕鲁",
  MaxBuildingLimitNum: "最大建筑数量限制", ServerReplicatePawnCullDistance: "服务器角色同步裁剪距离",
  bAllowGlobalPalboxExport: "允许全局帕鲁箱导出", bAllowGlobalPalboxImport: "允许全局帕鲁箱导入",
  EquipmentDurabilityDamageRate: "装备耐久损耗倍率", ItemContainerForceMarkDirtyInterval: "容器强制标记变更间隔",
  ItemCorruptionMultiplier: "物品腐坏倍率", DenyTechnologyList: "禁用科技列表",
  GuildRejoinCooldownMinutes: "重新加入公会冷却分钟数", BlockRespawnTime: "阻止重生时间",
  RespawnPenaltyDurationThreshold: "重生惩罚持续阈值", RespawnPenaltyTimeScale: "重生惩罚时间倍率",
  bDisplayPvPItemNumOnWorldMap_BaseCamp: "地图显示据点 PvP 物品数量",
  bDisplayPvPItemNumOnWorldMap_Player: "地图显示玩家 PvP 物品数量",
  AdditionalDropItemWhenPlayerKillingInPvPMode: "PvP 击杀玩家额外掉落物",
  AdditionalDropItemNumWhenPlayerKillingInPvPMode: "PvP 击杀玩家额外掉落数量",
  bAdditionalDropItemWhenPlayerKillingInPvPMode: "启用 PvP 击杀玩家额外掉落",
  bAllowEnhanceStat_Health: "允许强化生命", bAllowEnhanceStat_Attack: "允许强化攻击",
  bAllowEnhanceStat_Stamina: "允许强化体力", bAllowEnhanceStat_Weight: "允许强化负重",
  bAllowEnhanceStat_WorkSpeed: "允许强化工作速度"
};

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, cache: "no-store", ...options });
  if (response.status === 401) {
    location.href = "/login.html";
    throw new Error("请先登录。");
  }
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(translateMessage(data.error || "请求失败"));
  return data;
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/login.html";
}

async function copyConnectAddress() {
  const address = $("#publicConnectAddress").textContent.trim();
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(address);
  } else {
    const input = document.createElement("textarea");
    input.value = address;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    document.body.appendChild(input);
    input.focus();
    input.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    if (!copied) throw new Error("浏览器阻止了复制，请手动复制联机地址。");
  }
  $("#operationMessage").textContent = `已复制联机地址：${address}`;
}

async function changePanelPassword() {
  await api("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      oldPassword: $("#oldPanelPassword").value,
      newPassword: $("#newPanelPassword").value
    })
  });
  $("#operationMessage").textContent = "面板密码已修改。";
  $("#oldPanelPassword").value = "";
  $("#newPanelPassword").value = "";
  $("#passwordPanel").classList.remove("visible");
}

function translateMessage(message) {
  const map = {
    "Server is already running.": "服务器已经在运行。",
    "Server start requested.": "已发送启动指令。",
    "Server is not running.": "服务器未运行。",
    "Server stop requested.": "已发送停止指令。",
    "RCON settings saved. Restart the server to apply them.": "RCON 配置已保存，重启服务器后生效。",
    "RCON is disabled. Enable RCON and restart the server.": "RCON 未启用。请启用 RCON 并重启服务器。",
    "RCON authentication failed.": "RCON 认证失败，请检查管理员密码。",
    "RCON request timed out.": "RCON 请求超时。",
    "AdminPassword is empty. RCON needs the admin password.": "管理员密码为空，RCON 需要管理员密码。",
    "REST API settings saved. Restart the server to apply them.": "REST API 配置已保存，重启服务器后生效。"
  };
  if (!message) return "";
  if (map[message]) return map[message];
  if (message.startsWith("RCON connection failed:")) return message.replace("RCON connection failed:", "RCON 连接失败：");
  return message;
}

function cleanValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/^"|"$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function normalizeInputValue(id) {
  const el = $("#" + id);
  if (boolFields.has(id)) return el.checked;
  if (enumOptions[id]) return el.value;
  if (textFields.has(id)) return el.value;
  const raw = el.value.trim();
  if (raw === "") return "";
  const num = Number(raw);
  return Number.isFinite(num) ? num : raw;
}

function setStatus(status) {
  latestStatus = status;
  $("#statusPill").textContent = status.running ? "运行中" : "已停止";
  $("#statusPill").classList.toggle("stopped", !status.running);
  $("#serverAddress").textContent = status.address || "--";
  $("#metricState").textContent = status.running ? "运行中" : "已停止";
  $("#metricOnline").textContent = status.onlinePlayers === null || status.onlinePlayers === undefined ? "--" : String(status.onlinePlayers);
  $("#metricPlayers").textContent = status.maxPlayers || "--";
  $("#lastUpdate").textContent = status.time || "--";
  const memory = (status.processes || []).reduce((sum, item) => sum + Number(item.memoryMb || 0), 0);
  $("#metricMemory").textContent = memory ? `${memory.toFixed(1)} MB` : "--";
  const rows = (status.processes || []).map((p) => `<tr><td>${p.name}</td><td>${p.id}</td><td>${p.memoryMb} MB</td><td>${p.cpu}</td><td>${p.startedAt || "--"}</td></tr>`).join("");
  $("#processTable").innerHTML = `<table><thead><tr><th>进程</th><th>PID</th><th>内存</th><th>CPU 秒</th><th>启动时间</th></tr></thead><tbody>${rows || "<tr><td colspan='5'>没有运行中的 Palworld 进程</td></tr>"}</tbody></table>`;
}

async function refreshStatus() {
  const data = await api("/api/status");
  setStatus(data);
  if ($("#tab-worlds").classList.contains("active")) loadWorlds().catch(showError);
}

async function loadConfig() {
  const data = await api("/api/config");
  const settings = data.settings || {};
  fields.forEach((id) => {
    const el = $("#" + id);
    if (!el) return;
    if (boolFields.has(id)) el.checked = cleanValue(settings[id]).toLowerCase() === "true";
    else el.value = cleanValue(settings[id]);
  });
  $("#rawConfig").value = data.raw || "";
  renderTranslatedConfig(settings);
}

function editableSettingControl(key, value) {
  const clean = cleanValue(value);
  if (enumOptions[key]) {
    return `<select class="setting-input" data-setting-key="${escapeHtml(key)}">${enumOptions[key].map(([v, label]) => `<option value="${escapeHtml(v)}" ${clean === v ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
  }
  const lower = clean.toLowerCase();
  if (lower === "true" || lower === "false") {
    return `<select class="setting-input" data-setting-key="${escapeHtml(key)}"><option value="True" ${lower === "true" ? "selected" : ""}>True / 开启</option><option value="False" ${lower === "false" ? "selected" : ""}>False / 关闭</option></select>`;
  }
  if (/^-?\d+(\.\d+)?$/.test(clean)) return `<input class="setting-input" data-setting-key="${escapeHtml(key)}" type="number" step="any" value="${escapeHtml(clean)}">`;
  return `<input class="setting-input" data-setting-key="${escapeHtml(key)}" type="text" value="${escapeHtml(clean)}">`;
}

function renderTranslatedConfig(settings) {
  const rows = Object.entries(settings).map(([key, value]) => `<tr><td>${escapeHtml(settingLabels[key] || "未翻译配置项")}</td><td><code>${escapeHtml(key)}</code></td><td>${editableSettingControl(key, value)}</td></tr>`).join("");
  $("#translatedConfigTable").innerHTML = `<table><thead><tr><th>中文名称</th><th>原始字段</th><th>当前值</th></tr></thead><tbody>${rows || "<tr><td colspan='3'>没有读取到配置项</td></tr>"}</tbody></table>`;
}

function typedSettingValue(raw) {
  const text = String(raw ?? "").trim();
  if (text === "True") return true;
  if (text === "False") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

async function saveTranslatedConfig() {
  const payload = {};
  document.querySelectorAll(".setting-input").forEach((input) => { payload[input.dataset.settingKey] = typedSettingValue(input.value); });
  await api("/api/config", { method: "POST", body: JSON.stringify(payload) });
  $("#operationMessage").textContent = "配置项已保存，重启后生效。";
  await loadConfig(); await refreshStatus(); await loadPlayers();
}

async function saveSettings() {
  const payload = {};
  fields.forEach((id) => { payload[id] = normalizeInputValue(id); });
  await api("/api/config", { method: "POST", body: JSON.stringify(payload) });
  $("#operationMessage").textContent = "配置已保存，重启后生效。";
  await loadConfig(); await refreshStatus();
}

async function saveRaw() {
  await api("/api/config/raw", { method: "POST", body: JSON.stringify({ raw: $("#rawConfig").value }) });
  $("#operationMessage").textContent = "原始配置已保存，重启后生效。";
  await loadConfig();
}

async function serverAction(action) {
  $("#operationMessage").textContent = "正在执行...";
  const data = await api(`/api/server/${action}`, { method: "POST", body: "{}" });
  $("#operationMessage").textContent = translateMessage(data.message) || "操作完成";
  setStatus(data.status); await loadPlayers();
}

function playerRows(players) {
  return players.map((p) => `<tr><td>${escapeHtml(p.name || "--")}</td><td>${escapeHtml(p.playerId || p.userId || "--")}</td><td>${p.level ?? "--"}</td><td>${p.ping ?? "--"}</td><td>${escapeHtml(p.ip || "--")}</td><td>${p.location_x ?? "--"}, ${p.location_y ?? "--"}, ${p.location_z ?? "--"}</td></tr>`).join("");
}

function renderPlayers(data) {
  const players = data.players || [];
  const table = `<table><thead><tr><th>玩家名</th><th>玩家 ID</th><th>等级</th><th>Ping</th><th>IP</th><th>坐标</th></tr></thead><tbody>${playerRows(players) || "<tr><td colspan='6'>当前没有在线玩家</td></tr>"}</tbody></table>`;
  const hint = data.available ? `当前在线 ${players.length} 人` : translateMessage(data.reason || "玩家列表不可用");
  $("#playerHint").textContent = hint; $("#playerHint2").textContent = hint;
  $("#playerTable").innerHTML = table; $("#playerTable2").innerHTML = table;
}

async function loadPlayers() { renderPlayers(await api("/api/players")); }

async function loadPlayerStats() {
  const data = await api("/api/player-stats");
  latestPlayerStats = data.players || [];
  const rows = latestPlayerStats.map((p) => `
    <tr>
      <td><button class="secondary small" data-player-stats="${escapeHtml(p.playerKey)}">查看</button></td>
      <td>${escapeHtml(p.player || "--")}</td>
      <td>${escapeHtml(p.playerId || "--")}</td>
      <td>${p.online ? "在线" : "离线"}</td>
      <td>${escapeHtml(p.totalDuration || "0秒")}</td>
      <td>${escapeHtml(p.lastJoin || "--")}</td>
      <td>${escapeHtml(p.lastLeave || "--")}</td>
    </tr>
  `).join("");
  $("#playerStatsTable").innerHTML = `
    <table>
      <thead><tr><th>明细</th><th>玩家</th><th>玩家 ID</th><th>状态</th><th>总在线时长</th><th>最近上线</th><th>最近离线</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='7'>暂无玩家在线时长记录</td></tr>"}</tbody>
    </table>
  `;
  document.querySelectorAll("[data-player-stats]").forEach((btn) => {
    btn.addEventListener("click", () => renderPlayerSessions(btn.dataset.playerStats));
  });
  if (latestPlayerStats.length && !$("#playerSessionTable").innerHTML.trim()) {
    renderPlayerSessions(latestPlayerStats[0].playerKey);
  }
}

function renderPlayerSessions(playerKey) {
  const player = latestPlayerStats.find((item) => item.playerKey === playerKey);
  if (!player) return;
  $("#selectedPlayerStats").textContent = `${player.player || player.playerKey}，总在线 ${player.totalDuration}`;
  const rows = (player.sessions || []).map((session) => `
    <tr>
      <td>${escapeHtml(session.join || "--")}</td>
      <td>${escapeHtml(session.leave || (session.closedBy === "online" ? "当前在线" : "--"))}</td>
      <td>${escapeHtml(session.duration || "--")}</td>
      <td>${session.closedBy === "online" ? "进行中" : "已结束"}</td>
    </tr>
  `).join("");
  $("#playerSessionTable").innerHTML = `
    <table>
      <thead><tr><th>上线时间</th><th>离线时间</th><th>单次在线时长</th><th>状态</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='4'>暂无单次在线记录</td></tr>"}</tbody>
    </table>
  `;
}

function recordTypeLabel(type) {
  return { join: "加入服务器", leave: "离开服务器", chat: "聊天", event: "事件" }[type] || type || "--";
}

async function loadRecords() {
  const type = encodeURIComponent($("#recordType").value);
  const player = encodeURIComponent($("#recordPlayer").value.trim());
  const data = await api(`/api/player-events?type=${type}&player=${player}&limit=500`);
  const rows = (data.events || []).map((item) => `<tr><td>${escapeHtml(item.time || "--")}</td><td>${escapeHtml(recordTypeLabel(item.type))}</td><td>${escapeHtml(item.player || "--")}</td><td>${escapeHtml(item.playerId || "--")}</td><td>${escapeHtml(item.message || "--")}</td><td>${escapeHtml(item.source || "--")}</td></tr>`).join("");
  $("#recordTable").innerHTML = `<table><thead><tr><th>时间</th><th>类型</th><th>玩家</th><th>玩家 ID</th><th>内容</th><th>来源</th></tr></thead><tbody>${rows || "<tr><td colspan='6'>暂无玩家记录</td></tr>"}</tbody></table>`;
}

async function loadRconStatus() {
  const data = await api("/api/rcon/status");
  $("#rconStatus").textContent = data.enabled ? `RCON 已启用，本机端口 ${data.port}` : "RCON 未启用。点击“启用 RCON”后需要重启服务器。";
}

async function rconCommand(command) {
  $("#rconOutput").textContent = "正在执行...";
  const data = await api("/api/rcon/command", { method: "POST", body: JSON.stringify({ command }) });
  $("#rconOutput").textContent = data.output || "命令已执行，服务器未返回文本。";
}

async function adminPost(path, payload = {}) {
  $("#rconOutput").textContent = "正在执行...";
  const data = await api(path, { method: "POST", body: JSON.stringify(payload) });
  $("#rconOutput").textContent = data.message || "操作完成。";
}

async function setupRcon() {
  const data = await api("/api/rcon/setup", { method: "POST", body: "{}" });
  $("#operationMessage").textContent = translateMessage(data.message) || "RCON 配置已保存，重启后生效。";
  await loadConfig(); await loadRconStatus();
}

function requireInput(selector, label) {
  const value = $(selector).value.trim();
  if (!value) throw new Error(`请填写${label}。`);
  return value;
}

function worldStatusText(world) {
  if (world.active && world.created) return "当前地图 / 已创建";
  if (world.active && !world.created) return "当前地图 / 待生成";
  return world.created ? "已创建" : "待生成";
}

function worldConfigText(world) {
  return world.hasConfig ? "已保存独立配置" : "未保存";
}

function worldBackupOptions(world) {
  const backups = world.backups || [];
  if (!backups.length) {
    return `<select class="world-restore-select" data-world-id="${escapeHtml(world.id)}" disabled><option value="">暂无备份</option></select>`;
  }
  return `<select class="world-restore-select" data-world-id="${escapeHtml(world.id)}">${backups.map((backup) => `<option value="${escapeHtml(backup.name)}">${escapeHtml(backup.createdAt || backup.stamp || backup.name)} / ${backup.sizeMb} MB</option>`).join("")}</select>`;
}

async function stopServerForWorldAction(actionLabel) {
  await refreshStatus();
  if (!latestStatus || !latestStatus.running) return true;
  if (!confirm(`${actionLabel}需要先停止服务器。是否现在停止服务器并继续？`)) return false;
  $("#operationMessage").textContent = "正在停止服务器...";
  const data = await api("/api/server/stop", { method: "POST", body: "{}" });
  setStatus(data.status);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await refreshStatus();
  if (latestStatus && latestStatus.running) throw new Error("服务器仍在运行，请稍后再试。");
  return true;
}

async function loadWorlds() {
  const data = await api("/api/worlds");
  const running = Boolean(latestStatus && latestStatus.running);
  const rows = (data.worlds || []).map((world) => `
    <tr>
      <td>${world.active ? "<strong>当前</strong>" : ""}</td>
      <td><code>${escapeHtml(world.id)}</code></td>
      <td><input class="world-name-input" data-world-id="${escapeHtml(world.id)}" type="text" value="${escapeHtml(world.name || "")}" placeholder="备注"></td>
      <td>${escapeHtml(worldStatusText(world))}</td>
      <td>${escapeHtml(worldConfigText(world))}</td>
      <td>${world.sizeMb} MB</td>
      <td>${escapeHtml(world.lastWriteTime || "--")}</td>
      <td class="row-actions">
        <div class="restore-control">
          ${worldBackupOptions(world)}
          <button class="warning small" data-world-action="restore" data-world-id="${escapeHtml(world.id)}" ${(world.backups || []).length && !running ? "" : "disabled"}>恢复</button>
        </div>
        <button class="secondary small" data-world-action="rename" data-world-id="${escapeHtml(world.id)}">保存备注</button>
        <button class="secondary small" data-world-action="backup" data-world-id="${escapeHtml(world.id)}">备份</button>
        <button class="secondary small" data-world-action="save-config" data-world-id="${escapeHtml(world.id)}">保存当前配置到此地图</button>
        <button class="secondary small" data-world-action="apply-config" data-world-id="${escapeHtml(world.id)}" ${world.hasConfig ? "" : "disabled"}>应用地图配置</button>
        <button class="danger small" data-world-action="delete-config" data-world-id="${escapeHtml(world.id)}" ${world.hasConfig ? "" : "disabled"}>删除地图配置</button>
        <button class="primary small" data-world-action="switch" data-world-id="${escapeHtml(world.id)}" ${world.active || running ? "disabled" : ""}>切换</button>
      </td>
    </tr>
  `).join("");
  $("#worldTable").innerHTML = `<table><thead><tr><th>当前</th><th>世界 ID</th><th>备注</th><th>状态</th><th>独立配置</th><th>大小</th><th>最后修改</th><th>操作</th></tr></thead><tbody>${rows || "<tr><td colspan='8'>没有发现地图存档</td></tr>"}</tbody></table>`;
  $("#createWorldBtn").disabled = false;
  (data.worlds || []).forEach((world) => {
    const restoreBtn = document.querySelector(`[data-world-action="restore"][data-world-id="${CSS.escape(world.id)}"]`);
    if (restoreBtn && (world.backups || []).length) restoreBtn.disabled = false;
    const switchBtn = document.querySelector(`[data-world-action="switch"][data-world-id="${CSS.escape(world.id)}"]`);
    if (switchBtn && !world.active) switchBtn.disabled = false;
  });
  document.querySelectorAll("[data-world-action]").forEach((btn) => btn.addEventListener("click", () => worldAction(btn.dataset.worldAction, btn.dataset.worldId).catch(showError)));
}

async function worldAction(action, id) {
  if (action === "rename") {
    const input = document.querySelector(`.world-name-input[data-world-id="${CSS.escape(id)}"]`);
    await api("/api/worlds/rename", { method: "POST", body: JSON.stringify({ id, name: input ? input.value : "" }) });
    $("#operationMessage").textContent = "地图备注已保存。";
  }
  if (action === "backup") {
    await api("/api/worlds/backup", { method: "POST", body: JSON.stringify({ id }) });
    $("#operationMessage").textContent = "地图备份已创建。";
  }
  if (action === "restore") {
    const select = document.querySelector(`.world-restore-select[data-world-id="${CSS.escape(id)}"]`);
    const backup = select ? select.value : "";
    if (!backup) throw new Error("请先选择要恢复的地图备份。");
    if (!confirm("恢复会覆盖该地图当前存档。系统会先自动备份当前存档，确定继续吗？")) return;
    if (!(await stopServerForWorldAction("恢复地图"))) return;
    await api("/api/worlds/restore", { method: "POST", body: JSON.stringify({ id, backup }) });
    $("#operationMessage").textContent = "地图已从选定备份恢复，启动服务器后生效。";
  }
  if (action === "switch") {
    if (!(await stopServerForWorldAction("切换地图"))) return;
    await api("/api/worlds/switch", { method: "POST", body: JSON.stringify({ id }) });
    $("#operationMessage").textContent = "地图已切换；如果该地图有独立配置，也已自动应用。启动服务器后生效。";
  }
  if (action === "save-config") {
    await api("/api/worlds/config/save", { method: "POST", body: JSON.stringify({ id }) });
    $("#operationMessage").textContent = "当前配置已保存到该地图。";
  }
  if (action === "apply-config") {
    await api("/api/worlds/config/apply", { method: "POST", body: JSON.stringify({ id }) });
    $("#operationMessage").textContent = "该地图的独立配置已应用，重启服务器后生效。";
    await loadConfig();
  }
  if (action === "delete-config") {
    await api("/api/worlds/config/delete", { method: "POST", body: JSON.stringify({ id }) });
    $("#operationMessage").textContent = "该地图的独立配置已删除。";
  }
  await loadWorlds();
}

async function createWorld() {
  if (!(await stopServerForWorldAction("创建地图"))) return;
  await api("/api/worlds", { method: "POST", body: JSON.stringify({ name: $("#newWorldName").value.trim() }) });
  $("#newWorldName").value = "";
  $("#operationMessage").textContent = "新地图已创建并切换，启动服务器后会生成存档。";
  await loadWorlds();
}

async function setupRestApi() {
  const data = await api("/api/rest/setup", { method: "POST", body: "{}" });
  $("#operationMessage").textContent = translateMessage(data.message) || "REST API 配置已保存。";
  await loadConfig(); await refreshStatus(); await loadPlayers();
}

async function loadBackups() {
  const data = await api("/api/backups");
  const rows = (data.backups || []).map((b) => `<tr><td>${escapeHtml(b.name)}</td><td>${b.sizeMb} MB</td><td>${escapeHtml(b.createdAt)}</td></tr>`).join("");
  $("#backupTable").innerHTML = `<table><thead><tr><th>文件</th><th>大小</th><th>创建时间</th></tr></thead><tbody>${rows || "<tr><td colspan='3'>还没有备份</td></tr>"}</tbody></table>`;
}

async function loadAuditLogs() {
  const action = encodeURIComponent($("#auditAction").value);
  const result = encodeURIComponent($("#auditResult").value);
  const keyword = encodeURIComponent($("#auditKeyword").value.trim());
  const data = await api(`/api/audit-logs?limit=500&action=${action}&result=${result}&keyword=${keyword}`);
  const rows = (data.logs || []).map((item) => {
    const detailText = auditDetailText(item.detail || {});
    return `
    <tr>
      <td>${escapeHtml(item.time || "--")}</td>
      <td>${escapeHtml(item.user || "--")}</td>
      <td>${escapeHtml(item.ip || "--")}</td>
      <td>${escapeHtml(item.computerName || "--")}</td>
      <td>${escapeHtml(item.action || "--")}</td>
      <td>${item.success ? "成功" : "失败"}</td>
      <td class="compact-cell" title="${escapeHtml(detailText)}">${escapeHtml(detailText)}</td>
      <td class="ua-cell" title="${escapeHtml(item.userAgent || "--")}">${escapeHtml(item.userAgent || "--")}</td>
    </tr>
  `;
  }).join("");
  $("#auditTable").innerHTML = `
    <table>
      <thead><tr><th>时间</th><th>用户</th><th>IP</th><th>计算机名称</th><th>动作</th><th>结果</th><th>详情</th><th>浏览器</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='8'>暂无操作记录</td></tr>"}</tbody>
    </table>
  `;
}

function auditDetailText(detail) {
  if (Array.isArray(detail.fields)) {
    return detail.fields.map((field) => {
      const rawKey = field.key || field.field || "";
      const label = settingLabels[rawKey] || field.field || rawKey || "--";
      const key = rawKey && rawKey !== label ? `（${rawKey}）` : "";
      if (Object.prototype.hasOwnProperty.call(field, "oldValue") || Object.prototype.hasOwnProperty.call(field, "newValue")) {
        return `${label}${key}：${field.oldValue ?? ""} -> ${field.newValue ?? ""}`;
      }
      return `${label}${key}`;
    }).join("；");
  }
  if (detail.path) return detail.path;
  return JSON.stringify(detail || {});
}

async function createBackup() {
  $("#backupBtn").disabled = true;
  try { await api("/api/backups", { method: "POST", body: "{}" }); await loadBackups(); }
  finally { $("#backupBtn").disabled = false; }
}

async function loadLogs() {
  const data = await api("/api/logs");
  $("#logs").textContent = data.text || "暂无日志。";
}

let latestPlayerNotes = {};

function initExtraFeatureUi() {
  const nav = document.querySelector("nav");
  const main = document.querySelector(".main");
  if (!nav || !main || $("#tab-tools")) return;
  nav.insertAdjacentHTML("beforeend", `
    <button class="nav-item" data-tab="tools">工具</button>
    <button class="nav-item" data-tab="monitor">监控</button>
    <button class="nav-item" data-tab="users">用户</button>
  `);
  main.insertAdjacentHTML("beforeend", `
    <section class="tab-view" id="tab-tools">
      <section class="panel">
        <div class="panel-title"><h2>服务器更新</h2><button class="warning small" id="updateServerBtn">一键更新</button></div>
        <p class="hint">会自动停服、创建一次完整备份，然后调用 SteamCMD 更新 PalServer。</p>
        <pre class="rcon-output" id="updateOutput">等待操作</pre>
      </section>
      <section class="panel">
        <div class="panel-title"><h2>定时任务</h2><button class="primary small" id="saveScheduleBtn">保存任务</button></div>
        <div class="form-grid">
          <label>任务名称<input id="scheduleName" type="text" placeholder="例如：每 6 小时备份"></label>
          <label>任务类型<select id="scheduleType"><option value="save">保存世界</option><option value="backup">备份存档</option><option value="restart">重启服务器</option></select></label>
          <label>间隔分钟<input id="scheduleInterval" type="number" min="1" value="360"></label>
          <label>重启前广播<input id="scheduleWarning" type="text" placeholder="仅重启任务使用"></label>
        </div>
        <div class="toggles"><label><input id="scheduleEnabled" type="checkbox" checked> 启用</label></div>
        <div class="table" id="scheduleTable"></div>
      </section>
      <section class="panel">
        <div class="panel-title"><h2>公网连通性检查</h2><button class="primary small" id="checkConnectivityBtn">检测</button></div>
        <div class="table" id="connectivityTable"></div>
      </section>
      <section class="panel">
        <div class="panel-title"><h2>配置模板</h2><button class="primary small" id="applyTemplateBtn">应用模板</button></div>
        <div class="form-grid"><label>模板<select id="configTemplateSelect"></select></label></div>
        <div class="table" id="templatePreview"></div>
      </section>
    </section>
    <section class="tab-view" id="tab-monitor">
      <section class="panel">
        <div class="panel-title"><h2>状态监控</h2><button class="primary small" id="refreshMonitorBtn">刷新</button></div>
        <div class="table" id="monitorTable"></div>
      </section>
    </section>
    <section class="tab-view" id="tab-users">
      <section class="panel">
        <div class="panel-title"><h2>面板用户</h2><button class="primary small" id="saveUserBtn">保存用户</button></div>
        <div class="form-grid">
          <label>用户名<input id="panelUserName" type="text"></label>
          <label>密码<input id="panelUserPassword" type="password" placeholder="至少 8 位"></label>
          <label>角色<select id="panelUserRole"><option value="admin">管理员</option><option value="operator">操作员</option><option value="viewer">只读</option></select></label>
        </div>
        <div class="table" id="usersTable"></div>
      </section>
    </section>
  `);
  const logPanel = $("#tab-logs .panel-title");
  if (logPanel && !$("#logKeyword")) {
    logPanel.insertAdjacentHTML("afterend", `
      <div class="record-filters">
        <label>关键词<input id="logKeyword" type="text" placeholder="搜索日志"></label>
        <label>级别<select id="logLevel"><option value="all">全部</option><option value="error">Error</option><option value="warning">Warning</option></select></label>
      </div>
    `);
  }
}

function playerRows(players) {
  return players.map((p) => {
    const id = p.playerId || p.userId || p.name || "";
    const note = latestPlayerNotes[id] ? latestPlayerNotes[id].note || "" : "";
    return `<tr><td>${escapeHtml(p.name || "--")}</td><td>${escapeHtml(id || "--")}</td><td>${p.level ?? "--"}</td><td>${p.ping ?? "--"}</td><td>${escapeHtml(p.ip || "--")}</td><td>${p.location_x ?? "--"}, ${p.location_y ?? "--"}, ${p.location_z ?? "--"}</td><td><input class="player-note-input" data-player-id="${escapeHtml(id)}" type="text" value="${escapeHtml(note)}" placeholder="备注"></td><td class="row-actions"><button class="secondary small" data-player-action="save-note" data-player-id="${escapeHtml(id)}">保存备注</button><button class="warning small" data-player-action="kick" data-player-id="${escapeHtml(id)}">踢出</button><button class="danger small" data-player-action="ban" data-player-id="${escapeHtml(id)}">封禁</button></td></tr>`;
  }).join("");
}

async function loadPlayers() {
  const [data, notes] = await Promise.all([api("/api/players"), api("/api/player-notes")]);
  latestPlayerNotes = notes.notes || {};
  renderPlayers(data);
  document.querySelectorAll("[data-player-action]").forEach((btn) => btn.addEventListener("click", () => playerPanelAction(btn.dataset.playerAction, btn.dataset.playerId).catch(showError)));
}

async function playerPanelAction(action, playerId) {
  if (!playerId) throw new Error("缺少玩家 ID。");
  if (action === "save-note") {
    const input = document.querySelector(`.player-note-input[data-player-id="${CSS.escape(playerId)}"]`);
    await api("/api/player-notes", { method: "POST", body: JSON.stringify({ playerId, note: input ? input.value : "" }) });
    $("#operationMessage").textContent = "玩家备注已保存。";
  }
  if (action === "kick") await adminPost("/api/admin/kick", { userid: playerId });
  if (action === "ban") await adminPost("/api/admin/ban", { userid: playerId });
}

async function loadLogs() {
  const keyword = encodeURIComponent($("#logKeyword") ? $("#logKeyword").value.trim() : "");
  const level = encodeURIComponent($("#logLevel") ? $("#logLevel").value : "all");
  const data = await api(`/api/logs?keyword=${keyword}&level=${level}`);
  $("#logs").textContent = data.text || "暂无日志。";
}

async function runUpdateServer() {
  if (!confirm("更新会自动停服并创建备份，确认继续吗？")) return;
  $("#updateOutput").textContent = "正在更新，请等待 SteamCMD 完成...";
  const data = await api("/api/update", { method: "POST", body: "{}" });
  $("#updateOutput").textContent = data.result && data.result.output ? data.result.output : "更新完成。";
}

async function loadSchedules() {
  const data = await api("/api/schedules");
  const rows = (data.schedules || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.type)}</td><td>${item.intervalMinutes}</td><td>${item.enabled ? "启用" : "停用"}</td><td>${escapeHtml(item.lastRunText || "--")}</td><td>${escapeHtml(item.lastResult || "--")}</td><td><button class="danger small" data-schedule-delete="${escapeHtml(item.id)}">删除</button></td></tr>`).join("");
  $("#scheduleTable").innerHTML = `<table><thead><tr><th>名称</th><th>类型</th><th>间隔分钟</th><th>状态</th><th>上次执行</th><th>结果</th><th>操作</th></tr></thead><tbody>${rows || "<tr><td colspan='7'>暂无任务</td></tr>"}</tbody></table>`;
  document.querySelectorAll("[data-schedule-delete]").forEach((btn) => btn.addEventListener("click", async () => { await api("/api/schedules/delete", { method: "POST", body: JSON.stringify({ id: btn.dataset.scheduleDelete }) }); await loadSchedules(); }));
}

async function saveSchedule() {
  await api("/api/schedules", { method: "POST", body: JSON.stringify({ name: $("#scheduleName").value, type: $("#scheduleType").value, intervalMinutes: $("#scheduleInterval").value, warning: $("#scheduleWarning").value, enabled: $("#scheduleEnabled").checked }) });
  await loadSchedules();
}

async function loadConnectivity() {
  const data = await api("/api/connectivity");
  $("#connectivityTable").innerHTML = `<table><tbody><tr><th>公网域名</th><td>${escapeHtml(data.host)}</td></tr><tr><th>解析 IP</th><td>${escapeHtml(data.resolvedIp || "--")}</td></tr><tr><th>本机 IP</th><td>${escapeHtml(data.localIp)}</td></tr><tr><th>UDP 游戏端口</th><td>${data.gamePort} / ${data.udpListening ? "本机监听中" : "未监听"}</td></tr><tr><th>TCP 面板端口</th><td>${data.panelPort} / ${data.tcpListening ? "本机监听中" : "未监听"}</td></tr></tbody></table>`;
}

async function loadTemplates() {
  const data = await api("/api/config/templates");
  const items = Object.entries(data.templates || {});
  $("#configTemplateSelect").innerHTML = items.map(([key, item]) => `<option value="${escapeHtml(key)}">${escapeHtml(item.name)}</option>`).join("");
  renderTemplatePreview(data.templates || {});
  $("#configTemplateSelect").onchange = () => renderTemplatePreview(data.templates || {});
}

function renderTemplatePreview(templates) {
  const selected = $("#configTemplateSelect").value;
  const settings = templates[selected] ? templates[selected].settings || {} : {};
  const rows = Object.entries(settings).map(([key, value]) => `<tr><td>${escapeHtml(settingLabels[key] || key)}</td><td><code>${escapeHtml(key)}</code></td><td>${escapeHtml(value)}</td></tr>`).join("");
  $("#templatePreview").innerHTML = `<table><thead><tr><th>配置</th><th>字段</th><th>模板值</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function applyTemplate() {
  await api("/api/config/template", { method: "POST", body: JSON.stringify({ name: $("#configTemplateSelect").value }) });
  $("#operationMessage").textContent = "配置模板已应用，重启服务器后生效。";
  await loadConfig();
}

async function loadMonitor() {
  const data = await api("/api/monitor");
  const cur = data.current || {};
  const worlds = (cur.worlds || []).map((w) => `${w.name || w.id}: ${w.sizeMb} MB`).join("<br>");
  $("#monitorTable").innerHTML = `<table><tbody><tr><th>时间</th><td>${escapeHtml(cur.time || "--")}</td></tr><tr><th>系统内存</th><td>${cur.freeMemMb} MB 可用 / ${cur.totalMemMb} MB</td></tr><tr><th>面板内存</th><td>${cur.panelMemMb} MB</td></tr><tr><th>存档总大小</th><td>${cur.saveSizeMb} MB</td></tr><tr><th>地图大小</th><td>${worlds || "--"}</td></tr><tr><th>历史点数</th><td>${(data.history || []).length}</td></tr></tbody></table>`;
}

async function loadUsers() {
  const data = await api("/api/users");
  const rows = (data.users || []).map((u) => `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.createdAt || "--")}</td><td><button class="danger small" data-user-delete="${escapeHtml(u.username)}">删除</button></td></tr>`).join("");
  $("#usersTable").innerHTML = `<table><thead><tr><th>用户名</th><th>角色</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>暂无用户</td></tr>"}</tbody></table>`;
  document.querySelectorAll("[data-user-delete]").forEach((btn) => btn.addEventListener("click", async () => { await api("/api/users/delete", { method: "POST", body: JSON.stringify({ username: btn.dataset.userDelete }) }); await loadUsers(); }));
}

async function saveUser() {
  await api("/api/users", { method: "POST", body: JSON.stringify({ username: $("#panelUserName").value, password: $("#panelUserPassword").value, role: $("#panelUserRole").value }) });
  $("#panelUserPassword").value = "";
  await loadUsers();
}

function bindExtraFeatures() {
  const tools = document.querySelector('[data-tab="tools"]');
  const monitor = document.querySelector('[data-tab="monitor"]');
  const users = document.querySelector('[data-tab="users"]');
  if (tools) tools.addEventListener("click", () => { loadSchedules().catch(showError); loadConnectivity().catch(showError); loadTemplates().catch(showError); });
  if (monitor) monitor.addEventListener("click", () => loadMonitor().catch(showError));
  if (users) users.addEventListener("click", () => loadUsers().catch(showError));
  $("#updateServerBtn").addEventListener("click", () => runUpdateServer().catch(showError));
  $("#saveScheduleBtn").addEventListener("click", () => saveSchedule().catch(showError));
  $("#checkConnectivityBtn").addEventListener("click", () => loadConnectivity().catch(showError));
  $("#applyTemplateBtn").addEventListener("click", () => applyTemplate().catch(showError));
  $("#refreshMonitorBtn").addEventListener("click", () => loadMonitor().catch(showError));
  $("#saveUserBtn").addEventListener("click", () => saveUser().catch(showError));
  $("#logKeyword").addEventListener("input", () => loadLogs().catch(showError));
  $("#logLevel").addEventListener("change", () => loadLogs().catch(showError));
}

function setupTabs() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-view").forEach((view) => view.classList.remove("active"));
      btn.classList.add("active"); $("#tab-" + btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "settings") loadConfig().catch(showError);
      if (btn.dataset.tab === "players") { loadPlayers().catch(showError); loadPlayerStats().catch(showError); }
      if (btn.dataset.tab === "records") loadRecords().catch(showError);
      if (btn.dataset.tab === "admin") loadRconStatus().catch(showError);
      if (btn.dataset.tab === "worlds") loadWorlds().catch(showError);
      if (btn.dataset.tab === "backups") loadBackups().catch(showError);
      if (btn.dataset.tab === "audit") loadAuditLogs().catch(showError);
      if (btn.dataset.tab === "logs") loadLogs().catch(showError);
    });
  });
}

function showError(error) {
  $("#operationMessage").textContent = error.message || String(error);
  if ($("#tab-admin").classList.contains("active")) $("#rconOutput").textContent = error.message || String(error);
}

function bindEvents() {
  $("#refreshBtn").addEventListener("click", () => refreshStatus().catch(showError));
  $("#logoutBtn").addEventListener("click", () => logout().catch(showError));
  $("#copyConnectBtn").addEventListener("click", () => copyConnectAddress().catch(showError));
  $("#changePasswordBtn").addEventListener("click", () => $("#passwordPanel").classList.toggle("visible"));
  $("#closePasswordPanelBtn").addEventListener("click", () => $("#passwordPanel").classList.remove("visible"));
  $("#savePanelPasswordBtn").addEventListener("click", () => changePanelPassword().catch(showError));
  $("#saveSettingsBtn").addEventListener("click", () => saveSettings().catch(showError));
  $("#saveTranslatedConfigBtn").addEventListener("click", () => saveTranslatedConfig().catch(showError));
  $("#saveRawBtn").addEventListener("click", () => saveRaw().catch(showError));
  $("#backupBtn").addEventListener("click", () => createBackup().catch(showError));
  $("#refreshAuditBtn").addEventListener("click", () => loadAuditLogs().catch(showError));
  $("#auditAction").addEventListener("change", () => loadAuditLogs().catch(showError));
  $("#auditResult").addEventListener("change", () => loadAuditLogs().catch(showError));
  $("#auditKeyword").addEventListener("input", () => loadAuditLogs().catch(showError));
  $("#refreshLogsBtn").addEventListener("click", () => loadLogs().catch(showError));
  $("#refreshPlayersBtn").addEventListener("click", () => loadPlayers().catch(showError));
  $("#refreshPlayersBtn2").addEventListener("click", () => loadPlayers().catch(showError));
  $("#refreshPlayerStatsBtn").addEventListener("click", () => loadPlayerStats().catch(showError));
  $("#refreshRecordsBtn").addEventListener("click", () => loadRecords().catch(showError));
  $("#refreshWorldsBtn").addEventListener("click", () => loadWorlds().catch(showError));
  $("#createWorldBtn").addEventListener("click", () => createWorld().catch(showError));
  $("#recordType").addEventListener("change", () => loadRecords().catch(showError));
  $("#recordPlayer").addEventListener("input", () => loadRecords().catch(showError));
  $("#setupRestBtn").addEventListener("click", () => setupRestApi().catch(showError));
  $("#setupRconBtn").addEventListener("click", () => setupRcon().catch(showError));
  $("#rconShowPlayersBtn").addEventListener("click", () => rconCommand("ShowPlayers").catch(showError));
  $("#adminSaveBtn").addEventListener("click", () => adminPost("/api/admin/save").catch(showError));
  $("#broadcastBtn").addEventListener("click", () => adminPost("/api/admin/announce", { message: requireInput("#broadcastMessage", "广播内容") }).catch(showError));
  $("#kickBtn").addEventListener("click", () => adminPost("/api/admin/kick", { userid: requireInput("#kickTarget", "踢出目标 UserID") }).catch(showError));
  $("#banBtn").addEventListener("click", () => adminPost("/api/admin/ban", { userid: requireInput("#banTarget", "封禁目标 UserID") }).catch(showError));
  $("#customRconBtn").addEventListener("click", () => rconCommand(requireInput("#customRconCommand", "RCON 命令")).catch(showError));
  document.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", () => serverAction(btn.dataset.action).catch(showError)));
}

initExtraFeatureUi();
setupTabs();
bindEvents();
bindExtraFeatures();
refreshStatus().catch(showError);
loadConfig().catch(showError);
loadPlayers().catch(showError);
loadPlayerStats().catch(showError);
loadRecords().catch(showError);
loadWorlds().catch(showError);
loadRconStatus().catch(showError);
loadAuditLogs().catch(showError);
setInterval(() => refreshStatus().catch(() => {}), 5000);
setInterval(() => loadPlayers().catch(() => {}), 10000);
setInterval(() => loadPlayerStats().catch(() => {}), 10000);
setInterval(() => loadRecords().catch(() => {}), 10000);
