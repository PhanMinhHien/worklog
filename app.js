import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  getDocs,
  getDoc,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// ==================== BASIC UI PROTECTION ====================

// Disable right-click
// document.addEventListener("contextmenu", (e) => {
//   e.preventDefault();
// });

// // Disable common source/devtools shortcuts
// document.addEventListener("keydown", (e) => {
//   // F12
//   if (e.key === "F12") {
//     e.preventDefault();
//     return;
//   }

//   // Ctrl + U / Cmd + U — View Source
//   if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
//     e.preventDefault();
//     return;
//   }

//   // Ctrl + Shift + I / Cmd + Option + I — DevTools
//   if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i") {
//     e.preventDefault();
//     return;
//   }

//   // Ctrl + Shift + J / Cmd + Option + J — Console
//   if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "j") {
//     e.preventDefault();
//     return;
//   }

//   // Ctrl + Shift + C / Cmd + Shift + C — Inspect Element
//   if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
//     e.preventDefault();
//     return;
//   }
// });
let selectedWorkWeekDate = "";
const $ = (id) => document.getElementById(id);
// ========================================
// PERSISTENT UI PREFERENCES
// ========================================

const UI_PREFERENCES_KEY = "worklog-ui-preferences-v1";

// Đọc thiết lập đã lưu
function readUiPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY) || "{}");

    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch (err) {
    console.warn("Could not read saved UI preferences:", err);
    return {};
  }
}

// Lưu hoặc cập nhật một phần thiết lập
function saveUiPreferences(patch) {
  try {
    const current = readUiPreferences();

    localStorage.setItem(
      UI_PREFERENCES_KEY,
      JSON.stringify({
        ...current,
        ...patch,
      }),
    );
  } catch (err) {
    console.warn("Could not save UI preferences:", err);
  }
}

// ========================================
// TASK FILTERS - PERSISTENT PREFERENCES
// ========================================

function saveTaskFilterPreferences() {
  saveUiPreferences({
    taskFilters: {
      search: $("taskSearch")?.value || "",
      status: $("taskStatusFilter")?.value || "all",
      type: $("taskTypeFilter")?.value || "all",
      log: $("taskLogFilter")?.value || "all",
      date: $("taskDateFilter")?.value || "this-week",
      customDate: $("taskCustomDate")?.value || "",
    },
  });
}

function restoreTaskFilterPreferences() {
  const saved = readUiPreferences().taskFilters || {};

  const setSelectValue = (id, value, fallback) => {
    const select = $(id);
    if (!select) return;

    const targetValue = value || fallback;

    if (
      Array.from(select.options).some((option) => option.value === targetValue)
    ) {
      select.value = targetValue;
    } else {
      select.value = fallback;
    }
  };

  if ($("taskSearch")) {
    $("taskSearch").value = saved.search || "";
  }

  setSelectValue("taskStatusFilter", saved.status, "all");
  setSelectValue("taskTypeFilter", saved.type, "all");
  setSelectValue("taskLogFilter", saved.log, "all");

  // Mặc định This week nếu chưa có lựa chọn được lưu
  setSelectValue("taskDateFilter", saved.date, "this-week");

  if ($("taskCustomDate")) {
    $("taskCustomDate").value = saved.customDate || "";

    $("taskCustomDate").style.display =
      $("taskDateFilter")?.value === "custom" ? "" : "none";
  }
}

// Theo dõi trạng thái tải dữ liệu ban đầu
let clientsSnapshotReady = false;
let tasksSnapshotReady = false;
let taskFiltersRestored = false;

// Chỉ restore khi cả Clients và Tasks đã tải xong
function tryRestoreTaskFilterPreferences() {
  if (taskFiltersRestored || !clientsSnapshotReady || !tasksSnapshotReady) {
    return;
  }

  restoreTaskFilterPreferences();
  taskFiltersRestored = true;

  console.log("[Task Filters] Preferences restored");
}
function applyTheme(theme) {
  const isDark = theme === "dark";

  document.documentElement.dataset.theme = isDark ? "dark" : "light";

  const icon = $("themeToggleIcon");
  const text = $("themeToggleText");

  if (icon) {
    icon.textContent = isDark ? "☀️" : "🌙";
  }

  if (text) {
    text.textContent = isDark ? "Light mode" : "Dark mode";
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem("worklog-theme") || "light";

  applyTheme(savedTheme);

  const toggle = $("themeToggleBtn");

  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || "light";

    const next = current === "dark" ? "light" : "dark";

    localStorage.setItem("worklog-theme", next);

    applyTheme(next);
  });
}

initTheme();
initSidebarToggle();
const TASK_TYPES = [
  "Article page creation",
  "Article page versioning",
  "Banner release",
  "Dynamic Banner Creation",
  "Dynamic Banner Versioning",
  "Graphics Production",
  "Landing page creation",
  "Landing page versioning",
  "Newsletter creation",
  "Newsletter repetition",
  "Newsletter versioning",
  "PDF production & editing request",
  "Print material design request",
  "Static Banner Creation",
  "Static Banner Versioning",
  "TODAY Newsletter",
  "Teaser creation",
  "Video creation, editing & upload request",
  "Web content editing",
];
const FIXED_ASSET_TIMES = {
  "Banner release": 15,
  "Teaser creation": 30,
};
// const STATUS = {
//   OPEN: "open",
//   IN_APPROVAL: "in_approval",
//   IN_CORRECTION: "in_correction",
//   EXECUTION_PROOF: "execution_proof",
//   IN_PRODUCTION: "in_production",
//   COMPLETED: "completed",
//   WAITING: "waiting",
//   ARCHIVED: "archived",
// };
// const STATUS_META = {
//   open: { label: "New", icon: "🟡", cls: "status-open" },
//   in_progress: { label: "In Approval", icon: "🔵", cls: "status-progress" },
//   waiting: { label: "Waiting", icon: "🟣", cls: "status-waiting" },
//   completed: { label: "Completed", icon: "🟢", cls: "status-completed" },
//   archived: { label: "Archived", icon: "⚫", cls: "status-archived" },
// };
const STATUS = {
  OPEN: "open",
  IN_PRODUCTION: "in_production",
  IN_APPROVAL: "in_approval",
  EXECUTION_PROOF: "execution_proof",
  COMPLETED: "completed",
  ARCHIVED: "archived",
};

const STATUS_META = {
  [STATUS.OPEN]: {
    label: "New",
    icon: "1.",
    cls: "status-open",
  },

  [STATUS.IN_PRODUCTION]: {
    label: "In Production",
    icon: "2.",
    cls: "status-production",
  },

  [STATUS.IN_APPROVAL]: {
    label: "In Approval",
    icon: "3.",
    cls: "status-approval",
  },

  [STATUS.EXECUTION_PROOF]: {
    label: "Execution Proof",
    icon: "4.",
    cls: "status-execution-proof",
  },

  [STATUS.COMPLETED]: {
    label: "Completed",
    icon: "5.",
    cls: "status-completed",
  },

  [STATUS.ARCHIVED]: {
    label: "Archived",
    icon: "6.",
    cls: "status-archived",
  },
};

const state = {
  clients: [],
  tasks: [],
  workSessions: [],
  combos: [],

  corrections: [],
  activities: [],
  workDays: [],
  activePage: "dashboard",
  showArchived: false,
  pendingConfirm: null,
};
// ========================================
// TASK BOARD VIEW + BULK SELECTION
// ========================================

let taskViewMode = localStorage.getItem("worklog_task_view_mode") || "status";

let selectedAssetType = "all";
// ========================================
// COMBO TASK VIEW
// ========================================

const expandedComboIds = new Set();
const selectedTaskIds = new Set();

let currentVisibleTaskIds = [];
let dataLockCountdownTimer = null;

function clearDataLockCountdown() {
  if (dataLockCountdownTimer) {
    clearInterval(dataLockCountdownTimer);
    dataLockCountdownTimer = null;
  }
}

function formatDataLockCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function renderDataLockCountdown() {
  const el = $("appLockSessionStatus");

  if (!el) return;

  const expiresAt = Number(
    sessionStorage.getItem(DATA_UNLOCK_EXPIRES_KEY) || 0,
  );

  if (!dataUnlocked || !expiresAt) {
    el.textContent = "Locked";
    return;
  }

  const remainingMs = expiresAt - Date.now();

  if (remainingMs <= 0) {
    el.textContent = "Expired";
    return;
  }

  el.textContent = `Expires in ${formatDataLockCountdown(remainingMs)}`;
}

function startDataLockCountdown() {
  clearDataLockCountdown();

  renderDataLockCountdown();

  dataLockCountdownTimer = setInterval(() => {
    renderDataLockCountdown();
  }, 1000);
}
const TASK_DEFAULTS_SETTINGS_DOC = "taskDefaults";

let defaultTaskClientId = "";
const APP_LOCK_DOC = "appLock";

const DATA_SESSION_MINUTES = 240;
const DATA_SESSION_MS = DATA_SESSION_MINUTES * 60 * 1000;

const DATA_UNLOCK_EXPIRES_KEY = "worklog-data-unlock-expires-at";

let dataUnlocked =
  Number(sessionStorage.getItem(DATA_UNLOCK_EXPIRES_KEY) || 0) > Date.now();

let dataLockTimer = null;

let appLockPasswordHash = "";

let unsubscribeListeners = [];

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const data = encoder.encode(password);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadAppLockConfig() {
  try {
    const ref = doc(db, "settings", APP_LOCK_DOC);

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("Data lock config does not exist.");

      appLockPasswordHash = "";

      return false;
    }

    const data = snap.data();

    appLockPasswordHash = data.passwordHash || "";

    return Boolean(appLockPasswordHash);
  } catch (err) {
    console.error("Failed to load data lock config:", err);

    return false;
  }
}

async function loadTaskDefaultsSettings() {
  try {
    const ref = doc(db, "settings", TASK_DEFAULTS_SETTINGS_DOC);

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      defaultTaskClientId = "";
      return false;
    }

    const data = snap.data();

    defaultTaskClientId = data.defaultClientId || "";

    return true;
  } catch (err) {
    console.error("Failed to load task defaults settings:", err);

    defaultTaskClientId = "";

    return false;
  }
}
function renderTaskDefaultsSettings() {
  const select = $("defaultTaskClientId");

  if (!select) return;

  const clients = [...state.clients].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );

  select.innerHTML =
    `<option value="">No default client</option>` +
    clients
      .map(
        (client) =>
          `<option value="${escapeHtml(client.id)}">
            ${escapeHtml(client.name)}
          </option>`,
      )
      .join("");

  const exists = clients.some((client) => client.id === defaultTaskClientId);

  select.value = exists ? defaultTaskClientId : "";
}
async function saveTaskDefaultsSettings() {
  const defaultClientId = $("defaultTaskClientId")?.value || "";

  try {
    await setDoc(
      doc(db, "settings", TASK_DEFAULTS_SETTINGS_DOC),
      {
        defaultClientId,
        updatedAt: serverTimestamp(),
      },
      {
        merge: true,
      },
    );

    defaultTaskClientId = defaultClientId;

    notify("Default client saved.");
  } catch (err) {
    console.error("Failed to save task defaults settings:", err);

    notify("Failed to save default client.", "error");
  }
}

async function loadWorkHoursSettings() {
  try {
    const ref = doc(db, "settings", WORK_HOURS_SETTINGS_DOC);

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("Work hours settings do not exist yet.");

      return false;
    }

    const data = snap.data();

    dailyTargetMinutes = Math.max(0, Number(data.dailyTargetMinutes) || 0);

    openingFlexiMinutes = Math.max(0, Number(data.openingFlexiMinutes) || 0);

    return true;
  } catch (err) {
    console.error("Failed to load work hours settings:", err);

    return false;
  }
}
function renderWorkHoursSettings() {
  const dailyTargetInput = $("dailyTargetMinutes");
  const openingFlexiInput = $("openingFlexiMinutes");

  if (dailyTargetInput) {
    dailyTargetInput.value = dailyTargetMinutes;
  }

  if (openingFlexiInput) {
    openingFlexiInput.value = openingFlexiMinutes;
  }
}
async function saveWorkHoursSettings(e) {
  e.preventDefault();

  const dailyTarget = Math.max(0, Number($("dailyTargetMinutes")?.value) || 0);

  const openingFlexi = Math.max(
    0,
    Number($("openingFlexiMinutes")?.value) || 0,
  );

  try {
    await setDoc(
      doc(db, "settings", WORK_HOURS_SETTINGS_DOC),
      {
        dailyTargetMinutes: dailyTarget,
        openingFlexiMinutes: openingFlexi,
        updatedAt: serverTimestamp(),
      },
      {
        merge: true,
      },
    );

    dailyTargetMinutes = dailyTarget;
    openingFlexiMinutes = openingFlexi;

    renderWorkHours();

    const status = $("workHoursSettingsStatus");

    if (status) {
      status.textContent = "Saved.";
    }

    notify("Work hours settings saved.");
  } catch (err) {
    console.error("Failed to save work hours settings:", err);

    notify("Failed to save work hours settings.", "error");
  }
}
const today = () => localDateString();
const escapeHtml = (v = "") =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
const minutes = (h, m) => Math.max(0, Number(h || 0) * 60 + Number(m || 0));
const formatDuration = (mins = 0) => {
  mins = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(mins / 60),
    m = mins % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
};
const dateLabel = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No date";
const shortDate = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";
const timeAgo = (ts) => {
  let millis = null;

  if (!ts) {
    return "Recently";
  }

  // Firebase Timestamp
  if (typeof ts.toMillis === "function") {
    millis = ts.toMillis();
  } else if (typeof ts.toDate === "function") {
    millis = ts.toDate().getTime();
  }

  // Firebase Timestamp-like object
  else if (typeof ts === "object" && Number.isFinite(Number(ts.seconds))) {
    millis =
      Number(ts.seconds) * 1000 + Math.floor(Number(ts.nanoseconds || 0) / 1e6);
  }

  // JavaScript Date
  else if (ts instanceof Date) {
    millis = ts.getTime();
  }

  // Number timestamp
  else if (typeof ts === "number") {
    millis = ts;
  }

  // String date
  else if (typeof ts === "string") {
    millis = new Date(ts).getTime();
  }

  // Invalid timestamp
  if (!Number.isFinite(millis)) {
    return "Recently";
  }

  const diff = Math.max(0, Date.now() - millis);
  const min = Math.floor(diff / 60000);

  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);

  if (hr < 24) return `${hr}h ago`;

  return `${Math.floor(hr / 24)}d ago`;
};
const getTask = (id) => state.tasks.find((t) => t.id === id);
function getClient(clientId) {
  return state.clients.find((client) => client.id === clientId);
}

function getClientTypes(clientId) {
  const client = getClient(clientId);

  return Array.isArray(client?.types) ? client.types : [];
}
function getClientFixedTimes(clientId) {
  const client = getClient(clientId);

  if (
    !client ||
    !client.fixedTimeTypes ||
    typeof client.fixedTimeTypes !== "object"
  ) {
    return {};
  }

  return client.fixedTimeTypes;
}

function getFixedMinutesPerAsset(clientId, type) {
  if (!clientId || !type) return 0;

  const client = getClient(clientId);

  if (!client) return 0;

  /*
   * New Client-specific configuration.
   *
   * Important:
   * An existing fixedTimeTypes object is authoritative.
   * If the type is not inside it, it is NOT fixed time.
   */
  if (client.fixedTimeTypes && typeof client.fixedTimeTypes === "object") {
    if (Object.prototype.hasOwnProperty.call(client.fixedTimeTypes, type)) {
      return Math.max(0, Number(client.fixedTimeTypes[type]) || 0);
    }

    return 0;
  }

  /*
   * Legacy fallback.
   *
   * Old Clients do not have fixedTimeTypes yet,
   * so keep the old global configuration working.
   */
  return Math.max(0, Number(FIXED_ASSET_TIMES[type]) || 0);
}

function getClientName(clientId) {
  return getClient(clientId)?.name || "";
}

function getClientByName(name) {
  if (!name) return null;

  return state.clients.find(
    (client) =>
      String(client.name || "")
        .trim()
        .toLowerCase() ===
      String(name || "")
        .trim()
        .toLowerCase(),
  );
}

function getAllClientTypes() {
  return [
    ...new Set(
      state.clients.flatMap((client) =>
        Array.isArray(client.types) ? client.types : [],
      ),
    ),
  ].sort();
}
// const taskMinutes = (id) => state.workSessions.filter((x) => x.taskId === id).reduce((s, x) => s + (Number(x.duration) || 0), 0) + state.corrections.filter((x) => x.taskId === id).reduce((s, x) => s + (Number(x.duration) || 0), 0);
// const normalMinutes = (id) => state.workSessions.filter((x) => x.taskId === id).reduce((s, x) => s + (Number(x.duration) || 0), 0);
// const correctionMinutes = (id) => state.corrections.filter((x) => x.taskId === id).reduce((s, x) => s + (Number(x.duration) || 0), 0);

const WORK_HOURS_SETTINGS_DOC = "workHours";

let dailyTargetMinutes = 0;
let openingFlexiMinutes = 0;

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseTimeToMinutes(value) {
  if (!value || !value.includes(":")) return null;

  const [h, m] = value.split(":").map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return null;
  }

  return h * 60 + m;
}

function calculateWorkDay(checkIn, checkOut, lunchMinutes = 0) {
  const start = parseTimeToMinutes(checkIn);
  const end = parseTimeToMinutes(checkOut);
  const lunch = Math.max(0, Number(lunchMinutes) || 0);

  if (start === null || end === null) {
    return {
      actualMinutes: 0,
      normalMinutes: 0,
      flexiMinutes: 0,
      valid: false,
    };
  }

  let gross = end - start;

  if (gross < 0) {
    gross += 24 * 60;
  }

  const actual = Math.max(0, gross - lunch);
  const target = dailyTargetMinutes || 480;

  return {
    actualMinutes: actual,
    normalMinutes: Math.min(actual, target),

    // Flexi có thể âm nếu làm chưa đủ giờ
    flexiMinutes: actual - target,

    valid: true,
  };
}

function getMonday(dateString) {
  const d = new Date(`${dateString}T00:00:00`);
  const day = d.getDay();

  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);

  return localDateString(d);
}

function getSunday(dateString) {
  const monday = new Date(`${getMonday(dateString)}T00:00:00`);
  monday.setDate(monday.getDate() + 6);
  return localDateString(monday);
}

function getWeekDates(dateString = today()) {
  const monday = new Date(`${getMonday(dateString)}T00:00:00`);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateString(d);
  });
}

function getWorkDay(date) {
  return state.workDays.find((x) => x.date === date);
}

function getWeekWorkDays(date = today()) {
  const dates = new Set(getWeekDates(date));
  return state.workDays
    .filter((x) => dates.has(x.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// function weekFlexiMinutes(date = today()) {
//   return getWeekWorkDays(date).reduce((sum, x) => sum + (Number(x.flexiMinutes) || 0), 0);
// }

// function weekActualMinutes(date = today()) {
//   return getWeekWorkDays(date).reduce((sum, x) => sum + (Number(x.actualMinutes) || 0), 0);
// }
function getWorkDayFlexiMinutes(day) {
  if (!day) return 0;

  // Leave luôn trừ 8 tiếng
  if (day.isLeave) {
    return -480;
  }

  // Tính lại cả dữ liệu cũ để những ngày trước đây
  // làm thiếu giờ cũng được trừ Flexi.
  const actual = Number(day.actualMinutes) || 0;
  const target = dailyTargetMinutes || 480;

  return actual - target;
}

function weekFlexiMinutes(date = today()) {
  return getWeekWorkDays(date).reduce(
    (sum, day) => sum + getWorkDayFlexiMinutes(day),
    0,
  );
}

function weekActualMinutes(date = today()) {
  return getWeekWorkDays(date).reduce(
    (sum, day) => sum + (Number(day.actualMinutes) || 0),
    0,
  );
}

function availableFlexiMinutes(date = today()) {
  const accumulatedFlexi = state.workDays
    .filter((day) => day.date && day.date <= date)
    .reduce((sum, day) => sum + getWorkDayFlexiMinutes(day), 0);

  return openingFlexiMinutes + accumulatedFlexi;
}

function formatFlexi(mins = 0) {
  const value = Math.round(Number(mins) || 0);

  if (value < 0) {
    return "-" + formatDuration(Math.abs(value));
  }

  return formatDuration(value);
}
// function availableFlexiMinutes(date = today()) {
//   return openingFlexiMinutes + weekFlexiMinutes(date);
// }

// function availableFlexiMinutes(date = today()) {
//   const accumulatedFlexi = state.workDays
//     .filter((x) => x.date && x.date <= date)
//     .reduce(
//       (sum, x) => sum + (Number(x.flexiMinutes) || 0),
//       0,
//     );

//   return openingFlexiMinutes + accumulatedFlexi;
// }

// function formatFlexi(mins = 0) {
//   const value = Math.max(0, Math.round(Number(mins) || 0));
//   return formatDuration(value);
// }

let notificationQueue = [];
let activeNotification = null;

function ensureNotificationModalStyles() {
  if (document.getElementById("notificationModalStyles")) return;

  const style = document.createElement("style");
  style.id = "notificationModalStyles";

  style.textContent = `
    .app-notify-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, .55);
      backdrop-filter: blur(4px);
      animation: notifyFadeIn .18s ease;
    }

    .app-notify-dialog {
      width: 100%;
      max-width: 390px;
      padding: 26px;
      border: 1px solid var(--border, #333);
      border-radius: 16px;
      background: var(--card, #1e1e1e);
      color: var(--text, #fff);
      box-shadow: 0 20px 60px rgba(0, 0, 0, .3);
      text-align: center;
      animation: notifyScaleIn .2s ease;
    }

    .app-notify-icon {
      width: 52px;
      height: 52px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 25px;
      font-weight: 700;
    }

    .app-notify-dialog.success .app-notify-icon {
      background: rgba(34, 197, 94, .13);
      color: #22c55e;
    }

    .app-notify-dialog.error .app-notify-icon {
      background: rgba(239, 68, 68, .13);
      color: #ef4444;
    }

    .app-notify-dialog.warning .app-notify-icon {
      background: rgba(245, 158, 11, .13);
      color: #f59e0b;
    }

    .app-notify-dialog.info .app-notify-icon {
      background: rgba(59, 130, 246, .13);
      color: #3b82f6;
    }

    .app-notify-title {
      margin: 0 0 9px;
      font-size: 18px;
      font-weight: 700;
    }

    .app-notify-message {
      margin: 0;
      color: var(--muted, #999);
      font-size: 13px;
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .app-notify-button {
      width: 100%;
      margin-top: 23px;
      padding: 11px 16px;
      border: none;
      border-radius: 9px;
      background: var(--primary, #6366f1);
      color: white;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .2s, transform .2s;
    }

    .app-notify-button:hover {
      opacity: .88;
      transform: translateY(-1px);
    }

    .app-notify-loading {
      width: 25px;
      height: 25px;
      margin: 0 auto 15px;
      border: 3px solid var(--border, #444);
      border-top-color: var(--primary, #6366f1);
      border-radius: 50%;
      animation: notifySpin .8s linear infinite;
    }

    @keyframes notifyFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes notifyScaleIn {
      from {
        opacity: 0;
        transform: scale(.96) translateY(8px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    @keyframes notifySpin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 480px) {
      .app-notify-dialog {
        padding: 22px;
      }
    }
  `;

  document.head.appendChild(style);
}

function renderNextNotification() {
  if (activeNotification || !notificationQueue.length) return;

  const item = notificationQueue.shift();
  activeNotification = item;

  ensureNotificationModalStyles();

  const overlay = document.createElement("div");
  overlay.className = "app-notify-overlay";

  const dialog = document.createElement("div");
  dialog.className = `app-notify-dialog ${item.type}`;
  dialog.setAttribute("role", item.loading ? "status" : "alertdialog");
  dialog.setAttribute("aria-modal", "true");

  if (item.loading) {
    dialog.innerHTML = `
      <div class="app-notify-loading"></div>
      <h3 class="app-notify-title">Please wait</h3>
      <p class="app-notify-message"></p>
    `;
  } else {
    const icons = {
      success: "✓",
      error: "×",
      warning: "!",
      info: "i",
    };

    const titles = {
      success: "Success",
      error: "Something went wrong",
      warning: "Attention",
      info: "Information",
    };

    const icon = document.createElement("div");
    icon.className = "app-notify-icon";
    icon.textContent = icons[item.type] || icons.info;

    const title = document.createElement("h3");
    title.className = "app-notify-title";
    title.textContent = titles[item.type] || titles.info;

    const button = document.createElement("button");
    button.className = "app-notify-button";
    button.type = "button";
    button.textContent = "OK";
    button.addEventListener("click", item.remove);

    dialog.append(icon, title, button);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) item.remove();
    });
  }

  const message = dialog.querySelector(".app-notify-message");

  if (message) {
    message.textContent = item.message;
  } else {
    const p = document.createElement("p");
    p.className = "app-notify-message";
    p.textContent = item.message;
    dialog.insertBefore(p, dialog.querySelector(".app-notify-button"));
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  item.overlay = overlay;

  if (!item.loading) {
    dialog.querySelector(".app-notify-button")?.focus();
  }
}

function notify(message, type = "success", duration = 3200) {
  const normalizedType = ["success", "error", "warning", "info"].includes(type)
    ? type
    : "info";

  const item = {
    message: String(message ?? ""),
    type: normalizedType,
    loading: duration === 0,
    overlay: null,
    remove: null,
  };

  item.remove = () => {
    if (activeNotification === item) {
      item.overlay?.remove();
      activeNotification = null;
      renderNextNotification();
      return;
    }

    notificationQueue = notificationQueue.filter((queued) => queued !== item);
  };

  notificationQueue.push(item);
  renderNextNotification();

  return item;
}

function openModal(id) {
  $(id)?.classList.remove("hidden");
}
function closeModal(id) {
  $(id)?.classList.add("hidden");
}
function statusBadge(status) {
  const s = STATUS_META[status] || STATUS_META.open;
  return `<span class="status-badge ${s.cls}">${s.icon} ${s.label}</span>`;
}

function taskDates(id) {
  const dates = [...state.workSessions, ...state.corrections]
    .filter((x) => x.taskId === id && x.date)
    .map((x) => x.date);

  return [...new Set(dates)].sort().reverse();
}
function lastActivity(id) {
  const a = state.activities
    .filter((x) => x.taskId === id)
    .sort((x, y) => dateValue(y.createdAt) - dateValue(x.createdAt))[0];
  return a ? timeAgo(a.createdAt) : "No activity yet";
}
function dateValue(ts) {
  if (!ts) return 0;

  if (typeof ts.toMillis === "function") {
    return ts.toMillis();
  }

  if (typeof ts.toDate === "function") {
    return ts.toDate().getTime();
  }

  if (typeof ts === "object" && Number.isFinite(Number(ts.seconds))) {
    return (
      Number(ts.seconds) * 1000 + Math.floor(Number(ts.nanoseconds || 0) / 1e6)
    );
  }

  if (ts instanceof Date) {
    return ts.getTime();
  }

  const n = typeof ts === "number" ? ts : new Date(ts).getTime();

  return Number.isFinite(n) ? n : 0;
}
function sortNewest(a, b) {
  return dateValue(b.createdAt) - dateValue(a.createdAt);
}
function getTaskTimeSummary(taskOrId) {
  const task = typeof taskOrId === "string" ? getTask(taskOrId) : taskOrId;

  if (!task) {
    return {
      fixedMinutes: 0,
      isFixedTask: false,
      workLogDurationMinutes: 0,
      workLogRequiredMinutes: 0,
      correctionMinutes: 0,
      requiredMinutes: 0,
      loggedMinutes: 0,
      remainingMinutes: 0,
    };
  }

  const fixedMinutes = Math.max(0, Number(task.fixedMinutes) || 0);

  const isFixedTask = fixedMinutes > 0;

  // Normal WorkLog entries only.
  // "fixed" shadow WorkLog must not be counted.
  const workLogSessions = state.workSessions.filter(
    (x) => x.taskId === task.id && x.source !== "fixed",
  );

  // Actual WorkLog duration
  const workLogDurationMinutes = workLogSessions.reduce(
    (sum, x) => sum + (Number(x.duration) || 0),
    0,
  );

  // Required Time is ONE current value stored on the task.
  // It is NOT summed from individual WorkLog entries.
  const workLogRequiredMinutes = Math.max(0, Number(task.requiredMinutes) || 0);

  const correctionMinutesValue = state.corrections
    .filter((x) => x.taskId === task.id)
    .reduce((sum, x) => sum + (Number(x.duration) || 0), 0);

  const loggedMinutes = Math.max(0, Number(task.loggedMinutes) || 0);

  // Fixed Time tasks keep their existing behavior.
  if (isFixedTask) {
    return {
      fixedMinutes,
      isFixedTask: true,
      workLogDurationMinutes,
      workLogRequiredMinutes,
      correctionMinutes: correctionMinutesValue,
      requiredMinutes: fixedMinutes,
      loggedMinutes,
      remainingMinutes: 0,
    };
  }

  // Normal WorkLog:
  // Required = current task Required
  // + Correction
  // Logged = external Logged value
  const requiredMinutes = workLogRequiredMinutes + correctionMinutesValue;

  const remainingMinutes = Math.max(0, requiredMinutes - loggedMinutes);

  return {
    fixedMinutes: 0,
    isFixedTask: false,
    workLogDurationMinutes,
    workLogRequiredMinutes,
    correctionMinutes: correctionMinutesValue,
    requiredMinutes,
    loggedMinutes,
    remainingMinutes,
  };
}

// const taskMinutes = (id) => {
//   const summary = getTaskTimeSummary(id);

//   return (
//     summary.workLogDurationMinutes +
//     summary.correctionMinutes
//   );
// };

// const normalMinutes = (id) => {
//   return getTaskTimeSummary(id)
//     .workLogDurationMinutes;
// };

// const correctionMinutes = (id) => {
//   return state.corrections
//     .filter((x) => x.taskId === id)
//     .reduce(
//       (sum, x) =>
//         sum + (Number(x.duration) || 0),
//       0,
//     );
// };

/*
 * History helpers
 *
 * Fixed Time is stored as a special WorkLog entry
 * with source === "fixed".
 *
 * Do NOT count that entry as a normal WorkLog.
 */
const taskMinutes = (id) => {
  const summary = getTaskTimeSummary(id);

  return summary.workLogDurationMinutes + summary.correctionMinutes;
};

const normalMinutes = (id) => {
  return getTaskTimeSummary(id).workLogDurationMinutes;
};

const correctionMinutes = (id) => {
  return state.corrections
    .filter((x) => x.taskId === id)
    .reduce((sum, x) => sum + (Number(x.duration) || 0), 0);
};
// function renderTask(task, compact = false) {
//   const total = taskMinutes(task.id),
//     dates = taskDates(task.id),
//     s = STATUS_META[task.status] || STATUS_META.open;

//   const firstWorkDate = dates.length ? dates[dates.length - 1] : "";

//   const worked = firstWorkDate ? shortDate(firstWorkDate) : "No work date yet";

//   const fixedMinutes = Number(task.fixedMinutes) || 0;

//   const taskCorrectionMinutes = correctionMinutes(task.id);

//   const requiredMinutes = fixedMinutes + taskCorrectionMinutes;

//   const loggedMinutes = Number(task.loggedMinutes) || 0;

//   const remainingMinutes = Math.max(0, requiredMinutes - loggedMinutes);

// //   const fixedMinutes = Number(task.fixedMinutes) || 0;

// // const taskCorrectionMinutes = correctionMinutes(task.id);

// // // Required from normal WorkLog entries
// // const workLogRequiredMinutes = state.workSessions
// //   .filter(
// //     (x) =>
// //       x.taskId === task.id &&
// //       x.source !== "fixed",
// //   )
// //   .reduce(
// //     (sum, x) => sum + (Number(x.requiredMinutes) || 0),
// //     0,
// //   );

// // // Actual logged time from WorkLog
// // const workLogLoggedMinutes = state.workSessions
// //   .filter((x) => x.taskId === task.id)
// //   .reduce(
// //     (sum, x) => sum + (Number(x.duration) || 0),
// //     0,
// //   );

// // const requiredMinutes =
// //   fixedMinutes +
// //   taskCorrectionMinutes +
// //   workLogRequiredMinutes;

// // const loggedMinutes = workLogLoggedMinutes;

// // const remainingMinutes = Math.max(
// //   0,
// //   requiredMinutes - loggedMinutes,
// // );

//   const quickLogButton =
//     requiredMinutes > loggedMinutes
//       ? `
//       <button
//         class="task-action quick-log-action"
//         data-action="log-remaining"
//         data-task-id="${task.id}"
//       >
//         ✓ Log ${formatDuration(remainingMinutes)}
//       </button>
//     `
//       : "";
//   let logStatus = "NO PLAN";
//   let logStatusClass = "no-plan";

//   if (requiredMinutes > 0 && loggedMinutes <= 0) {
//     logStatus = "NOT LOGGED";
//     logStatusClass = "not-logged";
//   } else if (requiredMinutes > 0 && loggedMinutes < requiredMinutes) {
//     logStatus = "INCOMPLETE";
//     logStatusClass = "incomplete";
//   } else if (requiredMinutes > 0 && loggedMinutes >= requiredMinutes) {
//     logStatus = "LOGGED";
//     logStatusClass = "complete";
//   }

//   return `<div class="task-row ${task.status === STATUS.ARCHIVED ? "is-archived" : ""}">
//     <div class="task-main">

//       <div class="task-title-line">
//         <div class="task-title">${escapeHtml(task.title)}</div>
//       </div>

//       <div class="task-meta">
//         <span>${escapeHtml(task.project || "No project")}</span>
//         <span>•</span>
//         <span>${escapeHtml(task.type || "Other")}</span>

//         ${statusBadge(task.status)}

//         <span class="task-log-badge ${logStatusClass}">
//           ${logStatus}
//         </span>
//       </div>

//       <div class="task-context">
//         <span>Worked: ${escapeHtml(worked)}</span>
//         <span>•</span>
//         <span>Last activity: ${escapeHtml(lastActivity(task.id))}</span>
//       </div>

//       <div class="task-context task-time-context">

//         ${
//           total > 0
//             ? `<span>WorkLog: <strong>${formatDuration(total)}</strong></span>`
//             : ""
//         }

//         ${
//           taskCorrectionMinutes > 0
//             ? `<span>Correction: <strong>${formatDuration(taskCorrectionMinutes)}</strong></span>`
//             : ""
//         }

//         ${
//           requiredMinutes > 0
//             ? `<span>Required: <strong>${formatDuration(requiredMinutes)}</strong></span>`
//             : ""
//         }

//         ${
//           loggedMinutes > 0
//             ? `<span>Logged: <strong>${formatDuration(loggedMinutes)}</strong></span>`
//             : ""
//         }

//         ${
//           remainingMinutes > 0
//             ? `<span>Remaining: <strong>${formatDuration(remainingMinutes)}</strong></span>`
//             : ""
//         }

//       </div>

//       ${
//         !compact && task.note
//           ? `<div class="task-note">${escapeHtml(task.note)}</div>`
//           : ""
//       }

//     </div>

//     <div class="task-actions">
//       ${
//         compact
//           ? `<button class="task-action" data-action="history" data-task-id="${task.id}">History</button>`
//           : `
//           ${quickLogButton}
//           <button
//   class="task-action logged-time-action"
//   data-action="edit-logged"
//   data-task-id="${task.id}"
// >
//   Logged: ${formatDuration(loggedMinutes)}
// </button>

//           <button class="task-action" data-action="add-time" data-task-id="${task.id}">+ Time</button>
//         <button class="task-action" data-action="correction" data-task-id="${task.id}">Correction</button>
//         <button class="task-action" data-action="history" data-task-id="${task.id}">History</button>
//         <button class="task-action" data-action="edit" data-task-id="${task.id}">Edit</button>
//         ${
//           task.status === STATUS.ARCHIVED
//             ? `<button class="task-action" data-action="unarchive" data-task-id="${task.id}">Unarchive</button>`
//             : `<button class="task-action" data-action="status-next" data-task-id="${task.id}">
//                 ${task.status === STATUS.COMPLETED ? "Reopen" : "Status"}
//               </button>
//               <button class="task-action danger" data-action="archive" data-task-id="${task.id}">Archive</button>`
//         }
//       `
//       }
//     </div>
//   </div>`;
// }
function renderTaskTypeNavigation(orderedTypes, groups) {
  const tasksList = $("tasksList");

  if (!tasksList) return;

  let nav = $("taskTypeQuickNav");

  if (!nav) {
    nav = document.createElement("div");
    nav.id = "taskTypeQuickNav";

    tasksList.parentNode.insertBefore(nav, tasksList);
  }

  if (!orderedTypes.length) {
    nav.innerHTML = "";
    nav.style.display = "none";
    return;
  }

  nav.style.display = "";

  nav.innerHTML = `
    <div class="task-type-nav-header">
      <span class="task-type-nav-label">
        Asset Types
      </span>

      <span class="task-type-nav-hint">
        Click to jump
      </span>
    </div>

    <div class="task-type-nav-list">

      ${orderedTypes
        .map((type, index) => {
          const count = groups.get(type)?.length || 0;

          return `
            <button
              type="button"
              class="task-type-nav-item ${index === 0 ? "active" : ""}"
              data-task-nav-index="${index}"
            >
              <span class="task-type-nav-name">
                ${escapeHtml(type)}
              </span>

              <span class="task-type-nav-count">
                ${count}
              </span>
            </button>
          `;
        })
        .join("")}

    </div>
  `;
}
function renderTask(task, compact = false, comboSubtask = false) {
  const summary = getTaskTimeSummary(task);

  const dates = taskDates(task.id);
  const s = STATUS_META[task.status] || STATUS_META.open;

  // Prefer the latest actual WorkLog / Correction date.
  // If there is no work record yet, use the Task creation date.
  const createdDate = task.createdAt
    ? dateToLocalString(new Date(dateValue(task.createdAt)))
    : "";

  const firstWorkDate = dates.length ? dates[0] : createdDate;

  const worked = firstWorkDate ? shortDate(firstWorkDate) : "No work date yet";

  const {
    fixedMinutes,
    isFixedTask,
    workLogDurationMinutes,
    workLogRequiredMinutes,
    correctionMinutes: taskCorrectionMinutes,
    requiredMinutes,
    loggedMinutes,
    remainingMinutes,
  } = summary;

  /*
   * Fixed Time:
   * No Remaining.
   * No Quick Log.
   */
  // const quickLogButton =
  //   !isFixedTask && remainingMinutes > 0
  //     ? `
  //       <button
  //         class="task-action quick-log-action"
  //         data-action="log-remaining"
  //         data-task-id="${task.id}"
  //       >
  //         ✓ Log ${formatDuration(remainingMinutes)}
  //       </button>
  //     `
  //     : "";

  const quickLogRemainingMinutes = Math.max(0, requiredMinutes - loggedMinutes);

  const quickLogButton =
    quickLogRemainingMinutes > 0
      ? `
      <button
        class="task-action quick-log-action"
        data-action="log-remaining"
        data-task-id="${task.id}"
      >
        ✓ Log ${formatDuration(quickLogRemainingMinutes)}
      </button>
    `
      : "";

  /*
   * Log status
   */
  let logStatus = "NO PLAN";
  let logStatusClass = "no-plan";

  const statusRequiredMinutes = isFixedTask ? fixedMinutes : requiredMinutes;

  if (statusRequiredMinutes > 0 && loggedMinutes <= 0) {
    logStatus = "NOT LOGGED";
    logStatusClass = "not-logged";
  } else if (
    statusRequiredMinutes > 0 &&
    loggedMinutes < statusRequiredMinutes
  ) {
    logStatus = "INCOMPLETE";
    logStatusClass = "incomplete";
  } else if (
    statusRequiredMinutes > 0 &&
    loggedMinutes >= statusRequiredMinutes
  ) {
    logStatus = "LOGGED";
    logStatusClass = "complete";
  }

  return `
    <div class="task-row ${task.status === STATUS.ARCHIVED ? "is-archived" : ""}">

      <div class="task-main">

   <div class="task-title-line">

  ${
    !compact
      ? `
        <label class="task-select-wrap">
          <input
            type="checkbox"
            class="task-select-checkbox"
            data-select-task="${task.id}"
            ${selectedTaskIds.has(task.id) ? "checked" : ""}
          >
        </label>
      `
      : ""
  }

  ${
    comboSubtask
      ? `
        <div class="combo-subtask-heading">

          <strong>
            ${escapeHtml(task.countryCode || task.title)}
          </strong>

          ${
            task.url
              ? `
                <div class="combo-subtask-links">
                  <a
                    href="${escapeHtml(task.url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Email ↗
                  </a>

                  <button
                    type="button"
                    data-copy-combo-link="${escapeHtml(task.url)}"
                  >
                    Copy Link
                  </button>
                </div>
              `
              : ""
          }

        </div>
      `
      : `
        <div class="task-title">
          ${escapeHtml(task.title)}
        </div>

        ${
          task.ticketId
            ? `
              <div class="task-context">
                Ticket ID: <strong>${escapeHtml(task.ticketId)}</strong>
              </div>
            `
            : ""
        }

       
      `
  }

</div>

        <div class="task-meta">
          <span>
            ${escapeHtml(task.project || "No project")}
          </span>

          <span>•</span>

          <span>
            ${escapeHtml(task.type || "Other")}
          </span>

          ${statusBadge(task.status)}

          <span class="task-log-badge ${logStatusClass}">
            ${logStatus}
          </span>
        </div>

        <div class="task-context">
          <span>
            Worked:
            ${escapeHtml(worked)}
          </span>

          <span>•</span>

          <span>
            Last activity:
            ${escapeHtml(lastActivity(task.id))}
          </span>
        </div>

        <div class="task-context task-time-context">

          ${
            isFixedTask && fixedMinutes > 0
              ? `
                <span>
                  Fixed Time:
                  <strong>
                    ${formatDuration(fixedMinutes)}
                  </strong>
                </span>
              `
              : ""
          }

          ${
            taskCorrectionMinutes > 0
              ? `
                <span>
                  Correction:
                  <strong>
                    ${formatDuration(taskCorrectionMinutes)}
                  </strong>
                </span>
              `
              : ""
          }

          ${
            !isFixedTask && workLogRequiredMinutes > 0
              ? `
                <span>
                  Required:
                  <strong>
                    ${formatDuration(requiredMinutes)}
                  </strong>
                </span>
              `
              : ""
          }

          ${
            loggedMinutes > 0
              ? `
                <span>
                  Logged:
                  <strong>
                    ${formatDuration(loggedMinutes)}
                  </strong>
                </span>
              `
              : ""
          }

          ${
            !isFixedTask && remainingMinutes > 0
              ? `
                <span>
                  Remaining:
                  <strong>
                    ${formatDuration(remainingMinutes)}
                  </strong>
                </span>
              `
              : ""
          }

        </div>

        ${
          !compact && task.note
            ? `
              <div class="task-note">
                ${escapeHtml(task.note)}
              </div>
            `
            : ""
        }

      </div>

 
<div class="task-actions">

  ${
    quickLogButton
      ? `
        <div class="task-quicklog-row">
          ${quickLogButton}
        </div>
      `
      : ""
  }

  ${
    comboSubtask
      ? `
      <div class="task-action-toolbar">
        <button
          class="task-action"
          data-action="history"
          data-task-id="${task.id}"
        >
          History
        </button>
      </div>
    `
      : compact
        ? `
        <div class="task-action-toolbar">
          <button
            class="task-action"
            data-action="history"
            data-task-id="${task.id}"
          >
            History
          </button>
        </div>
      `
        : `
        <div class="task-action-toolbar">

          <button
            class="task-action"
            data-action="history"
            data-task-id="${task.id}"
          >
            History
          </button>

          <button
            class="task-action task-more-toggle"
            data-action="toggle-task-more"
            data-task-id="${task.id}"
            aria-expanded="false"
          >
            ⋯ More
          </button>

          <div class="task-secondary-actions">

            <button
              class="task-action"
              data-action="edit"
              data-task-id="${task.id}"
            >
              Edit
            </button>

            <button
              class="task-action"
              data-action="edit-logged"
              data-task-id="${task.id}"
            >
              Logged: ${formatDuration(loggedMinutes)}
            </button>

            <button
              class="task-action"
              data-action="correction"
              data-task-id="${task.id}"
            >
              + Correction
            </button>

            ${
              task.status === STATUS.ARCHIVED
                ? `
                  <button
                    class="task-action"
                    data-action="unarchive"
                    data-task-id="${task.id}"
                  >
                    Unarchive
                  </button>
                `
                : `
                  <button
                    class="task-action"
                    data-action="status-next"
                    data-task-id="${task.id}"
                  >
                    ${task.status === STATUS.COMPLETED ? "Reopen" : "Change Status"}
                  </button>

                  <button
                    class="task-action"
                    data-action="archive"
                    data-task-id="${task.id}"
                  >
                    Archive
                  </button>
                `
            }

            <button
              class="task-action danger"
              data-action="delete"
              data-task-id="${task.id}"
            >
              Delete
            </button>

          </div>

        </div>
      `
  }

</div>



    </div>
  `;
}

// ========================================
// TASK BOARD CONTROLS
// ========================================

function ensureTaskBoardControls() {
  const tasksList = $("tasksList");

  if (!tasksList) return null;

  let controls = $("taskBoardControls");

  if (!controls) {
    controls = document.createElement("div");
    controls.id = "taskBoardControls";

    tasksList.parentNode.insertBefore(controls, tasksList);
  }

  return controls;
}

function renderTaskBoardControls(types) {
  const controls = ensureTaskBoardControls();

  if (!controls) return;

  const selectedCount = selectedTaskIds.size;

  const allSelected =
    currentVisibleTaskIds.length > 0 &&
    currentVisibleTaskIds.every((id) => selectedTaskIds.has(id));

  controls.innerHTML = `

    <div class="task-view-toolbar">

      <div class="task-view-switch">

        <button
          type="button"
          class="task-view-btn ${taskViewMode === "status" ? "active" : ""}"
          data-task-view="status"
        >
          <span>▦</span>
          By Status
        </button>

        <button
          type="button"
          class="task-view-btn ${taskViewMode === "asset" ? "active" : ""}"
          data-task-view="asset"
        >
          <span>▤</span>
          By Asset Type
        </button>
     <button
  type="button"
  class="task-view-btn ${taskViewMode === "combo" ? "active" : ""}"
  data-task-view="combo"
>
  <span>▣</span>
  By Combo
</button>

      </div>

      ${
        taskViewMode === "asset"
          ? `
            <div class="task-asset-view-filter">

              <label>Asset Type</label>

              <select id="taskBoardAssetType">

                <option value="all">
                  All Asset Types
                </option>

                ${types
                  .map(
                    (type) => `
                  <option
                    value="${escapeHtml(type)}"
                    ${selectedAssetType === type ? "selected" : ""}
                  >
                    ${escapeHtml(type)}
                  </option>
                `,
                  )
                  .join("")}

              </select>

            </div>
          `
          : ""
      }

    </div>


    <div class="task-bulk-toolbar">

     ${
taskViewMode === "asset"
         ? `
      <label class="task-select-all">

        <input
          type="checkbox"
          id="taskSelectAllVisible"
          ${allSelected ? "checked" : ""}
        >

Select visible

      </label>
    `
         : ""
     }
      <span class="task-selected-count">
        ${selectedCount} selected
      </span>

      <select id="taskBulkStatus">

        <option value="">
          Change status to...
        </option>

        ${Object.entries(STATUS_META)
          .filter(([key]) => key !== STATUS.ARCHIVED)
          .map(
            ([key, meta]) => `
            <option value="${key}">
              ${meta.icon} ${meta.label}
            </option>
          `,
          )
          .join("")}

      </select>

      <button
        type="button"
        id="taskBulkApplyBtn"
        ${selectedCount === 0 ? "disabled" : ""}
      >
        Apply to selected
      </button>

      <button
        type="button"
        id="taskClearSelectionBtn"
        ${selectedCount === 0 ? "disabled" : ""}
      >
        Clear
      </button>

    </div>

  `;
}

// ========================================
// BULK CHANGE TASK STATUS
// ========================================

async function bulkChangeTaskStatus() {
  const statusSelect = $("taskBulkStatus");
  const newStatus = statusSelect?.value || "";

  const ids = [...selectedTaskIds].filter((id) =>
    currentVisibleTaskIds.includes(id),
  );

  if (!ids.length) {
    return notify("Please select at least one task.", "warning");
  }

  if (!newStatus) {
    return notify("Please select a status.", "warning");
  }

  const targetMeta = STATUS_META[newStatus];

  if (!targetMeta) return;

  const tasksToUpdate = ids
    .map((id) => getTask(id))
    .filter(Boolean)
    .filter((task) => task.status !== newStatus);

  if (!tasksToUpdate.length) {
    return notify("All selected tasks already have this status.", "warning");
  }

  // Mở Confirm Modal thay cho window.confirm()
  confirmAction(
    "Apply status to selected tasks?",
    `You are about to change the status of ${tasksToUpdate.length} task(s) to "${targetMeta.label}".`,
    async () => {
      await applyBulkTaskStatus(tasksToUpdate, newStatus, targetMeta);
    },
    "Apply changes",
  );
}

// ========================================
// APPLY BULK TASK STATUS
// ========================================

async function applyBulkTaskStatus(tasksToUpdate, newStatus, targetMeta) {
  const button = $("taskBulkApplyBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Updating...";
  }

  let successCount = 0;
  let failedCount = 0;

  for (const task of tasksToUpdate) {
    try {
      const previousStatus = task.status;

      await updateDoc(doc(db, "tasks", task.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      await addActivity(task.id, "status_changed", {
        from: previousStatus,
        to: newStatus,
        bulk: true,
      });

      successCount++;
    } catch (err) {
      console.error("Bulk status update failed:", task.id, err);

      failedCount++;
    }
  }

  selectedTaskIds.clear();

  renderTasks();

  if (failedCount > 0) {
    notify(`${successCount} updated, ${failedCount} failed.`, "warning");
  } else {
    notify(`Updated ${successCount} task(s) to ${targetMeta.label}.`);
  }
}

// ========================================
// RENDER COMBO VIEW
// ========================================

function renderComboBoard(tasks, container) {
  const grouped = new Map();

  tasks.forEach((task) => {
    if (!task.comboId) return;

    if (!grouped.has(task.comboId)) {
      grouped.set(task.comboId, []);
    }

    grouped.get(task.comboId).push(task);
  });

  const comboIds = [...grouped.keys()];

  if (!comboIds.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">No Combo groups found</div>
        <div class="empty-text">
          Create a Combo to see its Subtasks here.
        </div>
      </div>
    `;
    return;
  }

  const comboCards = comboIds
    .map((comboId) => {
      const subtasks = grouped.get(comboId) || [];
      const combo = state.combos.find((item) => item.id === comboId);
      const firstTask = subtasks[0];

      const name = combo?.name || firstTask?.comboName || "Untitled Combo";

      const mainUrl = combo?.mainUrl || "";

      const clientName = combo?.clientName || firstTask?.project || "No client";

      const type = combo?.type || firstTask?.type || "Other";
      const date = combo?.date || firstTask?.fixedDate || "";

      // Old Combos without timeMode are treated as Fixed Time.
      const timeMode = combo?.timeMode || "fixed";
      const isIndividual = timeMode === "individual";

      const totalMinutes = subtasks.reduce((sum, task) => {
        const minutes = isIndividual
          ? Number(task.requiredMinutes) || 0
          : Number(task.fixedMinutes) || 0;

        return sum + minutes;
      }, 0);

      const timeLabel = isIndividual ? "Total Required Time" : "Fixed Time";

      const isExpanded = expandedComboIds.has(comboId);

      const allComboSelected =
        subtasks.length > 0 &&
        subtasks.every((task) => selectedTaskIds.has(task.id));

      return `
        <section class="combo-card">

          <div class="combo-card-header">

            <div class="combo-main-info">

              <div class="combo-eyebrow">MAIN TICKET</div>

              <h3>${escapeHtml(name)}</h3>

              <div class="combo-meta">
                <span>${escapeHtml(clientName)}</span>
                <span>·</span>
                <span>${escapeHtml(type)}</span>
                <span>·</span>
                <span>${escapeHtml(date)}</span>
              </div>

              <div class="combo-summary">
                <span>${subtasks.length} Subtasks</span>
                <span>·</span>
                <span>${timeLabel}: ${formatDuration(totalMinutes)}</span>
              </div>

            </div>

     <div class="combo-card-actions">

  <label class="combo-select-all">
    <input
      type="checkbox"
      data-select-combo="${escapeHtml(comboId)}"
      ${allComboSelected ? "checked" : ""}
    />
    Select all tickets
  </label>

  ${
    mainUrl
                  ? `
                    <a
                      class="combo-link-btn"
                      href="${escapeHtml(mainUrl)}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Main Link ↗
                    </a>

                    <button
                      type="button"
                      class="combo-copy-btn"
                      data-copy-combo-link="${escapeHtml(mainUrl)}"
                    >
                      Copy Link
                    </button>
                  `
                  : ""
              }

              <button
                type="button"
                class="combo-action-btn"
                data-edit-combo="${escapeHtml(comboId)}"
              >
                Edit Combo
              </button>

              <button
                type="button"
                class="combo-action-btn combo-delete-btn"
                data-delete-combo="${escapeHtml(comboId)}"
              >
                Delete Combo
              </button>

              <button
                type="button"
                class="combo-toggle-btn"
                data-combo-toggle="${escapeHtml(comboId)}"
              >
                ${isExpanded ? "Hide Subtasks" : "Show Subtasks"}
                <span>${isExpanded ? "▲" : "▼"}</span>
              </button>

            </div>

          </div>

          ${
            isExpanded
              ? `
                <div class="combo-subtasks">

                  ${subtasks
                    .map(
                      (task) => `
                        <div class="combo-subtask">
                          ${renderTask(task, false, true)}
                        </div>
                      `,
                    )
                    .join("")}

                </div>
              `
              : ""
          }

        </section>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="combo-board">
      ${comboCards}
    </div>
  `;
}

function renderTasks() {
  const q = ($("taskSearch")?.value || "").toLowerCase().trim();

  const sf = $("taskStatusFilter")?.value || "all";
  const tf = $("taskTypeFilter")?.value || "all";
  const lf = $("taskLogFilter")?.value || "all";

  const df = $("taskDateFilter")?.value || "all";
  const customDate = $("taskCustomDate")?.value || "";

  let tasks = state.tasks.filter(
    (t) =>
      // Combo view vẫn cần lấy các Subtasks
      (taskViewMode === "combo" || !t.comboId) &&
      // Giữ nguyên logic Archived hiện tại
      (state.showArchived || t.status !== STATUS.ARCHIVED),
  );

  // STATUS FILTER
  if (sf !== "all") {
    tasks = tasks.filter((t) => t.status === sf);
  }

  // ASSET TYPE FILTER
  if (tf !== "all") {
    tasks = tasks.filter((t) => t.type === tf);
  }

  // LOG FILTER
  if (lf !== "all") {
    tasks = tasks.filter((t) => {
      const loggedMinutes = Math.max(0, Number(t.loggedMinutes) || 0);

      return lf === "logged" ? loggedMinutes > 0 : loggedMinutes === 0;
    });
  }

  // DATE FILTER
  tasks = tasks.filter((t) => taskMatchesDateFilter(t, df, customDate));

  // SEARCH
  if (q) {
    tasks = tasks.filter((t) =>
      [
        t.title,
        t.project,
        t.note,
        t.type,
        t.url,
        t.comboName,
        t.countryCode,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }

  // SORT
  tasks.sort((a, b) => {
    const getLogPriority = (task) => {
      const summary = getTaskTimeSummary(task);

      if (summary.requiredMinutes <= 0) return 3;

      if (summary.loggedMinutes <= 0) return 0;

      if (summary.loggedMinutes < summary.requiredMinutes) return 1;

      return 2;
    };

    const statusCompare = getLogPriority(a) - getLogPriority(b);

    if (statusCompare !== 0) {
      return statusCompare;
    }

    const getLatestWorkDate = (task) => {
      const dates = taskDates(task.id);
      return dates.length ? dates[0] : "";
    };

    const dateA = getLatestWorkDate(a);
    const dateB = getLatestWorkDate(b);

    if (dateA !== dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;

      return dateB.localeCompare(dateA);
    }

    return (
      dateValue(b.updatedAt || b.createdAt) -
      dateValue(a.updatedAt || a.createdAt)
    );
  });

  const container = $("tasksList");

  if (!container) return;

  // EMPTY STATE
  if (!tasks.length) {
    currentVisibleTaskIds = [];

    selectedTaskIds.clear();

    renderTaskBoardControls([]);

    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-title">
          No tasks found
        </div>

        <div class="empty-text">
          Try another filter or create a new task.
        </div>

      </div>
    `;

    return;
  }

  // GET ASSET TYPES
  const groupedTasks = new Map();

  tasks.forEach((task) => {
    const type = String(task.type || "").trim() || "Other";

    if (!groupedTasks.has(type)) {
      groupedTasks.set(type, []);
    }

    groupedTasks.get(type).push(task);
  });

  // ORDER ASSET TYPES
  const orderedTypes = [];

  TASK_TYPES.forEach((type) => {
    if (groupedTasks.has(type)) {
      orderedTypes.push(type);
    }
  });

  groupedTasks.forEach((_, type) => {
    if (!orderedTypes.includes(type)) {
      orderedTypes.push(type);
    }
  });

  // KEEP ONLY VISIBLE SELECTIONS
  if (taskViewMode === "combo") {
    currentVisibleTaskIds = tasks
      .filter((task) => Boolean(task.comboId))
      .map((task) => task.id);
  } else {
    currentVisibleTaskIds = tasks.map((task) => task.id);
  }

  if (taskViewMode === "asset" && selectedAssetType !== "all") {
    currentVisibleTaskIds = tasks
      .filter(
        (task) =>
          (String(task.type || "").trim() || "Other") === selectedAssetType,
      )
      .map((task) => task.id);
  }
  if (taskViewMode === "asset" && selectedAssetType !== "all") {
    currentVisibleTaskIds = tasks
      .filter(
        (task) =>
          (String(task.type || "").trim() || "Other") === selectedAssetType,
      )
      .map((task) => task.id);
  }

  [...selectedTaskIds].forEach((id) => {
    if (!currentVisibleTaskIds.includes(id)) {
      selectedTaskIds.delete(id);
    }
  });

  // HIDE OLD TYPE NAVIGATION
  const oldNav = $("taskTypeQuickNav");

  if (oldNav) {
    oldNav.style.display = "none";
  }

  // RENDER TOOLBAR
  renderTaskBoardControls(orderedTypes);

  // ========================================
  // BY STATUS VIEW
  // ========================================

  if (taskViewMode === "status") {
    const statusOrder = [
      STATUS.OPEN,
      STATUS.IN_PRODUCTION,
      STATUS.IN_APPROVAL,
      STATUS.EXECUTION_PROOF,
      STATUS.COMPLETED,
    ];

    container.innerHTML = `

      <div class="tasks-board status-view">

        ${statusOrder
          .map((status) => {
            const meta = STATUS_META[status];

            const statusTasks = tasks.filter((task) => task.status === status);

            return `

            <section class="task-column">

              <div class="task-column-header">

  <div class="task-column-title">
    ${meta.icon}
    ${escapeHtml(meta.label)}
  </div>

  <div class="task-column-actions">

    <label class="task-column-select-all">
      <input
        type="checkbox"
        data-select-status="${status}"
        ${statusTasks.length > 0 && statusTasks.every((task) => selectedTaskIds.has(task.id)) ? "checked" : ""}
      >

      <span>Select all</span>
    </label>

    <div class="task-column-count">
      ${statusTasks.length}
    </div>

  </div>

</div>

              <div class="task-column-body">

                ${
                  statusTasks.length
                    ? statusTasks.map((task) => renderTask(task)).join("")
                    : `
                      <div class="task-empty-column">
                        No tasks
                      </div>
                    `
                }

              </div>

            </section>

          `;
          })
          .join("")}

      </div>

    `;
  }
  // ========================================
  // BY COMBO VIEW
  // ========================================
  else if (taskViewMode === "combo") {
    renderComboBoard(tasks, container);
  }

  // ========================================
  // BY ASSET TYPE VIEW
  // ========================================
  else {
    let visibleTasks = tasks;

    if (selectedAssetType !== "all") {
      visibleTasks = tasks.filter(
        (task) =>
          (String(task.type || "").trim() || "Other") === selectedAssetType,
      );
    }

    container.innerHTML = `

      <div class="tasks-board asset-view">

        <div class="task-asset-list">

          ${
            visibleTasks.length
              ? visibleTasks.map((task) => renderTask(task)).join("")
              : `
                <div class="empty-state">
                  <div class="empty-title">
                    No tasks in this Asset Type
                  </div>
                </div>
              `
          }

        </div>

      </div>

    `;
  }

  // APPLY STYLES
  ensureTasksBoardStyles();
  ensureTaskRedesignStyles();
  ensureComboStyles();
}
// ========================================
// COMBO VIEW STYLES
// ========================================

function ensureComboStyles() {
  if ($("comboStyles")) return;

  const style = document.createElement("style");

  style.id = "comboStyles";

  style.textContent = `
    .combo-board {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 4px 0 16px;
    }

    .combo-card {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--card);
      overflow: hidden;
    }

    .combo-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 18px;
    }

    .combo-main-info {
      width: 100%;
    }

    .combo-eyebrow {
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1px;
      margin-bottom: 7px;
    }

    .combo-main-info h3 {
      margin: 0 0 7px;
      font-size: 17px;
      font-weight: 750;
      color: var(--text);
      overflow-wrap: anywhere;
    }

    .combo-meta,
    .combo-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      color: var(--muted);
      font-size: 12px;
    }

    .combo-summary {
      margin-top: 8px;
      color: var(--text);
      font-weight: 650;
    }

    .combo-card-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 7px;
      flex-shrink: 0;
      width: 100%;
    }

    .combo-link-btn,
    .combo-copy-btn,
    .combo-toggle-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 36px;
      padding: 8px 11px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--card);
      color: var(--text);
      font: inherit;
      font-size: 12px;
      font-weight: 650;
      text-decoration: none;
      cursor: pointer;
    }

    .combo-toggle-btn {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .combo-subtasks {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px 18px 18px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }

    .combo-subtask {
      min-width: 0;
    }

    .combo-subtask-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 7px;
    }

    .combo-subtask-heading > strong {
      font-size: 13px;
      color: var(--text);
    }

    .combo-subtask-links {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
    }

    .combo-subtask-links a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 650;
    }

    .combo-subtask-links button {
      border: 0;
      padding: 3px 0;
      background: transparent;
      color: var(--muted);
      font: inherit;
      cursor: pointer;
    }

    @media (max-width: 700px) {
      .combo-card-header {
        align-items: stretch;
        flex-direction: column;
      }

      .combo-card-actions {
        justify-content: flex-start;
      }

      .combo-subtask-heading {
        align-items: flex-start;
        flex-direction: column;
      }
    }
      .combo-select-all {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.combo-select-all input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
}

.combo-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.combo-card-header {
  flex-wrap: wrap;
}

.combo-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.combo-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.combo-delete-btn {
  color: #ef7777;
  border-color: rgba(239, 119, 119, 0.35);
}

.combo-select-all-row {
  flex-basis: 100%;
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

.combo-select-all {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.combo-select-all input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
}

.combo-subtask .task-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}

.combo-subtask .combo-subtask-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
  gap: 12px;
  margin: 0;
}

.combo-subtask .combo-subtask-heading > strong {
  font-size: 14px;
  color: var(--text);
}

.combo-subtask .combo-subtask-links {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  white-space: nowrap;
}

.combo-subtask .task-row {
  border: 0;
  background: transparent;
  padding: 0;
}

.combo-subtask .task-main {
  min-width: 0;
}

.combo-edit-modal {
  max-width: 680px;
}

@media (max-width: 700px) {
  .combo-subtask .combo-subtask-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .combo-card-actions {
    justify-content: flex-start;
  }
}
  `;

  document.head.appendChild(style);
}

// ========================================
// TASK REDESIGN STYLES
// ========================================

function ensureTaskRedesignStyles() {
  let style = $("taskRedesignStyles");

  if (!style) {
    style = document.createElement("style");
    style.id = "taskRedesignStyles";
  }

  style.textContent = `

    /* VIEW TOOLBAR */

    #taskBoardControls {
      margin: 14px 20px;
    }
.task-column-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-column-select-all {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  cursor: pointer;
}

.task-column-select-all input {
  width: 14px;
  height: 14px;
  accent-color: var(--primary);
  cursor: pointer;
}
    .task-view-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }

    .task-view-switch {
      display: flex;
      gap: 6px;
      padding: 4px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--card);
    }

    .task-view-btn {
      border: 0;
      border-radius: 7px;
      padding: 9px 14px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-weight: 600;
    }

    .task-view-btn.active {
      background: var(--primary);
      color: white;
    }

    .task-asset-view-filter {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .task-asset-view-filter label {
      color: var(--muted);
      font-size: 13px;
    }

    .task-asset-view-filter select {
      min-width: 180px;
    }


    /* BULK TOOLBAR */

    .task-bulk-toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--card);
    }

    .task-select-all {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 13px;
      cursor: pointer;
    }

    .task-selected-count {
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
    }

    .task-bulk-toolbar select {
      min-width: 180px;
    }

    .task-bulk-toolbar button {
      padding: 9px 13px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--card);
      color: var(--text);
      cursor: pointer;
    }

    .task-bulk-toolbar #taskBulkApplyBtn {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
      font-weight: 600;
    }

    .task-bulk-toolbar button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }


    /* TASK SELECTION */

    .task-title-line {
      display: flex;
      align-items: flex-start;
      gap: 9px;
    }

    .task-select-wrap {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      padding-top: 3px;
      cursor: pointer;
    }

    .task-select-checkbox {
      width: 16px;
      height: 16px;
      accent-color: var(--primary);
      cursor: pointer;
    }


    /* STATUS BOARD */

    .tasks-board.status-view {
      display: grid !important;
      grid-template-columns:
        repeat(auto-fit, minmax(min(100%, 280px), 1fr)) !important;
      gap: 14px;
      width: 100%;
      max-width: 100%;
      overflow: visible !important;
      padding: 4px 0 14px;
      box-sizing: border-box;
    }

    .tasks-board.status-view .task-column {
      flex: initial !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      scroll-snap-align: none;
    }

    .tasks-board.status-view .task-column-body {
      max-height: 70vh;
      min-height: 120px;
    }

    .task-empty-column {
      padding: 24px 10px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
      opacity: 0.7;
    }


    /* ASSET TYPE LIST */

    .tasks-board.asset-view {
      display: block !important;
      width: 100%;
      max-width: 100%;
      overflow: visible !important;
      padding: 4px 0 14px;
    }

    .task-asset-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }

    .task-asset-list .task-row {
      width: 100%;
      box-sizing: border-box;
    }


    /* RESPONSIVE */

    @media (max-width: 700px) {

      .task-view-toolbar {
        align-items: stretch;
      }

      .task-view-switch {
        width: 100%;
      }

      .task-view-btn {
        flex: 1;
      }

      .task-asset-view-filter {
        width: 100%;
      }

      .task-asset-view-filter select {
        flex: 1;
        min-width: 0;
      }

      .task-bulk-toolbar {
        align-items: stretch;
      }

      .task-bulk-toolbar select {
        flex: 1;
        min-width: 0;
      }

      .tasks-board.status-view {
        grid-template-columns: 1fr !important;
      }

    }
      /* Bulk status selector */
#taskBulkStatus {
  min-width: 170px;
  height: 38px;
  padding: 0 36px 0 12px;

  color: var(--text);
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: 9px;

  font: inherit;
  font-size: 13px;
  cursor: pointer;
  outline: none;

  appearance: none;
  -webkit-appearance: none;

  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23949baa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 11px center;
  background-size: 15px;
}

#taskBulkStatus:hover {
  border-color: var(--primary);
}

#taskBulkStatus:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

#taskBulkStatus option {
  color: var(--text);
  background: var(--card);
}
/* ========================================
   TASK BOARD ASSET TYPE SELECT
======================================== */

#taskBoardAssetType {
  min-width: 170px;
  height: 38px;
  padding: 0 36px 0 12px;

  appearance: none;
  -webkit-appearance: none;

  border: 1px solid var(--border);
  border-radius: 8px;

  background-color: var(--surface);
  color: var(--text-primary);

  font-size: 13px;
  font-weight: 500;

  cursor: pointer;
  outline: none;

  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");

  background-repeat: no-repeat;
  background-position: right 12px center;

  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

#taskBoardAssetType:hover {
  border-color: var(--primary-color);
}

#taskBoardAssetType:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

#taskBoardAssetType:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#taskBoardAssetType option {
  background: var(--surface);
  color: var(--text-primary);
}
  `;

  document.head.appendChild(style);

  if (!style.isConnected) {
    document.head.appendChild(style);
  }
}
function ensureTasksBoardStyles() {
  if (document.getElementById("tasksBoardStyles")) return;

  const style = document.createElement("style");
  style.id = "tasksBoardStyles";

  style.textContent = `
    /* =========================================================
       TASKS BOARD
       Horizontal Asset Type columns
    ========================================================= */

    .tasks-board {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;

      gap: 14px;

      width: 100%;
      max-width: 100%;

      overflow-x: auto;
      overflow-y: hidden;

      padding: 4px 4px 14px;

      box-sizing: border-box;

      scroll-behavior: smooth;
      scroll-snap-type: x proximity;

      -webkit-overflow-scrolling: touch;
    }

    /* Horizontal scrollbar */
    .tasks-board::-webkit-scrollbar {
      height: 9px;
    }

    .tasks-board::-webkit-scrollbar-track {
      background: transparent;
    }

    .tasks-board::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.32);
      border-radius: 999px;
    }

    .tasks-board::-webkit-scrollbar-thumb:hover {
      background: rgba(148, 163, 184, 0.52);
    }


    /* =========================================================
       ASSET TYPE COLUMN
    ========================================================= */

    .task-column {
      flex: 0 0 390px !important;

      width: 390px;
      min-width: 390px;
      max-width: 390px;

      display: flex;
      flex-direction: column;

      box-sizing: border-box;

      border: 1px solid var(
        --border,
        rgba(148, 163, 184, 0.18)
      );

      background: var(
        --card,
        rgba(15, 23, 42, 0.45)
      );

      overflow: hidden;

      scroll-snap-align: start;
    }


    /* =========================================================
       COLUMN HEADER
    ========================================================= */

    .task-column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      min-height: 54px;

      padding: 12px 16px;

      border-bottom: 1px solid var(
        --border,
        rgba(148, 163, 184, 0.18)
      );

      background: var(
        --card,
        rgba(15, 23, 42, 0.8)
      );

      box-sizing: border-box;

      /*
       * Keep Asset Type header visible
       * while scrolling inside the column.
       */
      position: sticky;
      top: 0;
      z-index: 5;

      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .task-column-title {
      min-width: 0;

      font-size: 15px;
      font-weight: 700;

      color: var(
        --text,
        #e5e7eb
      );

      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .task-column-count {
      flex: 0 0 auto;

      min-width: 28px;
      height: 28px;

      display: inline-flex;
      align-items: center;
      justify-content: center;

      padding: 0 8px;

      border-radius: 999px;

      background: rgba(148, 163, 184, 0.14);

      font-size: 12px;
      font-weight: 700;

      color: var(
        --muted,
        #94a3b8
      );
    }


    /* =========================================================
       COLUMN BODY
    ========================================================= */

    .task-column-body {
      display: flex;
      flex-direction: column;

      gap: 8px;

      padding: 10px 12px 12px;

      min-width: 0;

      /*
       * Each Asset Type scrolls vertically
       * independently.
       */
      max-height: calc(87vh - 300px);

      overflow-y: auto;
      overflow-x: hidden;

      box-sizing: border-box;
    }

    .task-column-body::-webkit-scrollbar {
      width: 7px;
    }

    .task-column-body::-webkit-scrollbar-track {
      background: transparent;
    }

    .task-column-body::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.22);
      border-radius: 999px;
    }

    .task-column-body::-webkit-scrollbar-thumb:hover {
      background: rgba(148, 163, 184, 0.38);
    }


    /* =========================================================
       TASK ROW
       Prevent old layout from breaking inside columns
    ========================================================= */

    .task-column-body .task-row {
      display: block !important;

      width: 100%;
      min-width: 0;
      max-width: 100%;

      box-sizing: border-box;

      margin: 0 !important;

      padding: 4px 6px 12px;
    }

    .task-column-body .task-main {
      width: 100%;
      min-width: 0;

      box-sizing: border-box;

      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .task-column-body .task-title {
      min-width: 0;

      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .task-column-body .task-meta {
      min-width: 0;

      display: flex;
      flex-wrap: wrap;
      align-items: center;

      gap: 5px;

      overflow-wrap: anywhere;
    }

    .task-column-body .task-context {
      min-width: 0;

      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .task-column-body .task-note {
      min-width: 0;

      overflow-wrap: anywhere;
      word-break: break-word;
    }


    /* =========================================================
       URL
       Keep long URLs from making cards extremely tall
    ========================================================= */

    .task-column-body .task-main a,
    .task-column-body .task-url {
      display: -webkit-box;

      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;

      overflow: hidden;

      word-break: break-all;
      overflow-wrap: anywhere;
    }


    /* =========================================================
       ACTION BUTTONS
    ========================================================= */

    .task-column-body .task-actions {
      position: static !important;

      display: flex !important;
      flex-wrap: wrap !important;

      align-items: center;

      gap: 6px;

      width: 100%;

      margin-top: 10px;

      box-sizing: border-box;
    }

    .task-column-body .task-action {
      position: static !important;

      flex: 0 0 auto;

      max-width: 100%;

      box-sizing: border-box;

      white-space: nowrap;
    }


    /* =========================================================
       TASK DIVIDER
    ========================================================= */

    .task-column-body .task-row {
      border-bottom: 1px solid
        var(
          --border,
          rgba(148, 163, 184, 0.16)
        );
    }

    .task-column-body .task-row:last-child {
      border-bottom: none;
    }


    /* =========================================================
       EMPTY STATE
    ========================================================= */

    .task-column-body .empty-small,
    .task-column-body .empty-state {
      margin: 0;

      padding: 24px 12px;

      text-align: center;
    }


    /* =========================================================
       RESPONSIVE
       Still horizontal — never turns into vertical columns
    ========================================================= */

    @media (max-width: 900px) {
      .task-column {
        flex-basis: 350px !important;

        width: 350px;
        min-width: 350px;
        max-width: 350px;
      }
    }

    @media (max-width: 600px) {
      .tasks-board {
        gap: 10px;

        padding-left: 2px;
        padding-right: 2px;
      }

      .task-column {
        flex-basis: calc(100vw - 42px) !important;

        width: calc(100vw - 42px);
        min-width: calc(100vw - 42px);
        max-width: calc(100vw - 42px);
      }

      .task-column-body {
        max-height: none;
      }
    }
 
/* =========================================================
   TASK ACTIONS - QUICK LOG + FIXED MORE MENU
   ========================================================= */

.task-column-body .task-actions {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  flex-wrap: nowrap !important;
  gap: 9px;
  width: 100%;
  margin-top: 12px;
  box-sizing: border-box;
}

.task-quicklog-row {
  width: 100%;
}

.task-quicklog-row .quick-log-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 42px;
  padding: 10px 14px;
  border-radius: 10px;
  box-sizing: border-box;
  background: rgba(34,197,94,.13);
  border: 1px solid rgba(34,197,94,.3);
  color: #22c55e;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.task-quicklog-row .quick-log-action:hover {
  background: rgba(34,197,94,.2);
}

.task-action-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.task-action-toolbar > .task-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  box-sizing: border-box;
}

.task-action-toolbar > .task-more-toggle {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-soft);
}

.task-more-toggle[aria-expanded="true"] {
  background: var(--primary-soft);
  border-color: var(--primary);
}

/* Đảm bảo menu hiển thị trên các Task Column */
.task-row.task-more-open {
  position: relative;
  z-index: 30;
}

/* Chỉ sử dụng một bộ CSS cho More menu */
.task-action-toolbar .task-secondary-actions {
  display: none;
  position: fixed;
  z-index: 9999;

  top: 0;
  left: 0;

  flex-direction: column;
  align-items: stretch;
  flex-wrap: nowrap;
  gap: 3px;

  width: 220px;
  min-width: 220px;
  max-width: calc(100vw - 16px);

  padding: 7px;

  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;

  box-shadow: 0 12px 32px rgba(0,0,0,.22);

  box-sizing: border-box;
}

.task-row.task-more-open
.task-action-toolbar
.task-secondary-actions {
  display: flex;
}

.task-secondary-actions .task-action {
  display: flex;
  align-items: center;
  justify-content: flex-start;

  width: 100%;
  min-height: 36px;
  padding: 8px 11px;

  border: 0;
  border-radius: 7px;
  background: transparent;

  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.task-secondary-actions .task-action:hover {
  background: var(--primary-soft);
}

.task-secondary-actions .task-action.danger {
  color: var(--danger);
}

.task-actions .task-action {
  transition:
    background .18s ease,
    border-color .18s ease,
    opacity .18s ease;
}

.task-actions .task-action:hover {
  transform: translateY(-1px);
}

@media (max-width: 600px) {
  .task-quicklog-row .quick-log-action {
    min-height: 44px;
    font-size: 13px;
  }

  .task-action-toolbar > .task-action {
    min-height: 36px;
    padding: 8px 12px;
  }

  .task-action-toolbar .task-secondary-actions {
    width: 210px;
    min-width: 210px;
  }
}


.task-more-toggle[aria-expanded="true"] {
  background: var(--surface-secondary, rgba(148, 163, 184, 0.10));
}

/* Secondary actions */
.task-secondary-actions {
  display: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;

  width: 100%;
  padding: 10px 0 2px;

  border-top: 1px solid var(--border);
}

.task-row.task-more-open .task-secondary-actions {
  display: flex;
}

.task-secondary-actions .task-action {
  min-height: 32px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
}

/* Hover */
.task-actions .task-action {
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    opacity 0.18s ease,
    transform 0.18s ease;
}

.task-actions .task-action:hover {
  transform: translateY(-1px);
}

/* Mobile */
@media (max-width: 600px) {
  .task-actions-primary {
    gap: 6px;
  }

  .task-actions-primary .task-action {
    min-height: 34px;
    padding: 6px 9px;
    font-size: 11px;
  }

  .task-actions-primary .logged-time-action {
    margin-left: 0;
  }

  .task-actions-primary .task-more-toggle {
    margin-left: auto;
  }
}

.task-more-toggle[aria-expanded="true"] {
  opacity: 0.85;
}


/* =========================================================
   ASSET TYPE QUICK NAVIGATION
   ========================================================= */

#taskTypeQuickNav {
  width: 100%;
  padding: 14px 20px;
  margin: 0 0 12px;

  box-sizing: border-box;
}

.task-type-nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 12px;

  margin-bottom: 7px;

  padding: 0 2px;
}

.task-type-nav-label {
  font-size: 12px;
  font-weight: 700;

  color: var(
    --muted,
    #94a3b8
  );

  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.task-type-nav-hint {
  font-size: 11px;

  color: var(
    --muted,
    #64748b
  );
}

.task-type-nav-list {
  display: flex;

  gap: 7px;

  width: 100%;

  overflow-x: auto;
  overflow-y: hidden;

  padding: 2px 2px 7px;

  box-sizing: border-box;

  scrollbar-width: thin;

  -webkit-overflow-scrolling: touch;
}

.task-type-nav-list::-webkit-scrollbar {
  height: 6px;
}

.task-type-nav-list::-webkit-scrollbar-track {
  background: transparent;
}

.task-type-nav-list::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.25);
  border-radius: 999px;
}

.task-type-nav-item {
  flex: 0 0 auto;

  display: inline-flex;
  align-items: center;

  gap: 7px;

  min-height: 34px;

  padding: 6px 10px;

  border: 1px solid
    var(
      --border,
      rgba(148, 163, 184, 0.18)
    );

  border-radius: 9px;

  background: transparent;

  color: var(
    --muted,
    #94a3b8
  );

  cursor: pointer;

  white-space: nowrap;

  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.task-type-nav-item:hover {
  background: rgba(148, 163, 184, 0.08);
}

.task-type-nav-item.active {
  background: rgba(148, 163, 184, 0.13);

  border-color:
    rgba(148, 163, 184, 0.3);

  color: var(
    --text,
    #e5e7eb
  );
}

.task-type-nav-name {
  max-width: 220px;

  overflow: hidden;
  text-overflow: ellipsis;
}

.task-type-nav-count {
  min-width: 20px;
  height: 20px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  padding: 0 5px;

  border-radius: 999px;

  background: rgba(148, 163, 184, 0.12);

  font-size: 10px;
  font-weight: 700;
}


/* =========================================================
   MOBILE
   ========================================================= */

@media (max-width: 600px) {
  .task-type-nav-name {
    max-width: 160px;
  }

  .task-more-toggle {
    margin-left: 0;
  }
}
  `;

  document.head.appendChild(style);
}
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();

  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);

  return d;
}

function dateToLocalString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getTaskDateFilterRange(filter) {
  const now = new Date();

  if (filter === "today") {
    const value = today();

    return {
      start: value,
      end: value,
    };
  }

  if (filter === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);

    const value = dateToLocalString(d);

    return {
      start: value,
      end: value,
    };
  }

  if (filter === "this-week") {
    const start = startOfWeek(now);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    return {
      start: dateToLocalString(start),
      end: dateToLocalString(end),
    };
  }

  if (filter === "last-week") {
    const start = startOfWeek(now);
    start.setDate(start.getDate() - 7);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    return {
      start: dateToLocalString(start),
      end: dateToLocalString(end),
    };
  }

  if (filter === "this-month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      start: dateToLocalString(start),
      end: dateToLocalString(end),
    };
  }

  return null;
}

function taskMatchesDateFilter(task, filter, customDate = "") {
  if (filter === "all") {
    return true;
  }

  // Actual dates from WorkLogs and Corrections.
  const workDates = taskDates(task.id);

  // Combo Main Ticket Date is also a valid filter date.
  const combo = task.comboId
    ? state.combos.find((item) => item.id === task.comboId)
    : null;

  const baseDate = combo?.date || task.fixedDate || "";

  const dates = [...new Set([...workDates, baseDate].filter(Boolean))];

  if (!dates.length) {
    return false;
  }

  if (filter === "custom") {
    return customDate ? dates.includes(customDate) : false;
  }

  const range = getTaskDateFilterRange(filter);

  if (!range) {
    return true;
  }

  return dates.some((date) => date >= range.start && date <= range.end);
}

function renderDashboardTasks() {
  const tasks = state.tasks
    .filter((t) => t.status !== STATUS.ARCHIVED)
    .sort(
      (a, b) =>
        dateValue(b.updatedAt || b.createdAt) -
        dateValue(a.updatedAt || a.createdAt),
    )
    .slice(0, 5);
  $("dashboardTasks").innerHTML = tasks.length
    ? tasks.map((t) => renderTask(t, true)).join("")
    : `<div class="empty-state"><div class="empty-title">No tasks yet</div><div class="empty-text">Create your first task to get started.</div></div>`;
}

function renderToday() {
  const date = today();
  const entries = [
    ...state.workSessions
      .filter((x) => x.date === date)
      .map((x) => ({ ...x, kind: "normal" })),
    ...state.corrections
      .filter((x) => x.date === date)
      .map((x) => ({ ...x, kind: "correction" })),
  ].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  const total = entries.reduce((s, x) => s + (Number(x.duration) || 0), 0);
  $("todayTimelineTotal").textContent = formatDuration(total);
  if (!entries.length) {
    $("todayWorkList").innerHTML =
      `<div class="empty-state"><div class="empty-title">No work logged today</div><div class="empty-text">Add time to a task and your daily timeline will appear here.</div></div>`;
    return;
  }
  const groups = [];
  for (const e of entries) {
    const task = getTask(e.taskId);
    if (!task) continue;
    let g = groups.find((x) => x.taskId === e.taskId);
    if (!g) {
      g = { taskId: e.taskId, task, entries: [], total: 0 };
      groups.push(g);
    }
    g.entries.push(e);
    g.total += Number(e.duration) || 0;
  }
  $("todayWorkList").innerHTML = groups
    .map(
      (g) => `
    <div class="work-group">
      <div class="work-group-main">
        <div class="work-group-title">${escapeHtml(g.task.title)}</div>
        <div class="work-group-meta">${escapeHtml(g.task.project || "No project")} · ${escapeHtml(g.task.type || "Other")} ${statusBadge(g.task.status)}</div>
        <div class="work-entry-list">
          ${g.entries
            .map(
              (e) => `<div class="work-entry">
            <div class="work-entry-dot ${e.kind}"></div>
            <div class="work-entry-main"><strong>${escapeHtml(e.note || (e.kind === "correction" ? "Correction" : "Work session"))}</strong><span>${e.kind === "correction" ? "Correction" : "Normal"} · Today</span></div>
            <strong class="work-entry-duration">${formatDuration(e.duration)}</strong>
          </div>`,
            )
            .join("")}
        </div>
      </div>
      <strong class="work-group-total">${formatDuration(g.total)}</strong>
    </div>`,
    )
    .join("");
}

function renderRecentActivity() {
  const acts = state.activities
    .filter((a) => getTask(a.taskId))
    .sort(sortNewest)
    .slice(0, 8);
  $("recentActivityList").innerHTML = acts.length
    ? acts
        .map((a) => {
          const t = getTask(a.taskId);
          return `<div class="activity-row"><div class="activity-icon">${activityIcon(a.action)}</div><div class="activity-main"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(activityLabel(a))}</span></div><time>${escapeHtml(timeAgo(a.createdAt))}</time></div>`;
        })
        .join("")
    : `<div class="empty-state"><div class="empty-title">No activity yet</div><div class="empty-text">Your work journal will appear here.</div></div>`;
}
function activityIcon(a) {
  return (
    {
      task_created: "＋",
      time_added: "⏱",
      time_updated: "✎",
      time_deleted: "×",
      correction_added: "↻",
      status_changed: "●",
      task_edited: "✎",
      task_archived: "⚫",
      task_unarchived: "↩",
      correction_updated: "✎",
      correction_deleted: "×",
    }[a] || "•"
  );
}
const LEGACY_STATUS_LABELS = {
  in_correction: "In Correction",
  waiting: "Waiting",
};

function getStatusLabel(status) {
  return STATUS_META[status]?.label || LEGACY_STATUS_LABELS[status] || status;
}
function activityLabel(a) {
  const m = a.metadata || {};

  const duration = Number(m.duration) || Number(m.requiredMinutes) || 0;

  if (a.action === "time_added") {
    return `Time logged · ${formatDuration(duration)} · ${m.date || ""}`;
  }

  if (a.action === "correction_added") {
    return `Correction · ${formatDuration(m.duration)} · ${m.reason || "Other"}`;
  }

  if (a.action === "correction_updated") {
    return `Correction updated · ${formatDuration(m.duration)} · ${m.reason || "Other"}`;
  }

  if (a.action === "correction_deleted") {
    return `Correction deleted · ${formatDuration(m.duration)} · ${m.reason || "Other"}`;
  }

  if (a.action === "status_changed") {
    return `Status: ${getStatusLabel(m.from)} → ${getStatusLabel(m.to)}`;
  }

  if (a.action === "task_archived") {
    return "Task archived";
  }

  if (a.action === "task_unarchived") {
    return "Task unarchived";
  }

  if (a.action === "task_edited") {
    return "Task updated";
  }

  if (a.action === "time_updated") {
    return `WorkLog updated · ${formatDuration(duration)} · ${m.date || ""}`;
  }

  if (a.action === "time_deleted") {
    return `WorkLog deleted · ${formatDuration(duration)} · ${m.date || ""}`;
  }

  return "Task created";
}
function updateDashboard() {
  const d = today();
  const normal = state.workSessions.filter((x) => x.date === d);

  const corr = state.corrections.filter((x) => x.date === d);

  const nm = normal.reduce((sum, x) => sum + (Number(x.duration) || 0), 0);

  const cm = corr.reduce((sum, x) => sum + (Number(x.duration) || 0), 0);

  const total = nm + cm;

  const ids = new Set(
    [...normal, ...corr].map((x) => x.taskId).filter((id) => getTask(id)),
  );

  $("statTodayTime").textContent = formatDuration(total);

  $("statTasksWorked").textContent = ids.size;

  $("statCorrections").textContent = corr.length;

  const activeStatuses = [
    STATUS.OPEN,
    STATUS.IN_PRODUCTION,
    STATUS.IN_APPROVAL,
    STATUS.EXECUTION_PROOF,
  ];

  $("statOpenTasks").textContent = state.tasks.filter((t) =>
    activeStatuses.includes(t.status),
  ).length;

  $("summaryWorked").textContent = formatDuration(total);

  $("summaryTasks").textContent = ids.size;

  $("summaryCorrections").textContent = corr.length;

  renderToday();
  renderDashboardTasks();
  renderRecentActivity();
  renderWorkHours();
}

function ensureWorkWeekNavigation() {
  const label = $("workWeekLabel");

  if (!label) return;

  let nav = $("workWeekNavigation");

  if (!nav) {
    nav = document.createElement("div");
    nav.id = "workWeekNavigation";
    nav.className = "work-week-navigation";

    label.insertAdjacentElement("afterend", nav);
  }

  const currentMonday = getMonday(today());
  const selectedMonday = getMonday(selectedWorkWeekDate);

  const isCurrentWeek = selectedMonday === currentMonday;

  nav.innerHTML = `
    <button
      type="button"
      class="work-week-nav-btn"
      data-week-nav="prev"
    >
      ← Previous week
    </button>

    ${
      !isCurrentWeek
        ? `
          <button
            type="button"
            class="work-week-nav-btn current"
            data-week-nav="current"
          >
            This week
          </button>
        `
        : `
          <span class="work-week-current-label">
            Current week
          </span>
        `
    }

    <button
      type="button"
      class="work-week-nav-btn"
      data-week-nav="next"
      ${isCurrentWeek ? "disabled" : ""}
    >
      Next week →
    </button>
  `;

  nav.querySelector('[data-week-nav="prev"]').onclick = () => {
    changeSelectedWorkWeek(-1);
  };

  nav.querySelector('[data-week-nav="next"]').onclick = () => {
    changeSelectedWorkWeek(1);
  };

  nav
    .querySelector('[data-week-nav="current"]')
    ?.addEventListener("click", () => {
      selectedWorkWeekDate = today();
      renderWorkHours();
    });
}

function changeSelectedWorkWeek(offset) {
  const monday = new Date(`${getMonday(selectedWorkWeekDate)}T00:00:00`);

  monday.setDate(monday.getDate() + offset * 7);

  const nextWeek = localDateString(monday);

  // Không cho xem tuần tương lai
  if (getMonday(nextWeek) > getMonday(today())) {
    return;
  }

  selectedWorkWeekDate = nextWeek;

  renderWorkHours();
}

// function renderWorkHours() {
//   const date = today();
//   const day = getWorkDay(date);

//   const calc = day
//     ? calculateWorkDay(day.checkIn, day.checkOut, day.lunchMinutes)
//     : {
//         actualMinutes: 0,
//         normalMinutes: 0,
//         flexiMinutes: 0,
//         valid: false,
//       };

//   $("workTodayActual").textContent = formatDuration(calc.actualMinutes);

//   $("workTodayFlexi").textContent = formatFlexi(calc.flexiMinutes);

//   $("workWeekActual").textContent = formatDuration(weekActualMinutes(date));

//   $("flexiOpening").textContent = formatFlexi(openingFlexiMinutes);

//   $("flexiWeekAdded").textContent = formatFlexi(weekFlexiMinutes(date));

//   $("flexiAvailable").textContent = formatFlexi(availableFlexiMinutes(date));

//   $("workAvailableFlexi").textContent = formatFlexi(availableFlexiMinutes(date));

//   $("workFlexiHelper").textContent = `${formatFlexi(openingFlexiMinutes)} opening + ${formatFlexi(weekFlexiMinutes(date))} this week`;

//   $("workWeekFlexi").textContent = `${formatFlexi(weekFlexiMinutes(date))} flexi`;

//   const monday = getMonday(date);
//   const sunday = getSunday(date);

//   $("workWeekLabel").textContent = `${dateLabel(monday)} → ${dateLabel(sunday)}`;

//   renderTodayWorkDay(day, calc);
//   renderWorkWeekTable(date);
// }
function renderWorkHours() {
  const todayDate = today();

  // Initialize selected week
  if (!selectedWorkWeekDate) {
    selectedWorkWeekDate = todayDate;
  }

  const selectedDate = selectedWorkWeekDate;

  // =========================
  // TODAY DATA
  // =========================

  const day = getWorkDay(todayDate);

  const calc = day
    ? day.isLeave
      ? {
          actualMinutes: 0,
          normalMinutes: 0,
          flexiMinutes: -480,
          valid: true,
        }
      : calculateWorkDay(day.checkIn, day.checkOut, day.lunchMinutes)
    : {
        actualMinutes: 0,
        normalMinutes: 0,
        flexiMinutes: 0,
        valid: false,
      };
  // Today's metrics always remain today's data
  $("workTodayActual").textContent = formatDuration(calc.actualMinutes);

  $("workTodayFlexi").textContent = formatFlexi(calc.flexiMinutes);

  // =========================
  // SELECTED WEEK DATA
  // =========================

  $("workWeekActual").textContent = formatDuration(
    weekActualMinutes(selectedDate),
  );

  $("flexiWeekAdded").textContent = formatFlexi(weekFlexiMinutes(selectedDate));

  $("workWeekFlexi").textContent =
    `${formatFlexi(weekFlexiMinutes(selectedDate))} flexi`;

  // =========================
  // CURRENT FLEXI BALANCE
  // Keep current balance unchanged
  // =========================

  $("flexiOpening").textContent = formatFlexi(openingFlexiMinutes);

  // Dashboard Flexi Balance follows the selected week
  const selectedWeekEnd = getSunday(selectedDate);

  $("flexiAvailable").textContent = formatFlexi(
    availableFlexiMinutes(selectedWeekEnd),
  );

  $("workAvailableFlexi").textContent = formatFlexi(
    availableFlexiMinutes(todayDate),
  );

  // $("workFlexiHelper").textContent =
  //   `${formatFlexi(openingFlexiMinutes)} opening + ${formatFlexi(weekFlexiMinutes(todayDate))} this week`;

  const accumulatedFlexi =
    availableFlexiMinutes(todayDate) - openingFlexiMinutes;

  $("workFlexiHelper").textContent =
    `${formatFlexi(openingFlexiMinutes)} opening + ${formatFlexi(accumulatedFlexi)} accumulated`;

  // =========================
  // WEEK LABEL
  // =========================

  const monday = getMonday(selectedDate);
  const sunday = getSunday(selectedDate);

  $("workWeekLabel").textContent =
    `${dateLabel(monday)} → ${dateLabel(sunday)}`;

  // =========================
  // RENDER
  // =========================

  renderTodayWorkDay(day, calc);

  ensureWorkWeekNavigation();

  renderWorkWeekTable(selectedDate);
}
function renderTodayWorkDay(day, calc) {
  if (!day) {
    $("todayWorkDayCard").innerHTML = `
      <div class="work-day-empty">
        <div class="empty-title">No work hours recorded today</div>
        <div class="empty-text">
          Add your check-in, check-out and lunch break.
        </div>
      </div>
    `;
    return;
  }

  if (day.isLeave) {
    $("todayWorkDayCard").innerHTML = `
      <div class="work-day-empty">
        <div class="empty-title">🌴 Leave</div>
        <div class="empty-text">
          8h deducted from your Flexi balance.
        </div>
        <div class="work-day-metric" style="margin-top:12px">
          <span>Flexi deducted</span>
          <strong class="below-target">-8h</strong>
        </div>
      </div>
    `;
    return;
  }

  $("todayWorkDayCard").innerHTML = `
    <div class="work-day-main">

      <div class="work-day-metric">
        <span>Actual worked</span>
        <strong>${formatDuration(calc.actualMinutes)}</strong>
      </div>

      <div class="work-day-metric">
        <span>Normal time</span>
        <strong>${formatDuration(calc.normalMinutes)}</strong>
      </div>

      <div class="work-day-metric">
        <span>Flexi</span>
        <strong class="${calc.flexiMinutes < 0 ? "below-target" : "flexi-positive"}">
          ${formatFlexi(calc.flexiMinutes)}
        </strong>
      </div>

    </div>

    <div class="work-day-times">

      <div class="work-day-time-item">
        <span>Check-in</span>
        <strong>${escapeHtml(day.checkIn || "—")}</strong>
      </div>

      <div class="work-day-time-item">
        <span>Check-out</span>
        <strong>${escapeHtml(day.checkOut || "—")}</strong>
      </div>

      <div class="work-day-time-item">
        <span>Lunch</span>
        <strong>${Number(day.lunchMinutes) || 0}m</strong>
      </div>

    </div>
  `;
}
function renderWorkWeekTable(date = today()) {
  const dates = getWeekDates(date);

  $("workWeekTableBody").innerHTML = dates
    .map((d) => {
      const item = getWorkDay(d);
      const dateObj = new Date(`${d}T00:00:00`);

      const weekday = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
      });

      const editButton = `
        <button
          type="button"
          class="btn btn-small"
          data-edit-work-day="${escapeHtml(d)}"
        >
          Edit
        </button>
      `;

      if (!item) {
        return `
          <tr>
            <td>${escapeHtml(shortDate(d))}</td>
            <td>${weekday}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>${editButton}</td>
          </tr>
        `;
      }

      // Leave day
      if (item.isLeave) {
        return `
          <tr>
            <td>${escapeHtml(shortDate(d))}</td>
            <td>${weekday}</td>

            <td colspan="5">
              <span class="below-target">🌴 Leave</span>
            </td>

            <td class="below-target">
              -8h
            </td>

            <td>${editButton}</td>
          </tr>
        `;
      }

      const calc = calculateWorkDay(
        item.checkIn,
        item.checkOut,
        item.lunchMinutes,
      );

      const flexiClass =
        calc.flexiMinutes > 0
          ? "flexi-positive"
          : calc.flexiMinutes < 0
            ? "below-target"
            : "";

      return `
        <tr>
          <td>${escapeHtml(shortDate(d))}</td>
          <td>${weekday}</td>

          <td>${escapeHtml(item.checkIn || "—")}</td>
          <td>${escapeHtml(item.checkOut || "—")}</td>
          <td>${Number(item.lunchMinutes) || 0}m</td>

          <td>${formatDuration(calc.actualMinutes)}</td>
          <td>${formatDuration(calc.normalMinutes)}</td>

         <td class="${flexiClass}">
  ${calc.flexiMinutes > 0 ? "+" + formatFlexi(calc.flexiMinutes) : formatFlexi(calc.flexiMinutes)}
</td>

          <td>${editButton}</td>
        </tr>
      `;
    })
    .join("");
}
// function openWorkDayModal(date = today()) {
//   const item = getWorkDay(date);

//   $("workDayDate").value = date;
//   $("workDayCheckIn").value = item?.checkIn || "";
//   $("workDayCheckOut").value = item?.checkOut || "";
//   $("workDayLunch").value = item?.lunchMinutes ?? 60;

//   $("workDayModalTitle").textContent = date === today() ? "Today's Work Hours" : `Work Hours · ${dateLabel(date)}`;

//   updateWorkDayPreview();

//   openModal("workDayModal");
// }

// function updateWorkDayPreview() {
//   const calc = calculateWorkDay($("workDayCheckIn").value, $("workDayCheckOut").value, $("workDayLunch").value);

//   if (!calc.valid) {
//     $("workDayPreview").innerHTML = "Enter check-in and check-out to see the calculation.";
//     return;
//   }

//   const target = dailyTargetMinutes;

//   $("workDayPreview").innerHTML = `
//     <div>
//       Actual worked:
//       <strong>${formatDuration(calc.actualMinutes)}</strong>
//     </div>

//     <div style="margin-top:5px">
//       Daily target:
//       <strong>${formatDuration(target)}</strong>
//     </div>

//     <div style="margin-top:5px">
//       Flexi earned:
//       <strong>${formatFlexi(calc.flexiMinutes)}</strong>
//     </div>
//   `;
// }

// async function saveWorkDay(e) {
//   e.preventDefault();

//   const date = $("workDayDate").value;
//   const checkIn = $("workDayCheckIn").value;
//   const checkOut = $("workDayCheckOut").value;
//   const lunchMinutes = Math.max(0, Number($("workDayLunch").value) || 0);

//   if (!date || !checkIn || !checkOut) {
//     return notify("Please enter date, check-in and check-out.", "warning");
//   }

//   const calc = calculateWorkDay(checkIn, checkOut, lunchMinutes);

//   if (!calc.valid || calc.actualMinutes <= 0) {
//     return notify("The working time is not valid.", "warning");
//   }

//   try {
//     const existing = getWorkDay(date);

//     const data = {
//       date,
//       checkIn,
//       checkOut,
//       lunchMinutes,
//       actualMinutes: calc.actualMinutes,
//       normalMinutes: calc.normalMinutes,
//       flexiMinutes: calc.flexiMinutes,
//       updatedAt: serverTimestamp(),
//     };

//     if (existing) {
//       await updateDoc(doc(db, "workDays", existing.id), data);
//     } else {
//       data.createdAt = serverTimestamp();

//       await addDoc(collection(db, "workDays"), data);
//     }

//     closeModal("workDayModal");

//     notify("Work hours saved.");

//     renderWorkHours();
//   } catch (err) {
//     notify(err.message || "Could not save work hours.", "error");
//   }
// }
function ensureWorkDayLeaveOption() {
  const form = $("workDayForm");

  if (!form || $("workDayLeaveOption")) return;

  const wrapper = document.createElement("label");

  wrapper.id = "workDayLeaveOption";
  wrapper.style.cssText = `
    display:flex;
    align-items:center;
    gap:10px;
    margin:14px 0;
    padding:12px 14px;
    border:1px solid var(--border);
    border-radius:10px;
    cursor:pointer;
  `;

  wrapper.innerHTML = `
    <input
      type="checkbox"
      id="workDayIsLeave"
      style="width:17px;height:17px;"
    >

    <span>
      🌴 Mark as Leave
      <small style="display:block;opacity:.7;margin-top:3px">
        Deduct 8 hours from Flexi balance
      </small>
    </span>
  `;

  const preview = $("workDayPreview");

  if (preview) {
    preview.insertAdjacentElement("beforebegin", wrapper);
  } else {
    form.appendChild(wrapper);
  }

  $("workDayIsLeave").addEventListener("change", () => {
    updateWorkDayPreview();
  });
}

function openWorkDayModal(date = today()) {
  const item = getWorkDay(date);

  ensureWorkDayLeaveOption();

  $("workDayDate").value = date;
  $("workDayCheckIn").value = item?.checkIn || "";
  $("workDayCheckOut").value = item?.checkOut || "";
  $("workDayLunch").value = item?.lunchMinutes ?? 60;

  $("workDayIsLeave").checked = Boolean(item?.isLeave);

  $("workDayModalTitle").textContent =
    date === today() ? "Today's Work Hours" : `Work Hours · ${dateLabel(date)}`;

  updateWorkDayPreview();

  openModal("workDayModal");
}

function updateWorkDayPreview() {
  const isLeave = $("workDayIsLeave")?.checked || false;

  const checkIn = $("workDayCheckIn");
  const checkOut = $("workDayCheckOut");
  const lunch = $("workDayLunch");

  // Disable work-time inputs while Leave is selected
  [checkIn, checkOut, lunch].forEach((input) => {
    if (input) input.disabled = isLeave;
  });

  if (isLeave) {
    $("workDayPreview").innerHTML = `
      <div>
        Day type:
        <strong>🌴 Leave</strong>
      </div>

      <div style="margin-top:5px">
        Flexi deduction:
        <strong class="below-target">-8h</strong>
      </div>

      <div style="margin-top:5px;opacity:.7">
        This date will deduct 8 hours from your accumulated Flexi balance.
      </div>
    `;

    return;
  }

  const calc = calculateWorkDay(checkIn.value, checkOut.value, lunch.value);

  if (!calc.valid) {
    $("workDayPreview").innerHTML =
      "Enter check-in and check-out to see the calculation.";

    return;
  }

  const flexiClass = calc.flexiMinutes < 0 ? "below-target" : "flexi-positive";

  $("workDayPreview").innerHTML = `
    <div>
      Actual worked:
      <strong>${formatDuration(calc.actualMinutes)}</strong>
    </div>

    <div style="margin-top:5px">
      Daily target:
      <strong>${formatDuration(dailyTargetMinutes || 480)}</strong>
    </div>

    <div style="margin-top:5px">
      Flexi:
      <strong class="${flexiClass}">
        ${formatFlexi(calc.flexiMinutes)}
      </strong>
    </div>
  `;
}

async function saveWorkDay(e) {
  e.preventDefault();

  const date = $("workDayDate").value;
  const isLeave = $("workDayIsLeave")?.checked || false;

  if (!date) {
    return notify("Please select a date.", "warning");
  }

  const existing = getWorkDay(date);

  try {
    let data;

    if (isLeave) {
      data = {
        date,

        isLeave: true,

        checkIn: "",
        checkOut: "",
        lunchMinutes: 0,

        actualMinutes: 0,
        normalMinutes: 0,

        // Fixed 8-hour deduction
        flexiMinutes: -480,

        updatedAt: serverTimestamp(),
      };
    } else {
      const checkIn = $("workDayCheckIn").value;
      const checkOut = $("workDayCheckOut").value;

      const lunchMinutes = Math.max(0, Number($("workDayLunch").value) || 0);

      if (!checkIn || !checkOut) {
        return notify("Please enter check-in and check-out.", "warning");
      }

      const calc = calculateWorkDay(checkIn, checkOut, lunchMinutes);

      if (!calc.valid || calc.actualMinutes <= 0) {
        return notify("The working time is not valid.", "warning");
      }

      data = {
        date,

        isLeave: false,

        checkIn,
        checkOut,
        lunchMinutes,

        actualMinutes: calc.actualMinutes,
        normalMinutes: calc.normalMinutes,
        flexiMinutes: calc.flexiMinutes,

        updatedAt: serverTimestamp(),
      };
    }

    if (existing) {
      await updateDoc(doc(db, "workDays", existing.id), data);
    } else {
      data.createdAt = serverTimestamp();

      await addDoc(collection(db, "workDays"), data);
    }

    closeModal("workDayModal");

    notify(
      isLeave
        ? "Leave day saved. 8h deducted from Flexi."
        : "Work hours saved.",
    );

    renderWorkHours();
  } catch (err) {
    console.error("Failed to save work day:", err);

    notify(err.message || "Could not save work hours.", "error");
  }
}
let clientTypesDraft = [];
let clientFixedTimesDraft = {};

function populateTaskClients(selectedClientId = "") {
  const select = $("taskClient");

  if (!select) return;

  const clients = [...state.clients].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );

  select.innerHTML =
    `<option value="">Select client</option>` +
    clients
      .map(
        (client) =>
          `<option value="${escapeHtml(client.id)}">
            ${escapeHtml(client.name)}
          </option>`,
      )
      .join("");

  if (
    selectedClientId &&
    clients.some((client) => client.id === selectedClientId)
  ) {
    select.value = selectedClientId;
  }
}

function populateTaskTypes(clientId, selectedType = "") {
  const select = $("taskType");

  if (!select) return;

  if (!clientId) {
    select.innerHTML = `<option value="">Select client first</option>`;

    updateAssetTimePreview();
    return;
  }

  const types = getClientTypes(clientId);

  /*
   * Keep an old task's type visible even if that type
   * was removed from the client's current configuration.
   */
  if (selectedType && !types.includes(selectedType)) {
    types.push(selectedType);
  }

  select.innerHTML =
    `<option value="">Select type</option>` +
    types
      .map(
        (type) =>
          `<option value="${escapeHtml(type)}">
            ${escapeHtml(type)}
          </option>`,
      )
      .join("");

  if (selectedType) {
    select.value = selectedType;
  }

  updateAssetTimePreview();
}

function populateTaskTypeFilter() {
  const select = $("taskTypeFilter");

  if (!select) return;

  const selectedType = select.value || "all";

  /*
   * Include configured client types
   * + legacy types still used by old tasks.
   */
  const types = [
    ...new Set([
      ...getAllClientTypes(),
      ...state.tasks.map((task) => task.type).filter(Boolean),
    ]),
  ].sort();

  select.innerHTML =
    `<option value="all">All types</option>` +
    types
      .map(
        (type) =>
          `<option value="${escapeHtml(type)}">
            ${escapeHtml(type)}
          </option>`,
      )
      .join("");

  if (selectedType === "all" || types.includes(selectedType)) {
    select.value = selectedType;
  } else {
    select.value = "all";
  }
}
function populateTaskStatusFilter() {
  const select = $("taskStatusFilter");

  if (!select) return;

  const selectedStatus = select.value || "all";

  const statuses = Object.entries(STATUS_META)
    .filter(([key]) => key !== STATUS.ARCHIVED)
    .map(([key, meta]) => ({
      value: key,
      label: `${meta.icon} ${meta.label}`,
    }));

  select.innerHTML =
    `<option value="all">All statuses</option>` +
    statuses
      .map(
        (status) =>
          `<option value="${escapeHtml(status.value)}">
            ${escapeHtml(status.label)}
          </option>`,
      )
      .join("");

  if (
    selectedStatus === "all" ||
    statuses.some((status) => status.value === selectedStatus)
  ) {
    select.value = selectedStatus;
  } else {
    select.value = "all";
  }
}
function populateTaskLogFilter() {
  const select = $("taskLogFilter");

  if (!select) return;

  const selectedLog = select.value || "all";

  const options = [
    {
      value: "logged",
      label: "Logged",
    },
    {
      value: "not-logged",
      label: "Not logged",
    },
  ];

  select.innerHTML =
    `<option value="all">All</option>` +
    options
      .map(
        (option) =>
          `<option value="${option.value}">
            ${option.label}
          </option>`,
      )
      .join("");

  if (
    selectedLog === "all" ||
    options.some((option) => option.value === selectedLog)
  ) {
    select.value = selectedLog;
  } else {
    select.value = "all";
  }
}

function populateTaskDateFilter() {
  const select = $("taskDateFilter");

  if (!select) return;

  const selectedDate = select.value || "all";

  const options = Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.textContent.trim(),
  }));

  select.innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}">
          ${escapeHtml(option.label)}
        </option>`,
    )
    .join("");

  if (options.some((option) => option.value === selectedDate)) {
    select.value = selectedDate;
  } else {
    select.value = "all";
  }
}

function renderClients() {
  const container = $("clientsList");

  if (!container) return;

  if (!state.clients.length) {
    container.innerHTML = `
      <div class="empty-state">
        No clients configured yet.
      </div>
    `;

    return;
  }

  const clients = [...state.clients].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );

  container.innerHTML = clients
    .map((client) => {
      const types = Array.isArray(client.types) ? client.types : [];

      return `
        <div class="client-card">

          <div class="client-card-header">

            <div class="client-card-name">
              ${escapeHtml(client.name || "Unnamed Client")}
            </div>

            <div class="client-card-actions">

              <button
                type="button"
                class="btn btn-secondary"
                data-client-action="edit"
                data-client-id="${escapeHtml(client.id)}"
              >
                Edit
              </button>

              <button
                type="button"
                class="btn btn-danger"
                data-client-action="delete"
                data-client-id="${escapeHtml(client.id)}"
              >
                Delete
              </button>

            </div>

          </div>

          <div class="client-type-list">

            ${
              types.length
                ? types
                    .map((type) => {
                      const fixedMinutes = getFixedMinutesPerAsset(
                        client.id,
                        type,
                      );

                      return `
      <span class="client-type-chip">
        ${escapeHtml(type)}

        ${
          fixedMinutes > 0
            ? `<span class="client-type-fixed-badge">
                ${fixedMinutes}m / asset
              </span>`
            : ""
        }
      </span>
    `;
                    })
                    .join("")
                : `
                    <span class="field-helper">
                      No task types configured.
                    </span>
                  `
            }

          </div>

        </div>
      `;
    })
    .join("");

  container
    .querySelectorAll('[data-client-action="edit"]')
    .forEach((button) => {
      button.onclick = () => {
        const client = getClient(button.dataset.clientId);

        if (client) {
          openClientModal(client);
        }
      };
    });

  container
    .querySelectorAll('[data-client-action="delete"]')
    .forEach((button) => {
      button.onclick = () => {
        deleteClient(button.dataset.clientId);
      };
    });
}

function renderClientTypeDraft() {
  const container = $("clientTypesList");

  if (!container) return;

  if (!clientTypesDraft.length) {
    container.innerHTML = `
      <div class="field-helper">
        No task types added yet.
      </div>
    `;

    return;
  }

  container.innerHTML = clientTypesDraft
    .map((type, index) => {
      const fixedEnabled = Object.prototype.hasOwnProperty.call(
        clientFixedTimesDraft,
        type,
      );

      const minutes = Number(clientFixedTimesDraft[type]) || 0;

      return `
        <div class="client-type-editor-row">
          
          <div class="client-type-editor-main">
            
            <div class="client-type-editor-name">
              ${escapeHtml(type)}
            </div>

            <label class="fixed-time-toggle">
              <input
                type="checkbox"
                data-fixed-time-toggle="${escapeHtml(type)}"
                ${fixedEnabled ? "checked" : ""}
              />

              <span>Fixed Time</span>
            </label>

            <div
              class="fixed-time-config ${fixedEnabled ? "" : "hidden"}"
            >
              <input
                type="number"
                min="1"
                step="1"
                value="${minutes || ""}"
                placeholder="Minutes"
                data-fixed-time-minutes="${escapeHtml(type)}"
              />

              <span>min / asset</span>
            </div>

          </div>

          <button
            type="button"
            class="client-type-editor-remove"
            data-remove-client-type="${index}"
            title="Remove type"
          >
            ×
          </button>

        </div>
      `;
    })
    .join("");

  /*
   * Remove type
   */
  container.querySelectorAll("[data-remove-client-type]").forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.removeClientType);

      const type = clientTypesDraft[index];

      clientTypesDraft.splice(index, 1);

      /*
       * Important:
       * Removing a Task Type also removes its
       * Fixed Time configuration.
       */
      if (type) {
        delete clientFixedTimesDraft[type];
      }

      renderClientTypeDraft();
    };
  });

  /*
   * Enable / disable Fixed Time
   */
  container.querySelectorAll("[data-fixed-time-toggle]").forEach((checkbox) => {
    checkbox.onchange = () => {
      const type = checkbox.dataset.fixedTimeToggle;

      if (!type) return;

      if (checkbox.checked) {
        /*
         * Keep existing value if available.
         *
         * For legacy types, use the old global
         * Fixed Time value as the initial value.
         */
        if (
          !Object.prototype.hasOwnProperty.call(clientFixedTimesDraft, type)
        ) {
          clientFixedTimesDraft[type] = Number(FIXED_ASSET_TIMES[type]) || 0;
        }
      } else {
        delete clientFixedTimesDraft[type];
      }

      renderClientTypeDraft();
    };
  });

  /*
   * Fixed minutes input
   */
  container.querySelectorAll("[data-fixed-time-minutes]").forEach((input) => {
    input.oninput = () => {
      const type = input.dataset.fixedTimeMinutes;

      if (!type) return;

      clientFixedTimesDraft[type] = Math.max(0, Number(input.value) || 0);
    };
  });
}

function openClientModal(client = null) {
  $("clientId").value = client?.id || "";

  $("clientModalTitle").textContent = client ? "Edit Client" : "New Client";

  $("clientName").value = client?.name || "";

  clientTypesDraft = Array.isArray(client?.types) ? [...client.types] : [];

  /*
   * Load Client-specific Fixed Time settings.
   *
   * If this is an old Client without fixedTimeTypes,
   * automatically migrate the legacy global settings
   * into the editor visually.
   */
  clientFixedTimesDraft = {};

  if (
    client &&
    client.fixedTimeTypes &&
    typeof client.fixedTimeTypes === "object"
  ) {
    Object.entries(client.fixedTimeTypes).forEach(([type, value]) => {
      if (clientTypesDraft.includes(type)) {
        const minutes = Math.max(0, Number(value) || 0);

        if (minutes > 0) {
          clientFixedTimesDraft[type] = minutes;
        }
      }
    });
  } else {
    /*
     * Legacy fallback.
     */
    clientTypesDraft.forEach((type) => {
      const minutes = Number(FIXED_ASSET_TIMES[type]) || 0;

      if (minutes > 0) {
        clientFixedTimesDraft[type] = minutes;
      }
    });
  }

  $("clientTypeInput").value = "";

  renderClientTypeDraft();

  openModal("clientModal");
}

function addClientType() {
  const input = $("clientTypeInput");

  if (!input) return;

  const value = input.value.trim();

  if (!value) {
    return notify("Enter a task type first.", "warning");
  }

  const exists = clientTypesDraft.some(
    (type) => type.toLowerCase() === value.toLowerCase(),
  );

  if (exists) {
    return notify("This task type already exists.", "warning");
  }

  clientTypesDraft.push(value);

  input.value = "";

  renderClientTypeDraft();

  input.focus();
}

async function saveClient(e) {
  e.preventDefault();

  const id = $("clientId").value.trim();

  const name = $("clientName").value.trim();

  if (!name) {
    return notify("Please enter a client name.", "warning");
  }

  if (!clientTypesDraft.length) {
    return notify("Please add at least one task type.", "warning");
  }

  const duplicate = state.clients.find(
    (client) =>
      client.id !== id &&
      String(client.name || "")
        .trim()
        .toLowerCase() === name.toLowerCase(),
  );

  if (duplicate) {
    return notify("A client with this name already exists.", "warning");
  }

  const existingClient = id ? getClient(id) : null;

  /*
   * Close immediately so the UI feels responsive,
   * even while Firebase is saving.
   */
  const cleanedFixedTimeTypes = {};

  for (const type of clientTypesDraft) {
    if (Object.prototype.hasOwnProperty.call(clientFixedTimesDraft, type)) {
      const minutes = Math.max(0, Number(clientFixedTimesDraft[type]) || 0);

      if (minutes <= 0) {
        return notify(`Please enter Fixed Time for "${type}".`, "warning");
      }

      cleanedFixedTimeTypes[type] = minutes;
    }
  }
  closeModal("clientModal");
  $("clientForm").reset();

  try {
    const data = {
      name,
      types: [...clientTypesDraft],

      /*
       * Only Fixed Time task types are stored here.
       *
       * Example:
       * {
       *   "Banner release": 15,
       *   "Newsletter creation": 30
       * }
       */
      fixedTimeTypes: cleanedFixedTimeTypes,

      updatedAt: serverTimestamp(),
    };

    if (id) {
      await updateDoc(doc(db, "clients", id), data);

      /*
       * Keep the legacy `project` field in tasks
       * synchronized with the Client name.
       */
      if (existingClient && existingClient.name !== name) {
        const affectedTasks = state.tasks.filter(
          (task) =>
            task.clientId === id ||
            (!task.clientId &&
              String(task.project || "")
                .trim()
                .toLowerCase() ===
                String(existingClient.name || "")
                  .trim()
                  .toLowerCase()),
        );

        for (const task of affectedTasks) {
          await updateDoc(doc(db, "tasks", task.id), {
            clientId: id,
            project: name,
            updatedAt: serverTimestamp(),
          });
        }
      }

      notify("Client updated.");
    } else {
      await addDoc(collection(db, "clients"), {
        ...data,
        createdAt: serverTimestamp(),
      });

      notify("Client created.");
    }

    renderClients();
    populateTaskClients($("taskClient")?.value || "");
    populateTaskTypeFilter();
  } catch (err) {
    notify(err.message || "Could not save client.", "error");
  }
}

async function deleteClient(clientId) {
  const client = getClient(clientId);

  if (!client) return;

  const affectedTasks = state.tasks.filter(
    (task) =>
      task.clientId === clientId ||
      (!task.clientId &&
        String(task.project || "")
          .trim()
          .toLowerCase() ===
          String(client.name || "")
            .trim()
            .toLowerCase()),
  );

  if (affectedTasks.length) {
    return notify(
      `Cannot delete "${client.name}" because ${affectedTasks.length} task(s) are using this client.`,
      "warning",
    );
  }

  state.pendingConfirm = async () => {
    try {
      await deleteDoc(doc(db, "clients", clientId));

      notify("Client deleted.");

      renderClients();
      populateTaskClients("");
      populateTaskTypeFilter();
    } catch (err) {
      notify(err.message || "Could not delete client.", "error");
    }
  };

confirmAction(
  "Delete Client",
  `Delete "${client.name}" and all of its task type settings?`,
  state.pendingConfirm,
  "Delete"
);
}

function fillSelects() {
  populateTaskClients("");
  populateTaskTypes("");

  populateTaskTypeFilter();
  populateTaskStatusFilter();
  populateTaskLogFilter();
  populateTaskDateFilter();

  $("taskStatus").innerHTML = Object.entries(STATUS_META)
    .filter(([k]) => k !== STATUS.ARCHIVED)
    .map(
      ([k, v]) =>
        `<option value="${k}">
            ${v.icon} ${v.label}
          </option>`,
    )
    .join("");
}
const ACTIVE_PAGE_STORAGE_KEY = "worklog_active_page";

const VALID_APP_PAGES = [
  "dashboard",
  "work-hours",
  "tasks",
  "reports",
  "settings",
];

// ========================================
// HOVER / PIN SIDEBAR
// ========================================

function applySidebarState(collapsed, { reveal = false } = {}) {
  const app = $("app");
  const button = $("sidebarEdgeToggleBtn");

  if (!app) return;

  // collapsed = true: sidebar chưa ghim, chỉ mở khi hover
  // collapsed = false: sidebar được ghim và luôn mở
  app.classList.toggle("sidebar-collapsed", Boolean(collapsed));
  app.classList.toggle("sidebar-peek", Boolean(reveal) && Boolean(collapsed));
  app.classList.toggle("sidebar-pinned", !collapsed);

  if (button) {
    const pinned = !collapsed;

    button.setAttribute("aria-expanded", String(pinned || Boolean(reveal)));

    button.setAttribute(
      "aria-label",
      pinned ? "Unpin sidebar" : "Pin sidebar open",
    );

    button.title = pinned ? "Unpin sidebar" : "Pin sidebar open";

    button.textContent = pinned ? "‹" : "›";
  }
}

function initSidebarToggle() {
  const app = $("app");
  const button = $("sidebarEdgeToggleBtn");
  const sidebar = app?.querySelector(".sidebar");

  if (!app || !button || !sidebar) return;

  // Đọc trạng thái ghim đã lưu
  const saved = readUiPreferences().sidebarCollapsed === true;

  applySidebarState(saved);

  // Hover sát cạnh trái để mở Sidebar
  app.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;

    if (!app.classList.contains("sidebar-collapsed")) return;

    // Rê chuột sát cạnh trái
    if (event.clientX <= 20) {
      applySidebarState(true, { reveal: true });
      return;
    }

    // Rời Sidebar và nút ghim thì tự ẩn
    if (
      app.classList.contains("sidebar-peek") &&
      !sidebar.contains(event.target) &&
      !button.contains(event.target)
    ) {
      applySidebarState(true);
    }
  });

  // Rời toàn bộ vùng app
  app.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") return;

    if (app.classList.contains("sidebar-collapsed")) {
      applySidebarState(true);
    }
  });

  // Nhấn nút mũi tên để ghim / bỏ ghim
  // Hoạt động cả trên màn hình cảm ứng
  button.addEventListener("click", () => {
    const isPinned = app.classList.contains("sidebar-pinned");

    const collapsed = isPinned;

    applySidebarState(collapsed, {
      reveal: !collapsed,
    });

    saveUiPreferences({
      sidebarCollapsed: collapsed,
    });
  });
}

function setPage(page) {
  if (!VALID_APP_PAGES.includes(page)) {
    page = "dashboard";
  }

  state.activePage = page;

  // Save the last selected navigation page
  try {
    localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, page);
  } catch (err) {
    console.warn("Could not save the active page:", err);
  }

  document
    .querySelectorAll(".page")
    .forEach((x) => x.classList.toggle("active", x.id === `page-${page}`));

  document
    .querySelectorAll(".nav-item")
    .forEach((x) => x.classList.toggle("active", x.dataset.page === page));

  const meta = {
    dashboard: ["Dashboard", "Track your work, rework, and daily progress."],
    "work-hours": ["Work Hours", "Track office hours and flexi time."],
    tasks: ["Tasks", "Work items, time history, and status."],
    reports: ["Reports", "Understand where your time is going."],
    settings: ["Settings", "Backup and manage your WorkLog data."],
  }[page];

  $("pageTitle").textContent = meta[0];
  $("pageSubtitle").textContent = meta[1];

  if (page === "tasks") renderTasks();
  if (page === "reports") renderReport();
  if (page === "work-hours") renderWorkHours();
}
function updateAssetTimePreview() {
  updateTaskRequiredTimeVisibility();

  const clientId = $("taskClient")?.value || "";

  const type = $("taskType")?.value || "";

  const amount = Math.max(0, Number($("taskAssetAmount")?.value) || 0);

  const minutesPerAsset = getFixedMinutesPerAsset(clientId, type);

  if (!minutesPerAsset) {
    $("assetAmountField").style.display = "none";

    $("assetTimePreview").textContent = "Fixed time: —";

    return;
  }

  $("assetAmountField").style.display = "";

  if (!amount) {
    $("assetTimePreview").textContent =
      `Fixed time: ${minutesPerAsset}m per asset`;

    return;
  }

  const totalMinutes = amount * minutesPerAsset;

  $("assetTimePreview").textContent =
    `Fixed time: ${amount} × ${minutesPerAsset}m = ${formatDuration(totalMinutes)}`;
}

function updateTaskRequiredTimeVisibility() {
  const field = $("taskRequiredTimeField");
  if (!field) return;

  const clientId = $("taskClient")?.value || "";
  const type = $("taskType")?.value || "";

  const minutesPerAsset = getFixedMinutesPerAsset(clientId, type);

  const isFixedTask = minutesPerAsset > 0;

  field.style.display = isFixedTask ? "none" : "";
}

function updateLoggedTimePreview() {
  const loggedMinutes = Math.max(
    0,
    Math.round(Number($("taskLoggedHours").value) || 0),
  );

  $("loggedTimePreview").textContent =
    `Logged: ${formatDuration(loggedMinutes)}`;
}
// function openLoggedTimeModal(task) {
//   if (!task) return;

//   $("loggedTimeTaskId").value = task.id;

//   $("loggedTimeHours").value = Number(task.loggedMinutes) || 0;

//   updateQuickLoggedTimePreview();

//   openModal("loggedTimeModal");
// }
// function updateQuickLoggedTimePreview() {
//   const loggedMinutes = Math.max(0, Math.round(Number($("loggedTimeHours").value) || 0));

//   $("quickLoggedTimePreview").textContent = `Logged: ${formatDuration(loggedMinutes)}`;
// }
// async function saveLoggedTime(e) {
//   e.preventDefault();

//   const taskId = $("loggedTimeTaskId").value.trim();

//   if (!taskId) {
//     return notify("Task not found.", "error");
//   }

//   const task = getTask(taskId);

//   if (!task) {
//     return notify("Task not found.", "error");
//   }

//   const loggedMinutes = Math.max(
//     0,
//     Math.round(Number($("loggedTimeHours").value) || 0),
//   );

//   try {
//     await updateDoc(doc(db, "tasks", taskId), {
//       loggedMinutes,
//       updatedAt: serverTimestamp(),
//     });

//     closeModal("loggedTimeModal");

//     $("loggedTimeForm").reset();

//     await addActivity(taskId, "logged_time_updated");

//     notify("Logged time updated.");
//   } catch (err) {
//     notify(err.message || "Could not update logged time.", "error");
//   }
// }

function openLoggedTimeModal(task) {
  if (!task) return;

  $("loggedTimeTaskId").value = task.id;

  $("loggedTimeHours").value = Number(task.loggedMinutes) || 0;

  updateQuickLoggedTimePreview();

  openModal("loggedTimeModal");
}

function updateQuickLoggedTimePreview() {
  const loggedMinutes = Math.max(
    0,
    Math.round(Number($("loggedTimeHours").value) || 0),
  );

  $("quickLoggedTimePreview").textContent =
    `Logged: ${formatDuration(loggedMinutes)}`;
}

async function saveLoggedTime(e) {
  e.preventDefault();

  const taskId = $("loggedTimeTaskId").value.trim();

  if (!taskId) {
    return notify("Task not found.", "error");
  }

  const task = getTask(taskId);

  if (!task) {
    return notify("Task not found.", "error");
  }

  const loggedMinutes = Math.max(
    0,
    Math.round(Number($("loggedTimeHours").value) || 0),
  );

  try {
    await updateDoc(doc(db, "tasks", taskId), {
      loggedMinutes,
      updatedAt: serverTimestamp(),
    });

    closeModal("loggedTimeModal");

    $("loggedTimeForm").reset();

    await addActivity(taskId, "logged_time_updated", {
      loggedMinutes,
    });

    notify(`Logged updated to ${formatDuration(loggedMinutes)}.`);
  } catch (err) {
    notify(err.message || "Could not update logged time.", "error");
  }
}
// async function quickLogTask(task) {
//   if (!task) return;

//   const fixedMinutes = Number(task.fixedMinutes) || 0;
//   const correction = correctionMinutes(task.id);
//   const requiredMinutes = fixedMinutes + correction;
//   const loggedMinutes = Number(task.loggedMinutes) || 0;
//   const remainingMinutes = Math.max(0, requiredMinutes - loggedMinutes);

//   if (remainingMinutes <= 0) return;

//   try {
//     await updateDoc(doc(db, "tasks", task.id), {
//       loggedMinutes: requiredMinutes,
//       updatedAt: serverTimestamp(),
//     });

//     await addActivity(task.id, "logged_time_updated");

//     notify(`Logged ${formatDuration(remainingMinutes)}.`);
//   } catch (err) {
//     notify(err.message || "Could not update logged time.", "error");
//   }
// }

// async function quickLogTask(task) {
//   if (!task) return;

//   // Fixed Time does not use Remaining.
//   if ((Number(task.fixedMinutes) || 0) > 0) return;

//   const correction = correctionMinutes(task.id);

//   const workLogRequired = state.workSessions
//     .filter(
//       (x) => x.taskId === task.id && x.source !== "fixed"
//     )
//     .reduce(
//       (sum, x) => sum + (Number(x.requiredMinutes) || 0),
//       0
//     );

//   const requiredMinutes = workLogRequired + correction;
//   const loggedMinutes = Math.max(
//     0,
//     Number(task.loggedMinutes) || 0
//   );

//   const remainingMinutes = Math.max(
//     0,
//     requiredMinutes - loggedMinutes
//   );

//   if (remainingMinutes <= 0) return;

//   try {
//     await updateDoc(doc(db, "tasks", task.id), {
//       loggedMinutes: requiredMinutes,
//       updatedAt: serverTimestamp(),
//     });

//     await addActivity(task.id, "logged_time_updated");

//     notify(`Logged ${formatDuration(remainingMinutes)}.`);
//   } catch (err) {
//     notify(err.message || "Could not update logged time.", "error");
//   }
// }
async function quickLogTask(task) {
  if (!task) return;

  const summary = getTaskTimeSummary(task);

  /*
   * Fixed Time never uses Quick Log.
   */
  // if (summary.isFixedTask) {
  //   return;
  // }

  if (summary.requiredMinutes <= 0) {
    return;
  }

  // if (summary.remainingMinutes <= 0) {
  //   return;
  // }

  const quickLogRemainingMinutes = Math.max(
    0,
    summary.requiredMinutes - summary.loggedMinutes,
  );

  if (quickLogRemainingMinutes <= 0) {
    return;
  }
  try {
    /*
     * Quick Log means:
     *
     * External Logged becomes the full
     * required amount.
     *
     * WorkLog duration is NOT touched.
     */
    await updateDoc(doc(db, "tasks", task.id), {
      loggedMinutes: summary.requiredMinutes,
      updatedAt: serverTimestamp(),
    });

    await addActivity(task.id, "logged_time_updated", {
      loggedMinutes: summary.requiredMinutes,
      source: "quick_log",
    });

    notify(`Logged ${formatDuration(quickLogRemainingMinutes)}.`);
  } catch (err) {
    notify(err.message || "Could not update logged time.", "error");
  }
}

// function openTaskModal(task = null) {
//   $("taskId").value = task?.id || "";

//   $("taskModalTitle").textContent = task ? "Edit Task" : "New Task";

//   $("taskTitle").value = task?.title || "";

//   /*
//    * New task:
//    *   no client selected.
//    *
//    * Existing task:
//    *   use clientId if available.
//    *   otherwise try to match legacy `project`.
//    */
//   const inferredClient = task?.clientId
//     ? getClient(task.clientId)
//     : getClientByName(task?.project);

//   const clientId = inferredClient?.id || "";

//   populateTaskClients(clientId);

//   populateTaskTypes(clientId, task?.type || "");

//   $("taskStatus").value = task?.status || STATUS.OPEN;

//   $("taskUrl").value = task?.url || "";

//   $("taskNote").value = task?.note || "";

//   $("taskAssetAmount").value = task?.assetAmount || 1;

//   $("taskLoggedHours").value = task?.loggedMinutes
//     ? Number(task.loggedMinutes)
//     : 0;

//   updateAssetTimePreview();
//   updateLoggedTimePreview();

//   openModal("taskModal");
// }

function openTaskModal(task = null) {
  $("taskId").value = task?.id || "";

  $("taskModalTitle").textContent = task ? "Edit Task" : "New Task";

  $("taskTitle").value = task?.title || "";

  const inferredClient = task?.clientId
    ? getClient(task.clientId)
    : getClientByName(task?.project);

  const clientId = inferredClient?.id || (!task ? defaultTaskClientId : "");

  populateTaskClients(clientId);

  populateTaskTypes(clientId, task?.type || "");

  $("taskStatus").value = task?.status || STATUS.OPEN;

  $("taskUrl").value = task?.url || "";

  $("taskNote").value = task?.note || "";

  $("taskAssetAmount").value = task?.assetAmount || 1;

  // Required Time belongs to the task.
  const requiredMinutes = Math.max(0, Number(task?.requiredMinutes) || 0);

  $("taskRequiredHours").value = Math.floor(requiredMinutes / 60);

  $("taskRequiredMinutes").value = requiredMinutes % 60;

  updateAssetTimePreview();

  openModal("taskModal");
}

// function openTimeModal(taskId, entry = null) {
//   const t = getTask(taskId);
//   if (!t) return;

//   $("timeTaskId").value = taskId;
//   $("timeModalTaskName").textContent = t.title;

//   $("timeEntryId").value = entry?.id || "";

//   $("timeDate").value = entry?.date || today();

//   // const duration = Number(entry?.duration) || 0;

//   // $("timeHours").value = Math.floor(duration / 60);

//   // $("timeMinutes").value = duration % 60;

//   // $("timeNote").value = entry?.note || "";

// const duration = Number(entry?.duration) || 0;
// const requiredMinutes = Number(entry?.requiredMinutes) || 0;

// $("timeRequiredHours").value = Math.floor(requiredMinutes / 60);
// $("timeRequiredMinutes").value = requiredMinutes % 60;

// $("timeHours").value = Math.floor(duration / 60);
// $("timeMinutes").value = duration % 60;

// $("timeNote").value = entry?.note || "";

//   const title = $("timeModalTitle");
//   if (title) {
//     title.textContent = entry ? "Edit WorkLog" : "Add WorkLog";
//   }

//   openModal("timeModal");
// }
function openTimeModal(taskId, entry = null) {
  const t = getTask(taskId);
  if (!t) return;

  const isFixedTask = (Number(t.fixedMinutes) || 0) > 0;

  // Fixed Time uses its existing shadow WorkLog.
  if (isFixedTask && !entry) {
    entry =
      state.workSessions.find(
        (x) =>
          x.taskId === taskId &&
          x.source === "fixed" &&
          x.fixedTaskId === taskId,
      ) || null;
  }

  $("timeTaskId").value = taskId;

  $("timeModalTaskName").textContent = t.title;

  $("timeEntryId").value = entry?.id || "";

  // Fixed Time → use its Worked date / fixedDate
  $("timeDate").value =
    entry?.date || (isFixedTask ? t.fixedDate : "") || today();

  // Normal Time → Required Time
  // Fixed Time → show fixedMinutes only
  const displayMinutes = isFixedTask
    ? Number(t.fixedMinutes) || 0
    : Number(t.requiredMinutes) || 0;

  $("timeRequiredHours").value = Math.floor(displayMinutes / 60);

  $("timeRequiredMinutes").value = displayMinutes % 60;

  $("timeNote").value = entry?.note || "";

  const title = $("timeModalTitle");

  if (title) {
    title.textContent = isFixedTask
      ? "Edit Fixed Time Date"
      : entry
        ? "Edit WorkLog"
        : "Add WorkLog";
  }

  openModal("timeModal");
}

function openCorrectionModal(taskId, entry = null) {
  const t = getTask(taskId);

  if (!t) return;

  $("correctionTaskId").value = taskId;
  $("correctionEntryId").value = entry?.id || "";

  $("correctionModalTaskName").textContent = t.title;

  $("correctionDate").value = entry?.date || today();

  const duration = Number(entry?.duration) || 0;

  $("correctionHours").value = Math.floor(duration / 60);

  $("correctionMinutes").value = duration % 60;

  $("correctionNote").value = entry?.note || "";

  const reason = entry?.reason || "client_feedback";

  const reasonInput = document.querySelector(
    `input[name="correctionReason"][value="${reason}"]`,
  );

  if (reasonInput) {
    reasonInput.checked = true;
  }

  const title = $("correctionModalTitle");

  if (title) {
    title.textContent = entry ? "Edit Correction" : "Add Correction";
  }

  const submitBtn = $("correctionSubmitBtn");

  if (submitBtn) {
    submitBtn.textContent = entry ? "Update Correction" : "Save Correction";
  }

  openModal("correctionModal");
}

function openHistory(taskId) {
  const t = getTask(taskId);
  const isFixedTask = (Number(t.fixedMinutes) || 0) > 0;
  if (!t) return;

  const normal = state.workSessions
    .filter((x) => x.taskId === taskId && x.source !== "fixed")
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        dateValue(b.createdAt) - dateValue(a.createdAt),
    );

  const corr = state.corrections
    .filter((x) => x.taskId === taskId)
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        dateValue(b.createdAt) - dateValue(a.createdAt),
    );

  const acts = state.activities
    .filter((x) => x.taskId === taskId)
    .sort(sortNewest);

  $("historyTitle").textContent = t.title;

  $("historySubtitle").textContent =
    `${t.project || "No project"} · ${t.type || "Other"}`;

  $("historySummary").innerHTML = `
    <div>
      <span>Total</span>
      <strong>${formatDuration(taskMinutes(taskId))}</strong>
    </div>

    <div>
      <span>Normal</span>
      <strong>${formatDuration(normalMinutes(taskId))}</strong>
    </div>

    <div>
      <span>Corrections</span>
      <strong>${formatDuration(correctionMinutes(taskId))}</strong>
    </div>

    <div>
      <span>Fixed Time</span>
      <strong>${formatDuration(t.fixedMinutes || 0)}</strong>
    </div>

    <div>
      <span>Logged Time</span>
      <strong>${formatDuration(t.loggedMinutes || 0)}</strong>
    </div>

    <div>
      <span>Status</span>
      <strong>${escapeHtml(STATUS_META[t.status]?.label || t.status)}</strong>
    </div>
  `;

  const activityHtml = acts.length
    ? `
      <div class="history-section">
        <h3>Activity</h3>

        ${acts
          .map(
            (a) => `
              <div class="history-item">
                <span class="history-dot"></span>

                <div>
                  <strong>${escapeHtml(activityLabel(a))}</strong>

                  <small>
                    ${escapeHtml(a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : dateLabel(a.metadata?.date))}
                  </small>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `
    : "";

  const entries = [
    ...normal.map((x) => ({
      ...x,
      kind: "Normal",
      source: "workSession",
    })),

    ...corr.map((x) => ({
      ...x,
      kind: "Correction",
      source: "correction",
    })),
  ].sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      dateValue(b.createdAt) - dateValue(a.createdAt),
  );

  const timeLogHtml = entries.length
    ? entries
        .map((e) => {
          const isWorkLog = e.source === "workSession";

          return `
            <div class="history-log">

              <div>
                <strong>
                  ${escapeHtml(e.date ? dateLabel(e.date) : "No date")}
                </strong>

                <span class="badge ${e.kind === "Correction" ? "correction" : "normal"}">
                  ${e.kind === "Normal" ? "WorkLog" : "Correction"}
                </span>
              </div>

              <div>
                <strong>${formatDuration(e.duration)}</strong>

                <small>
                  ${escapeHtml(e.note || "No note")}
                </small>
              </div>

              ${
                isWorkLog
                  ? `
      <div class="history-log-actions">

        <button
          type="button"
          class="task-action"
          data-history-action="edit-worklog"
          data-entry-id="${e.id}"
          data-task-id="${taskId}"
        >
          Edit
        </button>

        <button
          type="button"
          class="task-action danger"
          data-history-action="delete-worklog"
          data-entry-id="${e.id}"
          data-task-id="${taskId}"
        >
          Delete
        </button>

      </div>
    `
                  : `
      <div class="history-log-actions">

        <button
          type="button"
          class="task-action"
          data-history-action="edit-correction"
          data-entry-id="${e.id}"
          data-task-id="${taskId}"
        >
          Edit
        </button>

        <button
          type="button"
          class="task-action danger"
          data-history-action="delete-correction"
          data-entry-id="${e.id}"
          data-task-id="${taskId}"
        >
          Delete
        </button>

      </div>
    `
              }

            </div>
          `;
        })
        .join("")
    : `<div class="empty-state">No time entries yet.</div>`;

  $("historyContent").innerHTML =
    activityHtml +
    `
      <div class="history-section">
        <h3>Time Log</h3>
        ${timeLogHtml}
      </div>
    `;

  /*
   * WorkLog actions
   */
  $("historyContent")
    .querySelectorAll('[data-history-action="edit-worklog"]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        const entryId = button.dataset.entryId;

        const entry = state.workSessions.find((x) => x.id === entryId);

        if (!entry) {
          return notify("WorkLog entry not found.", "error");
        }

        closeModal("historyModal");

        openTimeModal(taskId, entry);
      });
    });

  $("historyContent")
    .querySelectorAll('[data-history-action="delete-worklog"]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        deleteWorkLog(button.dataset.entryId);
      });
    });
  /*
   * Correction actions
   */

  $("historyContent")
    .querySelectorAll('[data-history-action="edit-correction"]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        const entryId = button.dataset.entryId;

        const entry = state.corrections.find((x) => x.id === entryId);

        if (!entry) {
          return notify("Correction entry not found.", "error");
        }

        closeModal("historyModal");

        openCorrectionModal(taskId, entry);
      });
    });

  $("historyContent")
    .querySelectorAll('[data-history-action="delete-correction"]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        deleteCorrection(button.dataset.entryId);
      });
    });
  /*
   * Add WorkLog
   */
  const historyAddTimeBtn = $("historyAddTimeBtn");

  if (historyAddTimeBtn) {
    // historyAddTimeBtn.style.display = isFixedTask ? "none" : "";

    historyAddTimeBtn.onclick = () => {
      // if (isFixedTask) return;

      closeModal("historyModal");
      openTimeModal(taskId);
    };
  }
  /*
   * Add Correction
   */
  $("historyCorrectionBtn").onclick = () => {
    closeModal("historyModal");
    openCorrectionModal(taskId);
  };

  openModal("historyModal");
}

async function addActivity(taskId, action, metadata = {}) {
  await addDoc(collection(db, "activityLogs"), {
    taskId,
    action,
    metadata,
    createdAt: serverTimestamp(),
  });
}

let fixedMigrationRunning = false;
let fixedMigrationDone = false;

async function syncFixedWorkLog(taskId, fixedMinutes, fixedDate) {
  if (!taskId) return;

  const existingEntries = state.workSessions.filter(
    (x) => x.source === "fixed" && x.fixedTaskId === taskId,
  );

  if (Number(fixedMinutes) > 0 && fixedDate) {
    const data = {
      taskId,
      date: fixedDate,
      duration: Number(fixedMinutes),
      note: "Fixed task time",
      type: "normal",
      source: "fixed",
      fixedTaskId: taskId,
      updatedAt: serverTimestamp(),
    };

    if (!existingEntries.length) {
      await addDoc(collection(db, "workSessions"), {
        ...data,
        createdAt: serverTimestamp(),
      });

      return;
    }

    const [primary, ...duplicates] = existingEntries;

    await updateDoc(doc(db, "workSessions", primary.id), {
      duration: Number(fixedMinutes),
      updatedAt: serverTimestamp(),
    });

    for (const duplicate of duplicates) {
      await deleteDoc(doc(db, "workSessions", duplicate.id));
    }

    return;
  }

  for (const entry of existingEntries) {
    await deleteDoc(doc(db, "workSessions", entry.id));
  }
}

async function migrateFixedTasksToWorkLogs() {
  if (fixedMigrationRunning || fixedMigrationDone) {
    return;
  }

  fixedMigrationRunning = true;

  try {
    const workSnap = await getDocs(collection(db, "workSessions"));

    const workLogs = workSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const fixedTasks = state.tasks.filter(
      (task) => Number(task.fixedMinutes) > 0 && task.fixedDate,
    );

    for (const task of fixedTasks) {
      const entries = workLogs.filter(
        (x) => x.source === "fixed" && x.fixedTaskId === task.id,
      );

      const data = {
        taskId: task.id,
        date: task.fixedDate,
        duration: Number(task.fixedMinutes),
        note: "Fixed task time",
        type: "normal",
        source: "fixed",
        fixedTaskId: task.id,
        updatedAt: serverTimestamp(),
      };

      if (!entries.length) {
        await addDoc(collection(db, "workSessions"), {
          ...data,
          createdAt: serverTimestamp(),
        });

        continue;
      }

      const [primary, ...duplicates] = entries;

      if (Number(primary.duration) !== Number(task.fixedMinutes)) {
        await updateDoc(doc(db, "workSessions", primary.id), {
          duration: Number(task.fixedMinutes),
          updatedAt: serverTimestamp(),
        });
      }

      for (const duplicate of duplicates) {
        await deleteDoc(doc(db, "workSessions", duplicate.id));
      }
    }

    fixedMigrationDone = true;

    console.log("Fixed → WorkLog migration completed.");
  } catch (err) {
    console.error("Fixed → WorkLog migration failed:", err);
  } finally {
    fixedMigrationRunning = false;
  }
}

// async function saveTask(e) {
//   e.preventDefault();

//   const id = $("taskId").value.trim();

//   const clientId = $("taskClient").value;

//   const type = $("taskType").value;

//   const client = getClient(clientId);

//   if (!clientId || !client) {
//     return notify("Please select a client.", "warning");
//   }

//   if (!type) {
//     return notify("Please select a task type.", "warning");
//   }

//   const minutesPerAsset = getFixedMinutesPerAsset(clientId, type);

//   const assetAmount =
//     minutesPerAsset > 0
//       ? Math.max(0, Number($("taskAssetAmount").value) || 0)
//       : 0;

//   const fixedMinutes =
//     minutesPerAsset > 0 && assetAmount > 0 ? assetAmount * minutesPerAsset : 0;

//   const loggedMinutes = Math.max(
//     0,
//     Math.round(Number($("taskLoggedHours").value) || 0),
//   );

//   const existingTask = id ? getTask(id) : null;

//   const fixedDate =
//     minutesPerAsset > 0 && fixedMinutes > 0
//       ? existingTask?.fixedDate || today()
//       : "";

//   const data = {
//     title: $("taskTitle").value.trim(),

//     /*
//      * NEW
//      */
//     clientId,

//     /*
//      * Keep the old field so Reports,
//      * CSV export, old data, etc. continue
//      * to work exactly as before.
//      */
//     project: client.name,

//     type,

//     status: $("taskStatus").value,

//     url: $("taskUrl").value.trim(),

//     note: $("taskNote").value.trim(),

//     assetAmount,
//     fixedMinutes,
//     fixedDate,

//     loggedMinutes,

//     updatedAt: serverTimestamp(),
//   };

//   if (!data.title) {
//     return notify("Please enter a task title.", "warning");
//   }

//   if (minutesPerAsset > 0 && assetAmount <= 0) {
//     return notify("Please enter the amount of assets.", "warning");
//   }

//   /*
//    * Close immediately.
//    * Firebase saving continues in the background.
//    */
//   closeModal("taskModal");
//   $("taskForm").reset();

//   try {
//     if (id) {
//       await updateDoc(doc(db, "tasks", id), data);

//       await syncFixedWorkLog(id, fixedMinutes, fixedDate);

//       await addActivity(id, "task_edited");

//       notify("Task updated.");
//     } else {
//       data.createdAt = serverTimestamp();

//       const ref = await addDoc(collection(db, "tasks"), data);

//       await syncFixedWorkLog(ref.id, fixedMinutes, fixedDate);

//       await addActivity(ref.id, "task_created");

//       notify("Task created.");
//     }
//   } catch (err) {
//     notify(err.message || "Could not save task.", "error");
//   }
// }
// ========================================
// COMBO TASKS
// ========================================

function parseComboTime(value) {
  const input = String(value || "")
    .trim()
    .toLowerCase();

  if (!input) return 0;

  // Supports: 30m, 90m, 1h, 1h30m, 2h15m
  const match = input.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);

  if (!match || (!match[1] && !match[2])) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);

  return hours * 60 + minutes;
}

function formatComboTimeInput(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours && mins) return `${hours}h${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

const COMBO_COUNTRY_LANGUAGES = {
  DE: ["DE"],
  EN: ["EN"],
  FR: ["FR"],
  AT: ["DE"],
  BE: ["NL", "FR", "EN"],
  NL: ["NL"],
  UK: ["EN"],
  ES: ["ES"],
  PT: ["PT"],
  IT: ["IT"],
  DK: ["DA"],
  NO: ["NO"],
  SE: ["SV"],
  EE: ["ET"],
  LV: ["LV"],
  LT: ["LT"],
  PL: ["PL"],
  FI: ["FI"],
  SI: ["SL"],
  HR: ["HR"],
  SK: ["SK"],
  CZ: ["CZ"],
  HU: ["HU"],
  RO: ["RO"],
  BG: ["BG"],
  RS: ["SR"],
  ME: ["ME"],
  CH: ["DE", "FR", "IT"],
  UZ: ["UZ"],
  KZ: ["KK", "RU"],
  AZ: ["AZ"],
};

function getDefaultComboSubtasks() {
  return Object.entries(COMBO_COUNTRY_LANGUAGES).flatMap(
    ([country, languages]) =>
      languages.map((language) => ({
        countryCode: `${country}-${language}`,
        url: "",
        requiredMinutes: 0,
      })),
  );
}
function parseComboSubtasks() {
  const timeMode = $("comboTimeMode")?.value || "fixed";
  const container = $("comboSubtasksList");

  if (!container) return [];

  return Array.from(container.querySelectorAll(".combo-subtask-card")).map(
    (card) => {
      const countryCode = (
        card.querySelector('[data-field="countryCode"]')?.value || ""
      )
        .trim()
        .toUpperCase();

      const url = (
        card.querySelector('[data-field="url"]')?.value || ""
      ).trim();

      const timeText =
        card.querySelector('[data-field="requiredMinutes"]')?.value || "";

      const requiredMinutes =
        url && timeMode === "individual"
          ? parseComboTime(timeText.trim())
          : 0;

      return {
        countryCode,
        title: countryCode,
        url,
        requiredMinutes,
      };
    },
  );
}
function renderComboSubtasks(items = []) {
  const container = $("comboSubtasksList");

  if (!container) return;

  container.innerHTML = "";

  const timeMode = $("comboTimeMode")?.value || "fixed";
  const isIndividual = timeMode === "individual";

  const subtasks = items.length
    ? items
    : [{ countryCode: "", url: "", requiredMinutes: 0 }];

  // Header
  const header = document.createElement("div");
  header.className = "combo-subtask-row combo-subtask-header";

  header.innerHTML = `
<div>Country-Language</div>
    <div>Email Link</div>
    ${isIndividual ? "<div>Required Time</div>" : ""}
    <div></div>
  `;

  container.appendChild(header);

  // Subtask rows
  subtasks.forEach((item, index) => {
    const row = document.createElement("div");

    row.className = "combo-subtask-row combo-subtask-card";

    const timeValue =
      isIndividual && Number(item.requiredMinutes) > 0
        ? formatComboTimeInput(item.requiredMinutes)
        : "";

    row.innerHTML = `
      <div class="combo-subtask-code">
        <input
          type="text"
          data-field="countryCode"
          value="${escapeComboHtml(item.countryCode || "")}"
placeholder="e.g. DE-DE"
          autocomplete="off"
        />
      </div>

      <div class="combo-subtask-url">
        <input
          type="url"
          data-field="url"
          value="${escapeComboHtml(item.url || "")}"
          placeholder="https://..."
          autocomplete="off"
        />
      </div>

      ${
        isIndividual
          ? `
            <div class="combo-subtask-time">
              <input
                type="text"
                data-field="requiredMinutes"
                value="${escapeComboHtml(timeValue)}"
                placeholder="1h30m"
                autocomplete="off"
              />
            </div>
          `
          : ""
      }

      <div class="combo-subtask-action">
        <button
          type="button"
          class="combo-remove-subtask-btn"
          data-action="remove"
          title="Remove Subtask"
        >
          ×
        </button>
      </div>
    `;

    // Số thứ tự để dễ nhận biết
    row.dataset.index = index + 1;

    container.appendChild(row);
  });

  updateComboPreview();
}
function escapeComboHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

function addComboSubtask() {
  const current = parseComboSubtasks();

  current.push({
    countryCode: "",
    url: "",
    requiredMinutes: 0,
  });

  renderComboSubtasks(current);

  const cards = $("comboSubtasksList")?.querySelectorAll(".combo-subtask-card");

  const lastCard = cards?.[cards.length - 1];

  lastCard?.querySelector('[data-field="countryCode"]')?.focus();
}

function removeComboSubtask(button) {
  const card = button.closest(".combo-subtask-card");

  if (!card) return;

  const cards = Array.from(
    $("comboSubtasksList").querySelectorAll(".combo-subtask-card"),
  );

  if (cards.length <= 1) {
    notify("A Combo must have at least one Subtask.", "warning");
    return;
  }

  card.remove();

  // Cập nhật lại số thứ tự.
  $("comboSubtasksList")
    .querySelectorAll(".combo-subtask-card")
    .forEach((item, index) => {
      const label = item.querySelector(".combo-subtask-number");

      if (label) {
        label.textContent = `Subtask ${index + 1}`;
      }
    });

  updateComboPreview();
}
function updateComboPreview() {
  const clientId = $("comboClient")?.value || "";
  const type = $("comboType")?.value || "";
  const timeMode = $("comboTimeMode")?.value || "fixed";

  const minutesPerAsset = getFixedMinutesPerAsset(clientId, type);
  const subtasks = parseComboSubtasks();
  const linkedSubtasks = subtasks.filter(
    (item) => String(item.url || "").trim(),
  );
  const fixedPreview = $("comboFixedPreview");
  const subtaskPreview = $("comboSubtaskPreview");
  const helper = $("comboSubtasksHelper");

  const isIndividual = timeMode === "individual";

  if (helper) {
    helper.textContent = isIndividual
      ? "Enter Country Code, Email Link and Required Time for each Subtask."
      : "Enter Country Code and Email Link for each Subtask.";
  }

  if (isIndividual) {
    if (fixedPreview) {
      fixedPreview.textContent =
        "Individual Time: each Subtask has its own Required Time.";
    }

    const total = linkedSubtasks.reduce(
      (sum, item) => sum + (Number(item.requiredMinutes) || 0),
      0,
    );

    if (subtaskPreview) {
      subtaskPreview.textContent =
        `${linkedSubtasks.length}/${subtasks.length} linked subtasks · ` +
        `Total Required Time: ${formatDuration(total)}`;
    }

    return;
  }

  if (fixedPreview) {
    fixedPreview.textContent =
      clientId && type
        ? minutesPerAsset > 0
          ? `Fixed Time: ${formatDuration(minutesPerAsset)} per subtask`
          : "This Asset Type does not have Fixed Time configured."
        : "Select a client and asset type to see Fixed Time.";
  }

  if (subtaskPreview) {
    subtaskPreview.textContent =
      `${linkedSubtasks.length}/${subtasks.length} linked subtasks · ` +
      `Total Fixed Time: ${formatDuration(
        linkedSubtasks.length * minutesPerAsset,
      )}`;
  }
}

function openComboModal(comboId = "") {
  const form = $("comboForm");

  form?.reset();

  const combo = comboId
    ? state.combos.find((item) => item.id === comboId)
    : null;

  $("comboEditId").value = combo?.id || "";

  $("comboModalTitle").textContent = combo
    ? "Edit Main Ticket"
    : "Create Combo";

  $("createComboSubmitBtn").textContent = combo
    ? "Save Changes"
    : "Create Combo";

  $("comboName").value = combo?.name || "";
  $("comboMainUrl").value = combo?.mainUrl || "";
  $("comboDate").value = combo?.date || today();

  $("comboTimeMode").value = combo?.timeMode || "fixed";

  // Use the Default Client configured in Settings
  const selectedClientId = combo
    ? combo.clientId || ""
    : defaultTaskClientId || "";

  populateComboClients(selectedClientId);
  populateComboTypes(combo?.type || "");

    if (combo) {
    const savedSubtasks = state.tasks
      .filter((task) => task.comboId === combo.id)
      .map((task) => ({
        countryCode: task.countryCode || task.title || "",
        url: task.url || "",
        requiredMinutes: Number(task.requiredMinutes) || 0,
      }));

    // Giữ nguyên Subtask đã lưu, chỉ bổ sung các mã mặc định còn thiếu.
    const existingCodes = new Set(
      savedSubtasks.map((item) =>
        String(item.countryCode || "").toUpperCase(),
      ),
    );

    const missingDefaults = getDefaultComboSubtasks().filter(
      (item) => !existingCodes.has(item.countryCode),
    );

    renderComboSubtasks([
      ...savedSubtasks,
      ...missingDefaults,
    ]);
  } else {
    renderComboSubtasks(getDefaultComboSubtasks());
  }

  updateComboPreview();

  openModal("comboModal");
}

function populateComboClients(selectedClientId = "") {
  const select = $("comboClient");
  if (!select) return;

  select.innerHTML =
    `<option value="">Select client</option>` +
    state.clients
      .map(
        (client) => `
      <option value="${escapeHtml(client.id)}">
        ${escapeHtml(client.name)}
      </option>
    `,
      )
      .join("");

  select.value = selectedClientId;
}

function populateComboTypes(selectedType = "") {
  const clientId = $("comboClient")?.value || "";
  const select = $("comboType");
  if (!select) return;

  const types = getClientTypes(clientId);

  select.innerHTML =
    `<option value="">Select type</option>` +
    types
      .map(
        (type) => `
      <option value="${escapeHtml(type)}">
        ${escapeHtml(type)}
      </option>
    `,
      )
      .join("");

  if (selectedType && types.includes(selectedType)) {
    select.value = selectedType;
  }

  updateComboPreview();
}

function validateComboUrl(value, required = false) {
  const url = String(value || "").trim();

  if (!url) return !required;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
function validateComboSubtasks(subtasks) {
  const timeMode = $("comboTimeMode")?.value || "fixed";

  if (!subtasks.length) {
    return "Please enter at least one subtask.";
  }

  if (subtasks.length > 150) {
    return "A Combo can contain up to 150 subtasks.";
  }

  const seen = new Set();

  for (let i = 0; i < subtasks.length; i++) {
    const item = subtasks[i];
    const lineNumber = i + 1;

    if (
      !item.countryCode ||
      !/^[A-Z]{2,3}(?:-[A-Z]{2,3})?$/.test(item.countryCode)
    ) {
      return `Subtask ${lineNumber}: Use a valid code, e.g. DE-DE or CH-FR.`;
    }

    if (item.url && !validateComboUrl(item.url, true)) {
      return `Subtask ${lineNumber}: Please enter a valid HTTP/HTTPS link.`;
    }

    if (seen.has(item.countryCode)) {
      return `Duplicate Subtask code: ${item.countryCode}.`;
    }

    if (
      item.url &&
      timeMode === "individual" &&
      (!item.requiredMinutes || item.requiredMinutes <= 0)
    ) {
      return `Subtask ${lineNumber}: Please enter a valid Required Time, e.g. 1h30m.`;
    }

    seen.add(item.countryCode);
  }

  return "";
}

async function createComboSubtask({
  comboId,
  comboName,
  clientId,
  clientName,
  type,
  date,
  timeMode = "fixed",
  minutesPerAsset,
  item,
}) {
  const isIndividual = timeMode === "individual";
  const hasEmailLink = Boolean(String(item.url || "").trim());

  const effectiveRequiredMinutes =
    hasEmailLink && isIndividual
      ? Number(item.requiredMinutes) || 0
      : 0;

  const effectiveFixedMinutes =
    hasEmailLink && !isIndividual
      ? Number(minutesPerAsset) || 0
      : 0;
  const taskRef = await addDoc(collection(db, "tasks"), {
    title: item.countryCode,
    countryCode: item.countryCode,

    clientId,
    project: clientName,
    type,

    status: STATUS.OPEN,

    url: item.url,
    note: "",

    assetAmount: 1,

    // Individual Time must not be treated as Fixed Time.
    fixedMinutes: effectiveFixedMinutes,
    fixedDate: date,

    requiredMinutes: effectiveRequiredMinutes,
    comboId,
    comboName,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (hasEmailLink) {
    if (isIndividual) {
      await syncTaskRequiredWorkLog(
        taskRef.id,
        effectiveRequiredMinutes,
        date,
      );
    } else {
      await syncFixedWorkLog(
        taskRef.id,
        effectiveFixedMinutes,
        date,
      );
    }
  }
  await addDoc(collection(db, "activityLogs"), {
    taskId: taskRef.id,
    action: "task_created",
    metadata: {
      comboId,
      comboName,
      countryCode: item.countryCode,
      timeMode,
    },
    createdAt: serverTimestamp(),
  });

  return taskRef.id;
}

// Remove only automatically generated Fixed WorkLogs.
// Manually logged WorkLogs are preserved.
async function deleteComboFixedWorkLogs(taskId) {
  const entries = state.workSessions.filter(
    (item) =>
      item.source === "fixed" &&
      (item.fixedTaskId === taskId || item.taskId === taskId),
  );

  for (const item of entries) {
    await deleteDoc(doc(db, "workSessions", item.id));
  }
}

// Update fixed WorkLog without creating duplicate entries.
async function updateComboFixedWorkLog(taskId, minutes, date) {
  const entries = state.workSessions.filter(
    (item) => item.source === "fixed" && item.fixedTaskId === taskId,
  );

  if (!entries.length) {
    await syncFixedWorkLog(taskId, minutes, date);
    return;
  }

  const [primary, ...duplicates] = entries;

  await updateDoc(doc(db, "workSessions", primary.id), {
    taskId,
    date,
    duration: Number(minutes),
    updatedAt: serverTimestamp(),
  });

  for (const duplicate of duplicates) {
    await deleteDoc(doc(db, "workSessions", duplicate.id));
  }
}

// Permanently remove a Subtask and all of its related data.
async function deleteComboSubtask(taskId) {
  const workLogs = state.workSessions.filter((item) => item.taskId === taskId);

  const corrections = state.corrections.filter(
    (item) => item.taskId === taskId,
  );

  const activities = state.activities.filter((item) => item.taskId === taskId);

  for (const item of workLogs) {
    await deleteDoc(doc(db, "workSessions", item.id));
  }

  for (const item of corrections) {
    await deleteDoc(doc(db, "corrections", item.id));
  }

  for (const item of activities) {
    await deleteDoc(doc(db, "activityLogs", item.id));
  }

  await deleteDoc(doc(db, "tasks", taskId));
}

async function saveCombo(e) {
  e.preventDefault();

  const comboId = $("comboEditId").value.trim();

  const name = $("comboName").value.trim();
  const mainUrl = $("comboMainUrl").value.trim();
  const clientId = $("comboClient").value;
  const type = $("comboType").value;
  const date = $("comboDate").value;
  const timeMode = $("comboTimeMode")?.value || "fixed";
  const isIndividual = timeMode === "individual";

  const client = getClient(clientId);
  const minutesPerAsset = getFixedMinutesPerAsset(clientId, type);

  const subtasks = parseComboSubtasks();

  // Chỉ những dòng có Email Link mới được xem là Subtask thật.
  const linkedSubtasks = subtasks.filter(
    (item) => String(item.url || "").trim()
  );

  if (!name) {
    return notify("Please enter a Main Ticket name.", "warning");
  }

  if (!clientId || !client) {
    return notify("Please select a client.", "warning");
  }

  if (!type) {
    return notify("Please select an Asset Type.", "warning");
  }

  if (!date) {
    return notify("Please select a date.", "warning");
  }

  if (!validateComboUrl(mainUrl)) {
    return notify(
      "Main Ticket Link must be a valid HTTP/HTTPS link.",
      "warning"
    );
  }

  if (!isIndividual && linkedSubtasks.length > 0 && minutesPerAsset <= 0) {
    return notify(
      "This Asset Type does not have Fixed Time configured.",
      "warning"
    );
  }

  // Chỉ validate các dòng có Email Link.
  const validationError = validateComboSubtasks(linkedSubtasks);

  if (validationError) {
    return notify(validationError, "warning");
  }

  const isEditing = Boolean(comboId);

  const totalRequiredMinutes = isIndividual
    ? linkedSubtasks.reduce(
        (sum, item) => sum + (Number(item.requiredMinutes) || 0),
        0
      )
    : 0;

  const totalFixedMinutes = isIndividual
    ? 0
    : minutesPerAsset * linkedSubtasks.length;

  const totalMinutes = isIndividual
    ? totalRequiredMinutes
    : totalFixedMinutes;

  const totalLabel = isIndividual
    ? "Total Required Time"
    : "Total Fixed Time";

  confirmAction(
    isEditing ? "Save Combo Changes?" : "Create Combo?",
    isEditing
      ? `Update "${name}" and synchronize its ${linkedSubtasks.length} subtasks?`
      : `Create "${name}" with ${linkedSubtasks.length} subtasks? ${totalLabel}: ${formatDuration(totalMinutes)}.`,
    async () => {
      const button = $("createComboSubmitBtn");

      if (button) {
        button.disabled = true;
        button.textContent = isEditing ? "Saving..." : "Creating...";
      }

      try {
        const comboData = {
          name,
          mainUrl,
          clientId,
          clientName: client.name,
          type,
          date,
          timeMode,
          minutesPerAsset: isIndividual ? 0 : minutesPerAsset,
          ticketCount: linkedSubtasks.length,
          totalFixedMinutes,
          totalRequiredMinutes,
          updatedAt: serverTimestamp(),
        };

        if (!isEditing) {
          comboData.createdAt = serverTimestamp();

          const comboRef = await addDoc(
            collection(db, "combos"),
            comboData
          );

          // Chỉ tạo Task từ các dòng có Email Link.
          for (const item of linkedSubtasks) {
            await createComboSubtask({
              comboId: comboRef.id,
              comboName: name,
              clientId,
              clientName: client.name,
              type,
              date,
              minutesPerAsset,
              timeMode,
              item,
            });
          }

          expandedComboIds.delete(comboRef.id);

          notify(
            `Combo created successfully. ${linkedSubtasks.length} subtasks added.`,
            "success"
          );
        } else {
          const existingCombo = state.combos.find(
            (item) => item.id === comboId
          );

          if (!existingCombo) {
            throw new Error(
              "Combo not found. Please refresh and try again."
            );
          }

          const existingTasks = state.tasks.filter(
            (task) => task.comboId === comboId
          );

          const existingByCode = new Map(
            existingTasks.map((task) => [
              String(task.countryCode || task.title).toUpperCase(),
              task,
            ])
          );

          // Chỉ các Subtask còn Email Link mới được giữ lại.
          const incomingCodes = new Set(
            linkedSubtasks.map((item) => item.countryCode)
          );

          await updateDoc(doc(db, "combos", comboId), comboData);

          for (const item of linkedSubtasks) {
            const existingTask = existingByCode.get(item.countryCode);

            if (existingTask) {
              await updateDoc(doc(db, "tasks", existingTask.id), {
                title: item.countryCode,
                countryCode: item.countryCode,
                url: item.url,

                clientId,
                project: client.name,
                type,

                fixedMinutes: isIndividual ? 0 : minutesPerAsset,
                fixedDate: date,
                requiredMinutes: isIndividual
                  ? Number(item.requiredMinutes) || 0
                  : 0,

                comboName: name,
                comboId,

                updatedAt: serverTimestamp(),
              });

              if (isIndividual) {
                // Xóa Fixed WorkLog cũ.
                await deleteComboFixedWorkLogs(existingTask.id);

                // Tạo hoặc cập nhật Required WorkLog.
                await syncTaskRequiredWorkLog(
                  existingTask.id,
                  item.requiredMinutes,
                  date
                );
              } else {
                // Xóa Required WorkLog cũ nếu chuyển sang Fixed Time.
                await syncTaskRequiredWorkLog(
                  existingTask.id,
                  0,
                  date
                );

                // Tạo hoặc cập nhật Fixed WorkLog.
                await updateComboFixedWorkLog(
                  existingTask.id,
                  minutesPerAsset,
                  date
                );
              }

              await addDoc(collection(db, "activityLogs"), {
                taskId: existingTask.id,
                action: "task_edited",
                metadata: {
                  comboId,
                  comboName: name,
                  countryCode: item.countryCode,
                  timeMode,
                },
                createdAt: serverTimestamp(),
              });
            } else {
              // Subtask mới có Email Link.
              await createComboSubtask({
                comboId,
                comboName: name,
                clientId,
                clientName: client.name,
                type,
                date,
                minutesPerAsset,
                timeMode,
                item,
              });
            }
          }

          // Xóa các Subtask cũ đã bị xóa Email Link
          // hoặc không còn trong Combo.
          for (const oldTask of existingTasks) {
            const oldCode = String(
              oldTask.countryCode || oldTask.title
            ).toUpperCase();

            if (!incomingCodes.has(oldCode)) {
              await deleteComboSubtask(oldTask.id);
            }
          }

          notify(
            "Combo and Subtasks updated successfully.",
            "success"
          );
        }

        closeModal("comboModal");
        $("comboForm").reset();

        selectedTaskIds.clear();
        renderTasks();
        updateDashboard?.();
      } catch (err) {
        console.error("Save Combo failed:", err);
        notify(err.message || "Could not save Combo.", "error");
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = isEditing
            ? "Save Changes"
            : "Create Combo";
        }
      }
    },
    isEditing ? "Save Changes" : "Create Combo"
  );
}

// Delete the Main Ticket and every Subtask with its related records.
function deleteCombo(comboId) {
  const combo = state.combos.find((item) => item.id === comboId);
  if (!combo) return;

  const subtasks = state.tasks.filter((task) => task.comboId === comboId);

  confirmAction(
    "Delete entire Combo?",
    `Delete "${combo.name}" and all ${subtasks.length} Subtasks, WorkLogs, Corrections and Activity Logs? This cannot be undone.`,
    async () => {
      try {
        for (const task of subtasks) {
          await deleteComboSubtask(task.id);
        }

        await deleteDoc(doc(db, "combos", comboId));

        expandedComboIds.delete(comboId);
        selectedTaskIds.clear();

        notify("Combo and all Subtasks deleted.", "success");

        renderTasks();
        updateDashboard?.();
      } catch (err) {
        console.error("Delete Combo failed:", err);
        notify(err.message || "Could not delete Combo.", "error");
      }
    },
    "Delete Combo",
  );
}

async function copyComboLink(url) {
  if (!url) {
    return notify("No link available.", "warning");
  }

  try {
    await navigator.clipboard.writeText(url);
    notify("Link copied.");
  } catch (err) {
    console.error("Copy link failed:", err);
    notify("Could not copy link.", "error");
  }
}

async function syncTaskRequiredWorkLog(taskId, requiredMinutes) {
  if (!taskId) return;

  const task = getTask(taskId);
  if (!task) return;

  // Fixed Time được xử lý riêng
  if ((Number(task.fixedMinutes) || 0) > 0) return;

  const minutes = Math.max(0, Number(requiredMinutes) || 0);

  // Tìm WorkLog được tạo để lưu Required Time của Task
  const existing = state.workSessions.find(
    (x) => x.taskId === taskId && x.source === "task_required",
  );

  // Không có thời gian thì xóa bản ghi đồng bộ cũ
  if (minutes <= 0) {
    if (existing) {
      await deleteDoc(doc(db, "workSessions", existing.id));
    }
    return;
  }

  const data = {
    taskId,
    date: existing?.date || today(),
    duration: minutes,
    note: "Task Required Time",
    type: "normal",
    source: "task_required",
    updatedAt: serverTimestamp(),
  };

  if (existing) {
    await updateDoc(doc(db, "workSessions", existing.id), data);
  } else {
    await addDoc(collection(db, "workSessions"), {
      ...data,
      createdAt: serverTimestamp(),
    });
  }
}

async function saveTask(e) {
  e.preventDefault();

  const id = $("taskId").value.trim();

  const clientId = $("taskClient").value;
  const type = $("taskType").value;

  const client = getClient(clientId);

  if (!clientId || !client) {
    return notify("Please select a client.", "warning");
  }

  if (!type) {
    return notify("Please select a task type.", "warning");
  }

  const minutesPerAsset = getFixedMinutesPerAsset(clientId, type);

  const assetAmount =
    minutesPerAsset > 0
      ? Math.max(0, Number($("taskAssetAmount").value) || 0)
      : 0;

  const fixedMinutes =
    minutesPerAsset > 0 && assetAmount > 0 ? assetAmount * minutesPerAsset : 0;
  // Required Time is only available for normal tasks.
  const requiredMinutes =
    minutesPerAsset > 0
      ? 0
      : minutes($("taskRequiredHours").value, $("taskRequiredMinutes").value);
  const existingTask = id ? getTask(id) : null;

  const fixedDate =
    minutesPerAsset > 0 && fixedMinutes > 0
      ? existingTask?.fixedDate || today()
      : "";

  const data = {
    title: $("taskTitle").value.trim(),

    clientId,

    /*
     * Keep legacy project field.
     */
    project: client.name,

    type,

    status: $("taskStatus").value,

    url: $("taskUrl").value.trim(),

    note: $("taskNote").value.trim(),

    assetAmount,

    fixedMinutes,

    fixedDate,

    requiredMinutes,

    /*
     * IMPORTANT:
     *
     * Do NOT write loggedMinutes here.
     *
     * External Logged is managed ONLY
     * through the Logged button / modal.
     */

    updatedAt: serverTimestamp(),
  };

  if (!data.title) {
    return notify("Please enter a task title.", "warning");
  }

  if (minutesPerAsset > 0 && assetAmount <= 0) {
    return notify("Please enter the amount of assets.", "warning");
  }

  closeModal("taskModal");
  $("taskForm").reset();

  try {
    if (id) {
      await updateDoc(doc(db, "tasks", id), data);

      await syncFixedWorkLog(id, fixedMinutes, fixedDate);

      // Đồng bộ Normal Time trực tiếp vào Firestore WorkLogs
      if (fixedMinutes > 0) {
        // Chuyển sang Fixed Time thì xóa Normal Time đồng bộ cũ
        await syncTaskRequiredWorkLog(id, 0);
      } else {
        await syncTaskRequiredWorkLog(id, requiredMinutes);
      }

      await addActivity(id, "task_edited");

      notify("Task updated.");
    } else {
      data.createdAt = serverTimestamp();

      const ref = await addDoc(collection(db, "tasks"), data);

      await syncFixedWorkLog(ref.id, fixedMinutes, fixedDate);

      // Tạo WorkLog ngay khi tạo Task có Required Time
      if (fixedMinutes <= 0 && requiredMinutes > 0) {
        await syncTaskRequiredWorkLog(ref.id, requiredMinutes);
      }

      await addActivity(ref.id, "task_created");

      notify("Task created.");
    }
  } catch (err) {
    notify(err.message || "Could not save task.", "error");
  }
}
// async function saveTime(e) {
//   e.preventDefault();

//   const taskId = $("timeTaskId").value;
//   const entryId = $("timeEntryId").value.trim();

//   // const duration = minutes($("timeHours").value, $("timeMinutes").value);

//   // const date = $("timeDate").value;
//   // const note = $("timeNote").value.trim();

//   // if (!taskId || !date || duration <= 0) {
//   //   return notify("Enter a valid duration.", "warning");
//   // }

//  const duration = minutes(
//   $("timeHours").value,
//   $("timeMinutes").value,
// );

// const requiredMinutes = minutes(
//   $("timeRequiredHours").value,
//   $("timeRequiredMinutes").value,
// );

// const date = $("timeDate").value;
// const note = $("timeNote").value.trim();

// if (!taskId || !date || (duration <= 0 && requiredMinutes <= 0)) {
//   return notify("Enter Required time or Logged time.", "warning");
// }

//   try {
//     // const data = {
//     //   taskId,
//     //   date,
//     //   duration,
//     //   note,
//     //   type: "normal",
//     //   updatedAt: serverTimestamp(),
//     // };

//     const data = {
//   taskId,
//   date,
//   duration,
//   requiredMinutes,
//   note,
//   type: "normal",
//   updatedAt: serverTimestamp(),
// };

//     if (entryId) {
//       await updateDoc(doc(db, "workSessions", entryId), data);

//       await updateDoc(doc(db, "tasks", taskId), {
//         updatedAt: serverTimestamp(),
//       });

//       // await addActivity(taskId, "time_updated", {
//       //   duration,
//       //   date,
//       // });
//       await addActivity(taskId, "time_updated", {
//   duration,
//   requiredMinutes,
//   date,
// });

//       closeModal("timeModal");

//       notify("WorkLog updated.");
//       return;
//     }

//     data.createdAt = serverTimestamp();

//     await addDoc(collection(db, "workSessions"), data);

//     await updateDoc(doc(db, "tasks", taskId), {
//       updatedAt: serverTimestamp(),
//     });

//     // await addActivity(taskId, "time_added", {
//     //   duration,
//     //   date,
//     // });
//     await addActivity(taskId, "time_added", {
//   duration,
//   requiredMinutes,
//   date,
// });

//     closeModal("timeModal");

//     notify("WorkLog added.");
//   } catch (err) {
//     notify(err.message || "Could not save WorkLog.", "error");
//   }
// }
// async function saveTime(e) {
//   e.preventDefault();

//   const taskId =
//     $("timeTaskId").value;

//   const entryId =
//     $("timeEntryId").value.trim();

//   const requiredMinutes = minutes(
//     $("timeRequiredHours").value,
//     $("timeRequiredMinutes").value,
//   );

//   const date =
//     $("timeDate").value;

//   const note =
//     $("timeNote").value.trim();

//   if (!taskId || !date) {
//     return notify(
//       "Please enter a date.",
//       "warning",
//     );
//   }

//   if (requiredMinutes <= 0) {
//     return notify(
//       "Please enter Required time.",
//       "warning",
//     );
//   }

//   try {
//     // Required Time belongs to the task
//     await updateDoc(
//       doc(db, "tasks", taskId),
//       {
//         requiredMinutes,
//         updatedAt:
//           serverTimestamp(),
//       },
//     );

//     // WorkLog does NOT store duration anymore
//     const data = {
//       taskId,
//       date,
//       note,
//       type: "normal",
//       updatedAt:
//         serverTimestamp(),
//     };

//     // EDIT existing WorkLog
//     if (entryId) {
//       await updateDoc(
//         doc(
//           db,
//           "workSessions",
//           entryId,
//         ),
//         data,
//       );

//       await addActivity(
//         taskId,
//         "time_updated",
//         {
//           requiredMinutes,
//           date,
//         },
//       );

//       closeModal("timeModal");

//       notify("WorkLog updated.");
//       return;
//     }

//     // ADD new WorkLog
//     await addDoc(
//       collection(
//         db,
//         "workSessions",
//       ),
//       {
//         ...data,
//         createdAt:
//           serverTimestamp(),
//       },
//     );

//     await addActivity(
//       taskId,
//       "time_added",
//       {
//         requiredMinutes,
//         date,
//       },
//     );

//     closeModal("timeModal");

//     notify("WorkLog added.");
//   } catch (err) {
//     notify(
//       err.message ||
//         "Could not save WorkLog.",
//       "error",
//     );
//   }
// }

async function saveTime(e) {
  e.preventDefault();

  const taskId = $("timeTaskId").value;

  const entryId = $("timeEntryId").value.trim();

  const date = $("timeDate").value;

  const note = $("timeNote").value.trim();

  const task = getTask(taskId);

  if (!taskId || !date) {
    return notify("Please enter a date.", "warning");
  }

  if (!task) {
    return notify("Task not found.", "error");
  }

  /*
   * ========================================
   * FIXED TIME
   * ========================================
   *
   * Fixed Time only edits Worked date.
   * Do NOT touch:
   * - requiredMinutes
   * - duration
   * - loggedMinutes
   * - create another WorkLog
   */
  const isFixedTask = (Number(task.fixedMinutes) || 0) > 0;

  if (isFixedTask) {
    try {
      const fixedEntry = entryId
        ? state.workSessions.find((x) => x.id === entryId)
        : state.workSessions.find(
            (x) =>
              x.taskId === taskId &&
              x.source === "fixed" &&
              x.fixedTaskId === taskId,
          );

      // Task is the source of truth for Fixed Worked date
      await updateDoc(doc(db, "tasks", taskId), {
        fixedDate: date,
        updatedAt: serverTimestamp(),
      });

      if (fixedEntry) {
        // Only update the date.
        // Keep Fixed Time duration untouched.
        await updateDoc(doc(db, "workSessions", fixedEntry.id), {
          date,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Safety fallback in case the fixed shadow WorkLog
        // does not exist yet.
        await syncFixedWorkLog(taskId, Number(task.fixedMinutes) || 0, date);
      }

      await addActivity(taskId, "time_updated", {
        date,
      });

      closeModal("timeModal");

      notify("Fixed Time date updated.");

      return;
    } catch (err) {
      notify(err.message || "Could not update Fixed Time date.", "error");

      return;
    }
  }

  /*
   * ========================================
   * NORMAL TIME
   * ========================================
   */

  const requiredMinutes = minutes(
    $("timeRequiredHours").value,
    $("timeRequiredMinutes").value,
  );

  if (requiredMinutes <= 0) {
    return notify("Please enter Required time.", "warning");
  }

  try {
    // Required Time belongs to the task
    await updateDoc(doc(db, "tasks", taskId), {
      requiredMinutes,
      updatedAt: serverTimestamp(),
    });

    const data = {
      taskId,
      date,
      duration: requiredMinutes,
      note,
      type: "normal",
      updatedAt: serverTimestamp(),
    };

    // EDIT existing WorkLog
    if (entryId) {
      await updateDoc(doc(db, "workSessions", entryId), data);

      await addActivity(taskId, "time_updated", {
        requiredMinutes,
        date,
      });

      closeModal("timeModal");

      notify("WorkLog updated.");

      return;
    }

    // ADD new WorkLog
    await addDoc(collection(db, "workSessions"), {
      ...data,
      createdAt: serverTimestamp(),
    });

    await addActivity(taskId, "time_added", {
      duration: requiredMinutes,
      requiredMinutes,
      date,
    });

    closeModal("timeModal");

    notify("WorkLog added.");
  } catch (err) {
    notify(err.message || "Could not save WorkLog.", "error");
  }
}

async function deleteWorkLog(entryId) {
  const entry = state.workSessions.find((x) => x.id === entryId);

  if (!entry) return;

  const task = getTask(entry.taskId);

  confirmAction(
    "Delete WorkLog?",
    `Delete ${formatDuration(entry.duration)} from "${task?.title || "this task"}"? This cannot be undone.`,
    "",
    "Delete",
  );

  state.pendingConfirm = async () => {
    try {
      await deleteDoc(doc(db, "workSessions", entryId));

      if (task) {
        await updateDoc(doc(db, "tasks", entry.taskId), {
          updatedAt: serverTimestamp(),
        });

        await addActivity(entry.taskId, "time_deleted", {
          duration: entry.duration,
          date: entry.date,
        });
      }

      notify("WorkLog deleted.");
    } catch (err) {
      notify(err.message || "Could not delete WorkLog.", "error");
    }
  };
}

async function deleteCorrection(entryId) {
  const entry = state.corrections.find((x) => x.id === entryId);

  if (!entry) return;

  const task = getTask(entry.taskId);

  confirmAction(
    "Delete Correction?",
    `Delete ${formatDuration(entry.duration)} from "${task?.title || "this task"}"? This cannot be undone.`,
    "",
    "Delete",
  );

  state.pendingConfirm = async () => {
    try {
      await deleteDoc(doc(db, "corrections", entryId));

      await addActivity(entry.taskId, "correction_deleted", {
        duration: entry.duration,
        date: entry.date,
        reason: entry.reason || "other",
      });

      notify("Correction deleted.");
    } catch (err) {
      notify(err.message || "Could not delete correction.", "error");
    }
  };
}

async function saveCorrection(e) {
  e.preventDefault();

  const taskId = $("correctionTaskId").value;

  const entryId = $("correctionEntryId").value.trim();

  const duration = minutes(
    $("correctionHours").value,
    $("correctionMinutes").value,
  );

  const date = $("correctionDate").value;

  const note = $("correctionNote").value.trim();

  const reason =
    document.querySelector('input[name="correctionReason"]:checked')?.value ||
    "other";

  if (!taskId || !date || duration <= 0) {
    return notify("Enter a duration.", "warning");
  }

  try {
    if (entryId) {
      await updateDoc(doc(db, "corrections", entryId), {
        date,
        duration,
        note,
        reason,
        type: "correction",
        updatedAt: serverTimestamp(),
      });

      await addActivity(taskId, "correction_updated", {
        duration,
        date,
        reason,
      });

      closeModal("correctionModal");

      notify("Correction updated.");

      return;
    }

    await addDoc(collection(db, "corrections"), {
      taskId,
      date,
      duration,
      note,
      reason,
      type: "correction",
      createdAt: serverTimestamp(),
    });

    await addActivity(taskId, "correction_added", {
      duration,
      date,
      reason,
    });

    closeModal("correctionModal");

    notify("Correction saved.");
  } catch (err) {
    notify(err.message || "Could not save correction.", "error");
  }
}
// function nextStatus(current) {
//   const order = [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.WAITING, STATUS.COMPLETED];
//   const i = order.indexOf(current);
//   return order[i < 0 ? 0 : (i + 1) % order.length];
// }
// async function changeStatus(id) {
//   const t = getTask(id);
//   if (!t) return;
//   const to = t.status === STATUS.COMPLETED ? STATUS.OPEN : nextStatus(t.status);
//   try {
//     await updateDoc(doc(db, "tasks", id), {
//       status: to,
//       updatedAt: serverTimestamp(),
//     });
//     await addActivity(id, "status_changed", { from: t.status, to });
//     notify(`Status → ${STATUS_META[to].label}`);
//   } catch (err) {
//     notify(err.message || "Could not change status.", "error");
//   }
// }

function nextStatus(current) {
  const order = [
    STATUS.OPEN,
    STATUS.IN_PRODUCTION,
    STATUS.IN_APPROVAL,
    STATUS.EXECUTION_PROOF,
    STATUS.COMPLETED,
  ];

  const i = order.indexOf(current);

  return order[i < 0 ? 0 : (i + 1) % order.length];
}

async function changeStatus(id) {
  const t = getTask(id);
  if (!t) return;

  const to = t.status === STATUS.COMPLETED ? STATUS.OPEN : nextStatus(t.status);

  try {
    await updateDoc(doc(db, "tasks", id), {
      status: to,
      updatedAt: serverTimestamp(),
    });

    await addActivity(id, "status_changed", {
      from: t.status,
      to,
    });

    notify(`Status → ${STATUS_META[to].label}`);
  } catch (err) {
    notify(err.message || "Could not change status.", "error");
  }
}
function confirmAction(title, message, fn, button = "Confirm") {
  state.pendingConfirm = fn;
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  $("confirmOkBtn").textContent = button;
  openModal("confirmModal");
}
async function archiveTask(id) {
  const t = getTask(id);
  if (!t) return;
  confirmAction(
    "Archive task?",
    `"${t.title}" will leave the active task list, but all time logs, corrections, reports, and history will remain.`,
    "",
  );
  state.pendingConfirm = async () => {
    await updateDoc(doc(db, "tasks", id), {
      status: STATUS.ARCHIVED,
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addActivity(id, "task_archived");
    notify("Task archived.");
  };
}
async function deleteTask(id) {
  const t = getTask(id);
  if (!t) return;

  confirmAction(
    "Delete task?",
    `"${t.title}" and all related WorkLogs, corrections, and history will be permanently deleted.`,
    "",
    "Delete",
  );

  state.pendingConfirm = async () => {
    try {
      // Delete all WorkLog entries for this task
      const taskWorkSessions = state.workSessions.filter(
        (x) => x.taskId === id,
      );

      for (const entry of taskWorkSessions) {
        await deleteDoc(doc(db, "workSessions", entry.id));
      }

      // Delete all corrections for this task
      const taskCorrections = state.corrections.filter((x) => x.taskId === id);

      for (const entry of taskCorrections) {
        await deleteDoc(doc(db, "corrections", entry.id));
      }

      // Delete all activity/history entries for this task
      const taskActivities = state.activities.filter((x) => x.taskId === id);

      for (const entry of taskActivities) {
        await deleteDoc(doc(db, "activities", entry.id));
      }

      // Finally delete the task itself
      await deleteDoc(doc(db, "tasks", id));

      notify("Task deleted.");

      renderTasks();
      updateDashboard?.();
    } catch (err) {
      notify(err.message || "Could not delete task.", "error");
    }
  };
}
async function unarchiveTask(id) {
  await updateDoc(doc(db, "tasks", id), {
    status: STATUS.OPEN,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });
  await addActivity(id, "task_unarchived");
  notify("Task unarchived.");
}
async function clearAll() {
  confirmAction(
    "Clear all WorkLog data?",
    "This permanently deletes tasks, time logs, corrections, and activity history.",
    "",
    "Clear All",
  );
  state.pendingConfirm = async () => {
    for (const name of [
      "tasks",
      "combos",
      "workSessions",
      "corrections",
      "activityLogs",
      "workDays",
    ]) {
      const snap = await getDocs(collection(db, name));
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    notify("All WorkLog data cleared.", "success");
  };
}

function reportEntries() {
  const from = $("reportFrom").value;

  const to = $("reportTo").value;

  const project = $("reportProject").value;

  return [
    ...state.workSessions.map((x) => ({
      ...x,
      kind: "normal",
    })),

    ...state.corrections.map((x) => ({
      ...x,
      kind: "correction",
    })),
  ].filter((e) => {
    const t = getTask(e.taskId);

    if (!t) return false;

    return (
      (!from || e.date >= from) &&
      (!to || e.date <= to) &&
      (project === "all" || t.project === project)
    );
  });
}
function renderBars(target, map) {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
  $(target).innerHTML = rows.length
    ? rows
        .map(
          ([name, val]) =>
            `<div class="breakdown-row"><div><span>${escapeHtml(name)}</span><strong>${formatDuration(val)}</strong></div><div class="bar"><i style="width:${Math.max(3, Math.round((val / (rows[0]?.[1] || 1)) * 100))}%"></i></div></div>`,
        )
        .join("")
    : `<div class="empty-small">No data for this period.</div>`;
}

function firstWorkLogDate(taskId) {
  const logs = state.workSessions
    .filter((x) => x.taskId === taskId && x.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const first = logs[0];

  return first?.date || "";
}

function renderReport() {
  const entries = reportEntries();

  /*
   * =========================================================
   * REPORT SUMMARY
   *
   * Normal Time:
   *   - Normal task -> task.requiredMinutes
   *   - Fixed task  -> task.fixedMinutes
   *
   * Correction Time:
   *   - Sum correction.duration
   *
   * Total:
   *   - Normal + Correction
   *
   * Logged:
   *   - task.loggedMinutes
   *
   * Remaining:
   *   - Total - Logged
   *
   * IMPORTANT:
   * WorkLog entries no longer store duration/requiredMinutes.
   * Required Time belongs to the task.
   * =========================================================
   */

  const reportTaskIds = new Set();

  for (const e of entries) {
    if (e.taskId) {
      reportTaskIds.add(e.taskId);
    }
  }

  /*
   * Calculate Normal Time once per task.
   * Do NOT sum per WorkLog entry because one task can have
   * multiple WorkLog records.
   */
  const normalTime = [...reportTaskIds].reduce((sum, taskId) => {
    const task = getTask(taskId);

    if (!task) {
      return sum;
    }

    const fixedMinutes = Number(task.fixedMinutes) || 0;

    const requiredMinutes = Number(task.requiredMinutes) || 0;

    /*
     * Fixed task:
     *   Normal = Fixed Time
     *
     * Normal task:
     *   Normal = Required Time
     */
    const normalMinutes = fixedMinutes > 0 ? fixedMinutes : requiredMinutes;

    return sum + normalMinutes;
  }, 0);

  /*
   * Correction is still stored per correction entry.
   */
  const correctionTime = entries
    .filter((x) => x.kind === "correction")
    .reduce((sum, x) => sum + (Number(x.duration) || 0), 0);

  const totalTime = normalTime + correctionTime;

  /*
   * Logged Time comes only from the external Logged value
   * stored on each task.
   */
  const loggedTime = [...reportTaskIds].reduce((sum, taskId) => {
    const task = getTask(taskId);

    return sum + (Number(task?.loggedMinutes) || 0);
  }, 0);

  const remainingTime = Math.max(0, totalTime - loggedTime);

  $("reportNormalTime").textContent = formatDuration(normalTime);

  $("reportCorrectionTime").textContent = formatDuration(correctionTime);

  $("reportTotalTime").textContent = formatDuration(totalTime);

  $("reportLoggedTime").textContent = formatDuration(loggedTime);

  $("reportRemainingTime").textContent = formatDuration(remainingTime);

  /*
   * =========================================================
   * BREAKDOWNS
   * =========================================================
   */

  const byP = new Map();
  const byT = new Map();

  const rows = new Map();

  for (const e of entries) {
    const task = getTask(e.taskId);

    if (!task) continue;

    const project = task.project?.trim() || "No project";

    const type = task.type?.trim() || "Other";

    /*
     * Project breakdown:
     * Normal entry itself has no duration anymore.
     * Therefore use task required time for normal entries,
     * but only once per task.
     *
     * Correction still uses its duration.
     */
    let projectMap = byP.get(project);

    if (!projectMap) {
      projectMap = {
        normal: 0,
        correction: 0,
        taskIds: new Set(),
      };

      byP.set(project, projectMap);
    }

    if (!projectMap.taskIds.has(e.taskId)) {
      projectMap.taskIds.add(e.taskId);

      const fixedMinutes = Number(task.fixedMinutes) || 0;

      const requiredMinutes = Number(task.requiredMinutes) || 0;

      projectMap.normal += fixedMinutes > 0 ? fixedMinutes : requiredMinutes;
    }

    if (e.kind === "correction") {
      projectMap.correction += Number(e.duration) || 0;
    }

    /*
     * Type breakdown
     */
    const existingType = byT.get(type) || {
      newTime: 0,
      newAssets: 0,
      correctionTime: 0,
      correctionAssets: 0,

      newTaskIds: new Set(),
      correctionTaskIds: new Set(),

      totalTime: 0,
      loggedTime: 0,
      totalAssets: 0,
      taskIds: new Set(),
    };

    const assetAmount = Number(task.assetAmount) || 1;

    if (e.kind === "normal") {
      if (!existingType.newTaskIds.has(e.taskId)) {
        const fixedMinutes = Number(task.fixedMinutes) || 0;

        const requiredMinutes = Number(task.requiredMinutes) || 0;

        existingType.newTime +=
          fixedMinutes > 0 ? fixedMinutes : requiredMinutes;

        existingType.newAssets += assetAmount;

        existingType.newTaskIds.add(e.taskId);
      }
    }

    if (e.kind === "correction") {
      existingType.correctionTime += Number(e.duration) || 0;

      if (!existingType.correctionTaskIds.has(e.taskId)) {
        existingType.correctionAssets += assetAmount;

        existingType.correctionTaskIds.add(e.taskId);
      }
    }

    if (!existingType.taskIds.has(e.taskId)) {
      existingType.taskIds.add(e.taskId);

      const fixedMinutes = Number(task.fixedMinutes) || 0;

      const requiredMinutes = Number(task.requiredMinutes) || 0;

      existingType.totalTime +=
        fixedMinutes > 0 ? fixedMinutes : requiredMinutes;

      existingType.loggedTime += Number(task.loggedMinutes) || 0;

      existingType.totalAssets += assetAmount;
    }

    byT.set(type, existingType);

    /*
     * =======================================================
     * TABLE ROW
     * =======================================================
     */

    const key = e.taskId;

    let row = rows.get(key);

    if (!row) {
      row = {
        date: e.date || "",
        taskId: e.taskId,
        task,
        normal: 0,
        correction: 0,
      };

      rows.set(key, row);
    }

    /*
     * Normal WorkLog no longer has duration.
     * The row Normal value comes from task.requiredMinutes.
     */
    const fixedMinutes = Number(task.fixedMinutes) || 0;

    const requiredMinutes = Number(task.requiredMinutes) || 0;

    row.normal = fixedMinutes > 0 ? fixedMinutes : requiredMinutes;

    /*
     * Correction still comes from entries.
     */
    if (e.kind === "correction") {
      row.correction += Number(e.duration) || 0;
    }
  }

  /*
   * Convert project breakdown to total values
   * expected by renderBars().
   */
  const projectTotals = new Map();

  for (const [project, data] of byP.entries()) {
    projectTotals.set(project, data.normal + data.correction);
  }

  renderBars("reportByProject", projectTotals);

  renderTypeBreakdown(byT);

  /*
   * =========================================================
   * SORT TABLE
   * =========================================================
   */

  const tableRows = [...rows.values()].sort((a, b) => {
    const getStatusPriority = (row) => {
      const fixedMinutes = Number(row.task.fixedMinutes) || 0;

      const requiredMinutes = Number(row.task.requiredMinutes) || 0;

      const taskNormal = fixedMinutes > 0 ? fixedMinutes : requiredMinutes;

      const taskCorrection = Number(row.correction) || 0;

      const taskRequired = taskNormal + taskCorrection;

      const taskLogged = Number(row.task.loggedMinutes) || 0;

      if (taskRequired <= 0) {
        return 3;
      }

      if (taskLogged <= 0) {
        return 0;
      }

      if (taskLogged < taskRequired) {
        return 1;
      }

      return 2;
    };

    const statusCompare = getStatusPriority(a) - getStatusPriority(b);

    if (statusCompare !== 0) {
      return statusCompare;
    }

    const dateCompare = String(b.date).localeCompare(String(a.date));

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return String(a.task.title || "").localeCompare(String(b.task.title || ""));
  });

  /*
   * =========================================================
   * TABLE HTML
   * =========================================================
   */

  $("reportTableBody").innerHTML =
    tableRows
      .map((row) => {
        const fixedMinutes = Number(row.task.fixedMinutes) || 0;

        const requiredMinutes = Number(row.task.requiredMinutes) || 0;

        const taskNormal = fixedMinutes > 0 ? fixedMinutes : requiredMinutes;

        const taskCorrection = Number(row.correction) || 0;

        const taskTotal = taskNormal + taskCorrection;

        const taskLogged = Number(row.task.loggedMinutes) || 0;

        const taskRemaining = Math.max(0, taskTotal - taskLogged);

        let rowClass = "";
        let statusLabel = "";

        if (taskTotal <= 0) {
          rowClass = "task-log-missing";

          statusLabel = "NO PLAN";
        } else if (taskLogged <= 0) {
          rowClass = "task-log-missing";

          statusLabel = "NOT LOGGED";
        } else if (taskLogged < taskTotal) {
          rowClass = "task-log-incomplete";

          statusLabel = "INCOMPLETE";
        } else {
          statusLabel = "LOGGED";
        }

        // console.log(
        //   "REPORT TASK CHECK:",
        //   {
        //     task:
        //       row.task.title,

        //     fixedMinutes,

        //     requiredMinutes,

        //     normal:
        //       taskNormal,

        //     correction:
        //       taskCorrection,

        //     total:
        //       taskTotal,

        //     logged:
        //       taskLogged,

        //     remaining:
        //       taskRemaining,

        //     status:
        //       statusLabel,
        //   },
        // );

        return `
          <tr class="${rowClass}">

            <td>
              ${escapeHtml(dateLabel(row.date))}
            </td>

            <td>
              <strong>
                ${escapeHtml(row.task.title || "Untitled task")}
              </strong>
            </td>

            <td>
              ${escapeHtml(row.task.project || "No project")}
            </td>

            <td>
              ${escapeHtml(row.task.type || "Other")}
            </td>

            <td>
              ${formatDuration(taskNormal)}
            </td>

            <td>
              ${formatDuration(taskCorrection)}
            </td>

            <td>
              <strong>
                ${formatDuration(taskTotal)}
              </strong>
            </td>

            <td>
              ${formatDuration(taskLogged)}
            </td>

            <td>
              <strong>
                ${formatDuration(taskRemaining)}
              </strong>
            </td>

            <td>
              <span class="task-log-status">
                ${statusLabel}
              </span>
            </td>

          </tr>
        `;
      })
      .join("") ||
    `
      <tr>
        <td
          colspan="10"
          class="table-empty"
        >
          No entries for this period.
        </td>
      </tr>
    `;
}
// function renderReport() {
//   const entries = reportEntries();

//   const nm = entries.filter((x) => x.kind === "normal").reduce((s, x) => s + x.duration, 0);

//   const cm = entries.filter((x) => x.kind === "correction").reduce((s, x) => s + x.duration, 0);

//   const total = nm + cm;

//   const reportTaskIds = new Set();

//   for (const e of entries) {
//     if (e.taskId) {
//       reportTaskIds.add(e.taskId);
//     }
//   }

//   const loggedTime = [...reportTaskIds].reduce((sum, taskId) => {
//     const task = getTask(taskId);

//     return sum + (Number(task?.loggedMinutes) || 0);
//   }, 0);

//   const remainingTime = total - loggedTime;

//   $("reportNormalTime").textContent = formatDuration(nm);

//   $("reportCorrectionTime").textContent = formatDuration(cm);

//   $("reportTotalTime").textContent = formatDuration(total);

//   $("reportLoggedTime").textContent = formatDuration(loggedTime);

//   $("reportRemainingTime").textContent = formatDuration(Math.max(0, remainingTime));

//   const byP = new Map();
//   const byT = new Map();

//   const rows = new Map();

//   for (const e of entries) {
//     const task = getTask(e.taskId);

//     if (!task) continue;

//     const project = task.project?.trim() || "No project";
//     const type = task.type?.trim() || "Other";

//     byP.set(project, (byP.get(project) || 0) + e.duration);

//     const existingType = byT.get(type) || {
//       newTime: 0,
//       newAssets: 0,
//       correctionTime: 0,
//       correctionAssets: 0,

//       newTaskIds: new Set(),
//       correctionTaskIds: new Set(),

//       totalTime: 0,
//       loggedTime: 0,
//       totalAssets: 0,
//       taskIds: new Set(),
//     };

//     const assetAmount = Number(task.assetAmount) || 1;

//     if (e.kind === "normal") {
//       existingType.newTime += Number(e.duration) || 0;

//       if (!existingType.newTaskIds.has(e.taskId)) {
//         existingType.newAssets += assetAmount;
//         existingType.newTaskIds.add(e.taskId);
//       }
//     }

//     if (e.kind === "correction") {
//       existingType.correctionTime += Number(e.duration) || 0;

//       if (!existingType.correctionTaskIds.has(e.taskId)) {
//         existingType.correctionAssets += assetAmount;
//         existingType.correctionTaskIds.add(e.taskId);
//       }
//     }

//     if (!existingType.taskIds.has(e.taskId)) {
//       existingType.taskIds.add(e.taskId);

//       existingType.totalTime += Number(task.fixedMinutes) || 0;

//       existingType.loggedTime += Number(task.loggedMinutes) || 0;

//       existingType.totalAssets += assetAmount;
//     }

//     byT.set(type, existingType);

//     const key = e.taskId;

//     let row = rows.get(key);

//     if (!row) {
//   row = {
//     date: e.date || "",
//     taskId: e.taskId,
//     task,
//     normal: 0,
//     correction: 0,
//   };

//   rows.set(key, row);
// }

//     if (e.kind === "normal") {
//       row.normal += e.duration;
//     }

//     if (e.kind === "correction") {
//       row.correction += e.duration;
//     }
//   }

//   renderBars("reportByProject", byP);
//   renderTypeBreakdown(byT);

//   const tableRows = [...rows.values()].sort((a, b) => {
//     const getStatusPriority = (row) => {
//       const taskTotal = Number(row.task.fixedMinutes) || 0;

//       const taskCorrection = Number(row.correction) || 0;

//       const taskRequired = taskTotal + taskCorrection;

//       const taskLogged = Number(row.task.loggedMinutes) || 0;

//       if (taskRequired <= 0) {
//         return 3;
//       }

//       if (taskLogged <= 0) {
//         return 0;
//       }

//       if (taskLogged < taskRequired) {
//         return 1;
//       }

//       return 2;
//     };

//     const statusCompare = getStatusPriority(a) - getStatusPriority(b);

//     if (statusCompare !== 0) {
//       return statusCompare;
//     }

//     const dateCompare = String(b.date).localeCompare(String(a.date));

//     if (dateCompare !== 0) {
//       return dateCompare;
//     }

//     return String(a.task.title || "").localeCompare(String(b.task.title || ""));
//   });

//   $("reportTableBody").innerHTML =
//     tableRows
//       .map((row) => {
//         const taskTotal = Number(row.task.fixedMinutes) || 0;

//         const taskCorrection = Number(row.correction) || 0;

//         const taskRequired = taskTotal + taskCorrection;

//         const taskLogged = Number(row.task.loggedMinutes) || 0;

//         const taskRemaining = Math.max(0, taskRequired - taskLogged);

//         let rowClass = "";
//         let statusLabel = "";

//         if (taskRequired <= 0) {
//           rowClass = "task-log-missing";
//           statusLabel = "NO PLAN";
//         } else if (taskLogged <= 0) {
//           rowClass = "task-log-missing";
//           statusLabel = "NOT LOGGED";
//         } else if (taskLogged < taskRequired) {
//           rowClass = "task-log-incomplete";
//           statusLabel = "INCOMPLETE";
//         } else {
//           statusLabel = "COMPLETE";
//         }

//         console.log("REPORT TASK CHECK:", {
//           task: row.task.title,
//           fixedMinutes: taskTotal,
//           correction: taskCorrection,
//           required: taskRequired,
//           logged: taskLogged,
//           remaining: taskRemaining,
//           status: statusLabel,
//         });

//         return `
//           <tr class="${rowClass}">

//             <td>
//               ${escapeHtml(dateLabel(row.date))}
//             </td>

//             <td>
//               <strong>
//                 ${escapeHtml(row.task.title || "Untitled task")}
//               </strong>
//             </td>

//             <td>
//               ${escapeHtml(row.task.project || "No project")}
//             </td>

//             <td>
//               ${escapeHtml(row.task.type || "Other")}
//             </td>

//             <td>
//               ${formatDuration(row.normal)}
//             </td>

//             <td>
//               ${formatDuration(row.correction)}
//             </td>

//             <td>
//               <strong>
//                 ${formatDuration(taskTotal)}
//               </strong>
//             </td>

//             <td>
//   ${formatDuration(taskLogged)}
//             </td>

//             <td>
//               <strong>
//                 ${formatDuration(taskRemaining)}
//               </strong>
//             </td>

//             <td>
//               <span class="task-log-status">
//                 ${statusLabel}
//               </span>
//             </td>

//           </tr>
//         `;
//       })
//       .join("") ||
//     `
//       <tr>
//         <td colspan="10" class="table-empty">
//           No entries for this period.
//         </td>
//       </tr>
//     `;
// }

function renderTypeBreakdown(typeMap) {
  const rows = [...typeMap.entries()].sort(
    (a, b) =>
      b[1].newTime + b[1].correctionTime - (a[1].newTime + a[1].correctionTime),
  );

  $("reportByType").innerHTML = rows.length
    ? rows
        .map(([name, data]) => {
          const totalTime = data.newTime + data.correctionTime;

          const maxTime =
            (rows[0]?.[1]?.newTime || 0) +
              (rows[0]?.[1]?.correctionTime || 0) || 1;

          const width = Math.max(3, Math.round((totalTime / maxTime) * 100));

          const typeLoggedTime = Number(data.loggedTime) || 0;

          const typeRemainingTime = Math.max(0, totalTime - typeLoggedTime);
          return `
            <div class="breakdown-row type-breakdown-row">

              <div class="type-breakdown-header">
                <span>${escapeHtml(name)}</span>

                <strong>
                  ${formatDuration(totalTime)}
                </strong>
              </div>

              <div class="type-breakdown-details">

                ${
                  data.newAssets > 0 || data.newTime > 0
                    ? `
                      <div class="type-breakdown-section">
                        <div class="type-breakdown-label">
                          NEW
                        </div>

                        <div class="type-breakdown-value">
                          ${data.newAssets} assets
                        </div>

                        <strong>
                          ${formatDuration(data.newTime)}
                        </strong>
                      </div>
                    `
                    : ""
                }

                ${
                  data.correctionAssets > 0 || data.correctionTime > 0
                    ? `
                      <div class="type-breakdown-section correction">
                        <div class="type-breakdown-label">
                          CORRECTION
                        </div>

                        <div class="type-breakdown-value">
                          ${data.correctionAssets} assets
                        </div>

                        <strong>
                          ${formatDuration(data.correctionTime)}
                        </strong>
                      </div>
                    `
                    : ""
                }

                <div class="type-breakdown-total">
                  <span>TOTAL</span>

                  <strong>
                    ${formatDuration(totalTime)}
                  </strong>
                </div>

                <!-- NEW: logged time for this Type -->
                <div class="type-breakdown-total">
                  <span>LOGGED</span>

                  <strong>
                    ${formatDuration(typeLoggedTime)}
                  </strong>
                </div>

                <!-- NEW: remaining time for this Type -->
                <div class="type-breakdown-total">
                  <span>REMAINING</span>

                  <strong>
                    ${formatDuration(typeRemainingTime)}
                  </strong>
                </div>

              </div>

              <div class="bar">
                <i style="width:${width}%"></i>
              </div>

            </div>
          `;
        })
        .join("")
    : `<div class="empty-small">No data for this period.</div>`;
}

const REPORT_DATE_STORAGE_KEY = "worklog-report-date-range";
function initReportDates() {
  const fromInput = $("reportFrom");
  const toInput = $("reportTo");

  if (!fromInput || !toInput) return;

  // Luôn tự động chọn tuần hiện tại: Monday - Sunday
  const currentWeekFrom = getMonday(today());
  const currentWeekTo = getSunday(today());

  fromInput.value = currentWeekFrom;
  toInput.value = currentWeekTo;

  // Cập nhật khoảng tuần mới vào localStorage
  saveReportDates();

  console.log("[Reports] Current week:", {
    from: currentWeekFrom,
    to: currentWeekTo,
  });
}

function saveReportDates() {
  const from = $("reportFrom")?.value || "";
  const to = $("reportTo")?.value || "";

  if (!from || !to || from > to) return;

  localStorage.setItem(
    REPORT_DATE_STORAGE_KEY,
    JSON.stringify({
      from,
      to,
    }),
  );
}

function populateProjects() {
  const projects = [
    ...new Set(state.tasks.map((t) => t.project).filter(Boolean)),
  ].sort();
  const current = $("reportProject").value || "all";
  $("reportProject").innerHTML =
    `<option value="all">All projects</option>` +
    projects
      .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
      .join("");
  $("reportProject").value = projects.includes(current) ? current : "all";
}

function generateSummary() {
  const d = today();

  const entries = [
    ...state.workSessions.map((x) => ({
      ...x,
      kind: "normal",
    })),

    ...state.corrections.map((x) => ({
      ...x,
      kind: "correction",
    })),
  ].filter((x) => x.date === d && getTask(x.taskId));

  const total = entries.reduce((s, x) => s + (Number(x.duration) || 0), 0);

  const corrections = entries.filter((x) => x.kind === "correction").length;

  const ids = [...new Set(entries.map((x) => x.taskId))];

  const grouped = ids
    .map((id) => ({
      task: getTask(id),

      mins: entries
        .filter((x) => x.taskId === id)
        .reduce((s, x) => s + (Number(x.duration) || 0), 0),
    }))
    .sort((a, b) => b.mins - a.mins);

  const completed = state.tasks
    .filter((t) => t.status === STATUS.COMPLETED && ids.includes(t.id))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

  const active = state.tasks
    .filter(
      (t) =>
        ids.includes(t.id) &&
        t.status !== STATUS.COMPLETED &&
        t.status !== STATUS.ARCHIVED,
    )
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

  const lines = [
    dateLabel(d),
    "",
    `Worked: ${formatDuration(total)}`,
    `Tasks: ${ids.length}`,
    `Corrections: ${corrections}`,
    "",
    "Main work:",
    ...grouped
      .slice(0, 6)
      .map((x) => `• ${x.task.title} — ${formatDuration(x.mins)}`),
    "",
    "Completed:",
    ...(completed.length
      ? completed.map((t) => `✓ ${t.title}`)
      : ["• None recorded today"]),
    "",
    "Open:",
    ...(active.length ? active.map((t) => `• ${t.title}`) : ["• None"]),
  ];

  $("summaryModalSubtitle").textContent =
    `${dateLabel(d)} · ${formatDuration(total)}`;

  $("summaryText").value = lines.join("\n");

  openModal("summaryModal");
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText($("summaryText").value);
    notify("Summary copied.");
  } catch {
    $("summaryText").select();
    document.execCommand("copy");
    notify("Summary copied.");
  }
}

function hasAppLockPassword() {
  return Boolean(appLockPasswordHash);
}

function renderAppLockSettings() {
  const status = $("appLockStatus");

  const button = $("appLockPasswordBtn");

  if (!status || !button) {
    return;
  }

  if (hasAppLockPassword()) {
    status.textContent = "Password is set.";

    button.textContent = "Change Password";
  } else {
    status.textContent = "No password is set.";

    button.textContent = "Set Password";
  }
}

function openAppLockPasswordModal() {
  const modal = $("appLockPasswordModal");

  if (!modal) {
    return;
  }

  const title = $("appLockPasswordTitle");

  const description = $("appLockPasswordDescription");

  const newPassword = $("appLockNewPassword");

  const confirmPassword = $("appLockConfirmPassword");

  const error = $("appLockPasswordError");

  if (hasAppLockPassword()) {
    title.textContent = "Change Password";

    description.textContent = "Enter a new password for WorkLog.";
  } else {
    title.textContent = "Set Password";

    description.textContent = "Create a password to protect WorkLog.";
  }

  if (newPassword) {
    newPassword.value = "";
  }

  if (confirmPassword) {
    confirmPassword.value = "";
  }

  error?.classList.add("hidden");

  if (error) {
    error.textContent = "";
  }

  modal.classList.remove("hidden");

  setTimeout(() => {
    newPassword?.focus();
  }, 50);
}

function closeAppLockPasswordModal() {
  $("appLockPasswordModal")?.classList.add("hidden");
}

async function saveAppLockPassword(password) {
  const passwordHash = await hashPassword(password);

  await setDoc(
    doc(db, "settings", APP_LOCK_DOC),
    {
      passwordHash,
      updatedAt: serverTimestamp(),
    },
    {
      merge: true,
    },
  );

  appLockPasswordHash = passwordHash;

  renderAppLockSettings();
}
function openDataUnlockModal() {
  const modal = $("lockScreen");

  if (!modal) return;

  const input = $("unlockPassword");
  const error = $("unlockError");

  if (input) {
    input.value = "";
  }

  error?.classList.add("hidden");

  modal.classList.remove("hidden");

  setTimeout(() => {
    input?.focus();
  }, 50);
}
function bindActions() {
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => (b.onclick = () => setPage(b.dataset.page)));
  document
    .querySelectorAll("[data-page-link]")
    .forEach((b) => (b.onclick = () => setPage(b.dataset.pageLink)));
  $("newTaskBtn").onclick = () => openTaskModal();
  $("createComboBtn").onclick = () => openComboModal();

  $("comboForm").onsubmit = saveCombo;

  $("comboClient").onchange = () => {
    populateComboTypes();
    updateComboPreview();
  };

  $("comboTimeMode").onchange = () => {
    const current = parseComboSubtasks();

    renderComboSubtasks(current);
  };

  $("comboType").onchange = updateComboPreview;

  // Add Subtask
  $("addComboSubtaskBtn").onclick = addComboSubtask;

  // Remove Subtask + cập nhật số thứ tự
  $("comboSubtasksList").addEventListener("click", (e) => {
    const button = e.target.closest('[data-action="remove"]');

    if (!button) return;

    removeComboSubtask(button);
  });

  // Cập nhật preview khi nhập dữ liệu
  $("comboSubtasksList").addEventListener("input", (e) => {
    const input = e.target;

    if (input.dataset.field === "countryCode") {
      const start = input.selectionStart;
      const end = input.selectionEnd;

      input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "");

      input.setSelectionRange(
        Math.min(start, input.value.length),
        Math.min(end, input.value.length),
      );
    }

    updateComboPreview();
  });

// ==================== CLIENT MODAL EVENTS ====================

// Open New Client modal
$("addClientBtn").onclick = () => openClientModal();

// Add Task Type inside Client Modal
$("addClientTypeBtn").onclick = () => {
  addClientType();
};

// Press Enter to add Task Type
$("clientTypeInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addClientType();
  }
});

// Save New Client / Edit Client
$("clientForm").onsubmit = saveClient;

  $("editWorkDayBtn").onclick = () => openWorkDayModal(today());

  // Edit any day directly from the weekly Work Hours table
  $("workWeekTableBody").addEventListener("click", (e) => {
    const button = e.target.closest("[data-edit-work-day]");

    if (!button) return;

    const date = button.dataset.editWorkDay;

    if (!date) return;

    openWorkDayModal(date);
  });

  $("workDayForm").onsubmit = saveWorkDay;

  $("workDayCheckIn").oninput = updateWorkDayPreview;

  $("workDayCheckOut").oninput = updateWorkDayPreview;

  $("workDayLunch").oninput = updateWorkDayPreview;

  $("generateSummaryBtn").onclick = generateSummary;
  $("copySummaryBtn").onclick = copySummary;
  $("taskForm").onsubmit = saveTask;
  $("taskClient").onchange = () => {
    const clientId = $("taskClient").value;

    populateTaskTypes(clientId);
  };

  $("taskType").onchange = updateAssetTimePreview;

  $("taskAssetAmount").oninput = updateAssetTimePreview;
  $("timeForm").onsubmit = saveTime;
  $("correctionForm").onsubmit = saveCorrection;

  $("taskSearch").oninput = () => {
    saveTaskFilterPreferences();
    renderTasks();
  };

  $("taskStatusFilter").onchange = () => {
    saveTaskFilterPreferences();
    renderTasks();
  };

  $("taskTypeFilter").onchange = () => {
    saveTaskFilterPreferences();
    renderTasks();
  };

  // ========================================
  // TASK BOARD INTERACTIONS
  // ========================================

  document.addEventListener("click", async (e) => {
    const target = e.target;
    // EDIT COMBO
    const editComboButton = target.closest("[data-edit-combo]");

    if (editComboButton) {
      openComboModal(editComboButton.dataset.editCombo);
      return;
    }

    // DELETE COMBO
    const deleteComboButton = target.closest("[data-delete-combo]");

    if (deleteComboButton) {
      deleteCombo(deleteComboButton.dataset.deleteCombo);
      return;
    }
    // COMBO SUBTASK TOGGLE
    const comboToggle = target.closest("[data-combo-toggle]");

    if (comboToggle) {
      const comboId = comboToggle.dataset.comboToggle;

      if (expandedComboIds.has(comboId)) {
        expandedComboIds.delete(comboId);
      } else {
        expandedComboIds.add(comboId);
      }

      renderTasks();

      return;
    }

    // COPY COMBO / SUBTASK LINK
    const comboCopy = target.closest("[data-copy-combo-link]");

    if (comboCopy) {
      await copyComboLink(comboCopy.dataset.copyComboLink);

      return;
    }
    // VIEW SWITCH
    const viewButton = target.closest("[data-task-view]");

    if (viewButton) {
      taskViewMode = viewButton.dataset.taskView;

      localStorage.setItem("worklog_task_view_mode", taskViewMode);

      selectedTaskIds.clear();

      renderTasks();

      return;
    }

    // BULK APPLY
    if (target.closest("#taskBulkApplyBtn")) {
      await bulkChangeTaskStatus();

      return;
    }

    // CLEAR SELECTION
    if (target.closest("#taskClearSelectionBtn")) {
      selectedTaskIds.clear();

      renderTasks();

      return;
    }
  });

  document.addEventListener("change", (e) => {
    const target = e.target;

    // ASSET TYPE SELECTOR
    if (target.id === "taskBoardAssetType") {
      selectedAssetType = target.value;

      renderTasks();

      return;
    }
    // SELECT ALL SUBTASKS IN ONE COMBO
    const comboCheckbox = target.closest("[data-select-combo]");

    if (comboCheckbox) {
      const comboId = comboCheckbox.dataset.selectCombo;

      const comboTaskIds = currentVisibleTaskIds.filter((id) => {
        const task = getTask(id);
        return task && task.comboId === comboId;
      });

      if (comboCheckbox.checked) {
        comboTaskIds.forEach((id) => selectedTaskIds.add(id));
      } else {
        comboTaskIds.forEach((id) => selectedTaskIds.delete(id));
      }

      renderTasks();
      return;
    }
    // SELECT ALL BY STATUS
    const statusCheckbox = target.closest("[data-select-status]");

    if (statusCheckbox) {
      const status = statusCheckbox.dataset.selectStatus;

      const statusTaskIds = currentVisibleTaskIds.filter((id) => {
        const task = getTask(id);
        return task && task.status === status;
      });

      if (statusCheckbox.checked) {
        statusTaskIds.forEach((id) => {
          selectedTaskIds.add(id);
        });
      } else {
        statusTaskIds.forEach((id) => {
          selectedTaskIds.delete(id);
        });
      }

      renderTasks();

      return;
    }

    // SELECT ALL BY ASSET TYPE
    if (target.id === "taskSelectAllVisible") {
      if (target.checked) {
        currentVisibleTaskIds.forEach((id) => {
          selectedTaskIds.add(id);
        });
      } else {
        currentVisibleTaskIds.forEach((id) => {
          selectedTaskIds.delete(id);
        });
      }

      renderTasks();

      return;
    }

    // INDIVIDUAL TASK CHECKBOX
    const checkbox = target.closest("[data-select-task]");

    if (checkbox) {
      const taskId = checkbox.dataset.selectTask;

      if (checkbox.checked) {
        selectedTaskIds.add(taskId);
      } else {
        selectedTaskIds.delete(taskId);
      }

      renderTasks();
    }
  });
  $("showArchivedBtn").onclick = () => {
    state.showArchived = !state.showArchived;
    $("showArchivedBtn").textContent = state.showArchived
      ? "Hide Archived"
      : "Show Archived";
    renderTasks();
  };
  $("refreshReportBtn").onclick = renderReport;
  $("reportProject").onchange = renderReport;

  $("reportFrom").onchange = () => {
    saveReportDates();
    renderReport();
  };

  $("reportTo").onchange = () => {
    saveReportDates();
    renderReport();
  };

  $("exportCsvBtn").onclick = exportCsv;
  $("exportJsonBtn").onclick = exportJson;
  $("restoreJsonBtn").onclick = () => $("restoreFileInput").click();
  $("restoreFileInput").onchange = restoreJson;
  $("clearAllBtn").onclick = clearAll;
  $("workHoursSettingsForm")?.addEventListener("submit", saveWorkHoursSettings);
  $("saveTaskDefaultsBtn")?.addEventListener("click", saveTaskDefaultsSettings);
  $("appLockPasswordBtn")?.addEventListener("click", () => {
    openAppLockPasswordModal();
  });

  $("closeAppLockPasswordModal")?.addEventListener("click", () => {
    closeAppLockPasswordModal();
  });

  $("cancelAppLockPassword")?.addEventListener("click", () => {
    closeAppLockPasswordModal();
  });

  $("appLockPasswordForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPassword = $("appLockNewPassword")?.value || "";

    const confirmPassword = $("appLockConfirmPassword")?.value || "";

    const error = $("appLockPasswordError");

    if (newPassword.length < 4) {
      if (error) {
        error.textContent = "Password must be at least 4 characters.";

        error.classList.remove("hidden");
      }

      return;
    }

    if (newPassword !== confirmPassword) {
      if (error) {
        error.textContent = "Passwords do not match.";

        error.classList.remove("hidden");
      }

      return;
    }

    try {
      await saveAppLockPassword(newPassword);

      closeAppLockPasswordModal();

      notify("Password saved.");
    } catch (err) {
      console.error("Failed to save app lock password:", err);

      if (error) {
        error.textContent = "Could not save password. Please try again.";

        error.classList.remove("hidden");
      }
    }
  });
  $("loggedTimeForm").addEventListener("submit", saveLoggedTime);

  $("loggedTimeHours").addEventListener("input", updateQuickLoggedTimePreview);
  $("dataUnlockBtn")?.addEventListener("click", () => {
    openDataUnlockModal();
  });

  $("dataLockBtn")?.addEventListener("click", () => {
    lockData("Work data locked.");
  });

  $("unlockForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    await unlockData();
  });

  document
    .querySelectorAll("[data-close-modal]")
    .forEach((b) => (b.onclick = () => closeModal(b.dataset.closeModal)));
  document.querySelectorAll("[data-time-preset]").forEach(
    (b) =>
      (b.onclick = () => {
        const n = Number(b.dataset.timePreset);
        $("timeHours").value = Math.floor(n / 60);
        $("timeMinutes").value = n % 60;
      }),
  );
  document.querySelectorAll("[data-correction-preset]").forEach(
    (b) =>
      (b.onclick = () => {
        const n = Number(b.dataset.correctionPreset);
        $("correctionHours").value = Math.floor(n / 60);
        $("correctionMinutes").value = n % 60;
      }),
  );

  $("confirmCancelBtn").onclick = () => {
    state.pendingConfirm = null;
    closeModal("confirmModal");
  };
  $("confirmOkBtn").onclick = async () => {
    const fn = state.pendingConfirm;
    state.pendingConfirm = null;
    closeModal("confirmModal");
    if (fn) await fn();
  };

  ["tasksList", "dashboardTasks"].forEach((id) =>
    $(id).addEventListener("click", async (e) => {
      const copyButton = e.target.closest("[data-copy-link]");

      if (copyButton) {
        await copyComboLink(copyButton.dataset.copyLink);
        return;
      }

      const b = e.target.closest("[data-action]");
      if (!b) return;
      const id = b.dataset.taskId;
      const a = b.dataset.action;

      if (a === "toggle-task-more") {
        const row = b.closest(".task-row");

        if (!row) return;

        // Đóng tất cả menu khác trước
        document
          .querySelectorAll(".task-row.task-more-open")
          .forEach((otherRow) => {
            if (otherRow === row) return;

            otherRow.classList.remove("task-more-open");

            otherRow
              .querySelector('[data-action="toggle-task-more"]')
              ?.setAttribute("aria-expanded", "false");
          });

        const isOpen = row.classList.toggle("task-more-open");

        b.setAttribute("aria-expanded", String(isOpen));

        if (isOpen) {
          const menu = row.querySelector(".task-secondary-actions");

          if (menu) {
            const rect = b.getBoundingClientRect();

            // Đọc kích thước sau khi menu đã được hiển thị
            const menuWidth = menu.offsetWidth || 220;
            const menuHeight = menu.offsetHeight || 180;

            // Căn menu theo nút More
            let left = rect.right - menuWidth;

            // Không để menu tràn khỏi cạnh trái/phải màn hình
            left = Math.max(
              8,
              Math.min(left, window.innerWidth - menuWidth - 8),
            );

            // Mặc định mở xuống dưới
            let top = rect.bottom + 6;

            // Không đủ chỗ phía dưới thì mở lên trên
            if (top + menuHeight > window.innerHeight - 8) {
              top = rect.top - menuHeight - 6;
            }

            // Giữ menu nằm trong viewport
            top = Math.max(
              8,
              Math.min(top, window.innerHeight - menuHeight - 8),
            );

            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
          }
        }

        return;
      }

      // if (a === "add-time") openTimeModal(id);
      if (a === "correction") openCorrectionModal(id);
      if (a === "edit-logged") openLoggedTimeModal(getTask(id));
      if (a === "log-remaining") quickLogTask(getTask(id));
      if (a === "history") openHistory(id);
      if (a === "edit") openTaskModal(getTask(id));
      if (a === "status-next") changeStatus(id);
      if (a === "archive") archiveTask(id);
      if (a === "delete") deleteTask(id);
      if (a === "unarchive") unarchiveTask(id);
    }),
  );
  document.addEventListener("click", (e) => {
    // Đóng More menu khi click bên ngoài
    if (
      !e.target.closest(".task-action-toolbar") &&
      !e.target.closest(".task-secondary-actions")
    ) {
      document.querySelectorAll(".task-row.task-more-open").forEach((row) => {
        row.classList.remove("task-more-open");

        row
          .querySelector('[data-action="toggle-task-more"]')
          ?.setAttribute("aria-expanded", "false");
      });
    }

    const button = e.target.closest("[data-task-nav-index]");

    if (!button) return;

    const board = $("tasksList")?.querySelector(".tasks-board");

    if (!board) return;

    const index = Number(button.dataset.taskNavIndex);

    const column = board.querySelector(`[data-task-column-index="${index}"]`);

    if (!column) return;

    board.scrollTo({
      left: column.offsetLeft - board.offsetLeft,
      behavior: "smooth",
    });

    document
      .querySelectorAll("#taskTypeQuickNav .task-type-nav-item")
      .forEach((item) => item.classList.remove("active"));

    button.classList.add("active");
  });

  // Đóng More menu khi cuộn trang hoặc cuộn Task Column
  document.addEventListener(
    "scroll",
    () => {
      document.querySelectorAll(".task-row.task-more-open").forEach((row) => {
        row.classList.remove("task-more-open");

        row
          .querySelector('[data-action="toggle-task-more"]')
          ?.setAttribute("aria-expanded", "false");
      });
    },
    true,
  );
}
function exportCsv() {
  const entries = reportEntries(),
    lines = [
      ["Date", "Task", "Project", "Type", "Normal", "Correction", "Total"],
    ];
  const map = new Map();
  for (const e of entries) {
    const t = getTask(e.taskId),
      key = `${e.date}|${e.taskId}`;
    let r = map.get(key);
    if (!r) map.set(key, (r = { date: e.date, t, normal: 0, correction: 0 }));
    r[e.kind] += e.duration;
  }
  for (const r of map.values())
    lines.push([
      r.date,
      r.t.title,
      r.t.project || "",
      r.t.type || "",
      formatDuration(r.normal),
      formatDuration(r.correction),
      formatDuration(r.normal + r.correction),
    ]);
  const csv = lines
      .map((row) =>
        row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n"),
    blob = new Blob([csv], { type: "text/csv" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `WorkLog_Report_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportJson() {
  const data = {
    version: "2.1",
    exportedAt: new Date().toISOString(),

    tasks: state.tasks,
    combos: state.combos,

    workSessions: state.workSessions,
    corrections: state.corrections,
    activityLogs: state.activities,

    workDays: state.workDays,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `WorkLog_Backup_${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function restoreJson(e) {
  const input = e.target;
  const file = input.files?.[0];

  if (!file) return;

  // Keep this visible until restore actually finishes.
  const loadingToast = notify("Restoring backup...", "success", 0);

  try {
    const data = JSON.parse(await file.text());

    if (!Array.isArray(data.tasks)) {
      throw new Error("Invalid WorkLog backup.");
    }

    for (const t of data.tasks) {
      const id = t.id;
      const copy = { ...t };
      delete copy.id;
      await importDoc("tasks", id, copy);
    }

    for (const combo of data.combos || []) {
      const id = combo.id;
      const copy = { ...combo };

      delete copy.id;

      await importDoc("combos", id, copy);
    }
    for (const x of data.workSessions || []) {
      const id = x.id;
      const copy = { ...x };
      delete copy.id;
      await importDoc("workSessions", id, copy);
    }

    for (const x of data.corrections || []) {
      const id = x.id;
      const copy = { ...x };
      delete copy.id;
      await importDoc("corrections", id, copy);
    }

    for (const x of data.activityLogs || []) {
      const id = x.id;
      const copy = { ...x };
      delete copy.id;
      await importDoc("activityLogs", id, copy);
    }

    for (const x of data.workDays || []) {
      const id = x.id;
      const copy = { ...x };
      delete copy.id;
      await importDoc("workDays", id, copy);
    }

    loadingToast.remove();
    notify("Backup restored successfully.");
  } catch (err) {
    console.error("Restore backup failed:", err);

    loadingToast.remove();

    notify(err.message || "Could not restore backup.", "error");
  } finally {
    // Allow selecting the same JSON file again.
    input.value = "";
  }
}
async function importDoc(col, id, data) {
  await updateDoc(doc(db, col, id), data).catch(async () => {
    await addDoc(collection(db, col), data);
  });
}

function subscribe() {
  stopSubscriptions();
  // Reset trạng thái khi đăng ký Firebase listeners
  clientsSnapshotReady = false;
  tasksSnapshotReady = false;
  taskFiltersRestored = false;
  unsubscribeListeners = [
    onSnapshot(collection(db, "clients"), (snap) => {
      state.clients = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      renderClients();
      renderTaskDefaultsSettings();
      populateTaskClients($("taskClient")?.value || "");

      populateTaskTypeFilter();

      clientsSnapshotReady = true;
      tryRestoreTaskFilterPreferences();

      const currentClientId = $("taskClient")?.value || "";

      if (currentClientId) {
        populateTaskTypes(currentClientId, $("taskType")?.value || "");
      }
    }),

    onSnapshot(collection(db, "tasks"), async (snap) => {
      state.tasks = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      populateProjects();
      populateTaskTypeFilter();

      tasksSnapshotReady = true;
      tryRestoreTaskFilterPreferences();

      renderTasks();
      updateDashboard();

      try {
        await migrateFixedTasksToWorkLogs();
      } catch (err) {
        console.error("Fixed → WorkLog migration failed:", err);
      }
    }),

    onSnapshot(collection(db, "combos"), (snap) => {
      state.combos = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      renderTasks();
    }),

    onSnapshot(collection(db, "workSessions"), (snap) => {
      state.workSessions = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      updateDashboard();
      renderTasks();
    }),

    onSnapshot(collection(db, "corrections"), (snap) => {
      state.corrections = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      updateDashboard();
      renderTasks();
    }),

    onSnapshot(collection(db, "activityLogs"), (snap) => {
      state.activities = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      updateDashboard();
      renderTasks();
    }),

    onSnapshot(collection(db, "workDays"), (snap) => {
      state.workDays = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      updateDashboard();
      renderWorkHours();
    }),
  ];
}
function stopSubscriptions() {
  unsubscribeListeners.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
    }
  });

  unsubscribeListeners = [];
}

function clearDataState() {
  state.clients = [];
  state.tasks = [];
  state.combos = [];
  expandedComboIds.clear();
  state.workSessions = [];
  state.corrections = [];
  state.activities = [];
  state.workDays = [];
}

function clearDataUI() {
  $("statTodayTime").textContent = "—";
  $("statTasksWorked").textContent = "—";
  $("statCorrections").textContent = "—";
  $("statOpenTasks").textContent = "—";

  $("todayTimelineTotal").textContent = "—";

  const emptyContainers = ["todayWorkList", "dashboardTasks", "tasksList"];

  emptyContainers.forEach((id) => {
    const el = $(id);

    if (el) {
      el.innerHTML = "";
    }
  });

  const workHours = $("workHoursList");

  if (workHours) {
    workHours.innerHTML = "";
  }

  const workHourValues = [
    "workTodayActual",
    "workTodayFlexi",
    "workWeekActual",
    "flexiOpening",
    "flexiWeekAdded",
    "flexiAvailable",
    "workAvailableFlexi",
    "workFlexiHelper",
    "workWeekFlexi",
    "workWeekLabel",
  ];

  workHourValues.forEach((id) => {
    const el = $(id);

    if (el) {
      el.textContent = "—";
    }
  });

  $("todayWorkDayCard")?.replaceChildren();

  const reportBody = $("reportTableBody");

  if (reportBody) {
    reportBody.innerHTML = "";
  }

  const taskClient = $("taskClient");

  if (taskClient) {
    taskClient.innerHTML = `<option value="">Unlock data to load clients</option>`;
  }

  const taskProject = $("taskProject");

  if (taskProject) {
    taskProject.innerHTML = "";
  }
}

function showDataLockedState() {
  $("dataLockBanner")?.classList.remove("hidden");
  $("dataUnlockBtn")?.classList.remove("hidden");
  $("dataLockBtn")?.classList.add("hidden");
}

function showDataUnlockedState() {
  $("dataLockBanner")?.classList.add("hidden");
  $("dataUnlockBtn")?.classList.add("hidden");
  $("dataLockBtn")?.classList.remove("hidden");
}

function clearDataLockTimer() {
  if (dataLockTimer) {
    clearTimeout(dataLockTimer);
    dataLockTimer = null;
  }
}

function startDataLockTimer() {
  clearDataLockTimer();
  clearDataLockCountdown();

  const expiresAt = Number(
    sessionStorage.getItem(DATA_UNLOCK_EXPIRES_KEY) || 0,
  );

  const remainingMs = expiresAt - Date.now();

  if (remainingMs <= 0) {
    sessionStorage.removeItem(DATA_UNLOCK_EXPIRES_KEY);
    dataUnlocked = false;

    renderDataLockCountdown();

    return;
  }

  dataLockTimer = setTimeout(() => {
    lockData("Data locked automatically.");
  }, remainingMs);

  startDataLockCountdown();
}
function lockData(message = "Work data locked.") {
  if (!dataUnlocked) {
    showDataLockedState();
    renderDataLockCountdown();
    return;
  }

  dataUnlocked = false;

  sessionStorage.removeItem(DATA_UNLOCK_EXPIRES_KEY);

  clearDataLockTimer();
  clearDataLockCountdown();

  stopSubscriptions();
  clearDataState();

  window.location.reload();
}
async function unlockData() {
  const password = $("unlockPassword")?.value || "";
  const error = $("unlockError");

  if (!password) {
    error?.classList.remove("hidden");
    return;
  }

  try {
    const isCorrect = await checkUnlockPassword(password);

    if (!isCorrect) {
      error?.classList.remove("hidden");

      $("unlockPassword").value = "";
      $("unlockPassword").focus();

      return;
    }

    dataUnlocked = true;

    sessionStorage.setItem(
      DATA_UNLOCK_EXPIRES_KEY,
      String(Date.now() + DATA_SESSION_MS),
    );

    $("unlockPassword").value = "";
    error?.classList.add("hidden");

    $("lockScreen")?.classList.add("hidden");
    await loadWorkHoursSettings();
    await loadTaskDefaultsSettings();

    renderWorkHoursSettings();

    showDataUnlockedState();

    subscribe();

    renderWorkHours();

    updateDashboard();

    startDataLockTimer();

    notify("Work data unlocked.");
  } catch (err) {
    console.error("Unlock data failed:", err);

    error?.classList.remove("hidden");

    $("unlockPassword").value = "";
    $("unlockPassword").focus();
  }
}

async function checkUnlockPassword(password) {
  if (!appLockPasswordHash) {
    return false;
  }

  const hash = await hashPassword(password);

  return hash === appLockPasswordHash;
}
function setConnection(online = true) {
  $("connectionDot").classList.toggle("offline", !online);
  $("connectionStatus").textContent = online ? "Online" : "Offline";
}
window.addEventListener("online", () => setConnection(true));
window.addEventListener("offline", () => setConnection(false));
$("taskType").addEventListener("change", updateAssetTimePreview);
$("taskClient")?.addEventListener("change", () => {
  populateTaskTypes($("taskClient").value);
});
$("taskAssetAmount").addEventListener("input", updateAssetTimePreview);
// $("taskLoggedHours").addEventListener("input", updateLoggedTimePreview);

$("taskLogFilter")?.addEventListener("change", () => {
  saveTaskFilterPreferences();
  renderTasks();
});

$("taskDateFilter")?.addEventListener("change", () => {
  const value = $("taskDateFilter").value;
  const input = $("taskCustomDate");

  if (input) {
    const isCustom = value === "custom";

    input.style.display = isCustom ? "" : "none";

    if (!isCustom) {
      input.value = "";
    }
  }

  saveTaskFilterPreferences();
  renderTasks();
});

$("taskCustomDate")?.addEventListener("change", () => {
  saveTaskFilterPreferences();
  renderTasks();
});

fillSelects();
ensureTaskRedesignStyles();
initReportDates();
bindActions();
// Restore the last selected page
let savedActivePage = "dashboard";

try {
  const storedPage = localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY);

  if (VALID_APP_PAGES.includes(storedPage)) {
    savedActivePage = storedPage;
  }
} catch (err) {
  console.warn("Could not restore the active page:", err);
}

setPage(savedActivePage);
setConnection(navigator.onLine);

await loadAppLockConfig();

renderAppLockSettings();

const unlockExpiresAt = Number(
  sessionStorage.getItem(DATA_UNLOCK_EXPIRES_KEY) || 0,
);

if (unlockExpiresAt > Date.now()) {
  dataUnlocked = true;

  $("lockScreen")?.classList.add("hidden");

  await loadWorkHoursSettings();
  await loadTaskDefaultsSettings();

  renderWorkHoursSettings();
  renderTaskDefaultsSettings();

  showDataUnlockedState();

  subscribe();
  renderWorkHours();
  updateDashboard();

  startDataLockTimer();
} else {
  dataUnlocked = false;

  sessionStorage.removeItem(DATA_UNLOCK_EXPIRES_KEY);

  stopSubscriptions();
  clearDataState();
  clearDataUI();
  showDataLockedState();
}

$("loadingScreen")?.classList.add("hidden");
$("app")?.classList.remove("hidden");
