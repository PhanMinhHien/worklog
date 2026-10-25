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

const $ = (id) => document.getElementById(id);


// ==================== BASIC UI PROTECTION ====================

// Disable right-click
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Disable common source/devtools shortcuts
document.addEventListener("keydown", (e) => {
  // F12
  if (e.key === "F12") {
    e.preventDefault();
    return;
  }

  // Ctrl + U / Cmd + U — View Source
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === "u"
  ) {
    e.preventDefault();
    return;
  }

  // Ctrl + Shift + I / Cmd + Option + I — DevTools
  if (
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    e.key.toLowerCase() === "i"
  ) {
    e.preventDefault();
    return;
  }

  // Ctrl + Shift + J / Cmd + Option + J — Console
  if (
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    e.key.toLowerCase() === "j"
  ) {
    e.preventDefault();
    return;
  }

  // Ctrl + Shift + C / Cmd + Shift + C — Inspect Element
  if (
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    e.key.toLowerCase() === "c"
  ) {
    e.preventDefault();
    return;
  }
});
// ==================== THEME ====================

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
const STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  WAITING: "waiting",
  // BLOCKED: "blocked",
  COMPLETED: "completed",
  ARCHIVED: "archived",
};
const STATUS_META = {
  open: { label: "New", icon: "🟡", cls: "status-open" },
  in_progress: { label: "In Approval", icon: "🔵", cls: "status-progress" },
  waiting: { label: "Waiting", icon: "🟣", cls: "status-waiting" },
  // blocked: { label: "Blocked", icon: "🟠", cls: "status-blocked" },
  completed: { label: "Completed", icon: "🟢", cls: "status-completed" },
  archived: { label: "Archived", icon: "⚫", cls: "status-archived" },
};
const state = {
  clients: [],
  tasks: [],
  workSessions: [],
  corrections: [],
  activities: [],
  workDays: [],
  activePage: "dashboard",
  showArchived: false,
  pendingConfirm: null,
};
// ==================== DATA LOCK ====================

const APP_LOCK_DOC = "appLock";

// Data sẽ tự khóa sau 2 giờ kể từ lúc unlock.
// 120 phút = 2 giờ.
const DATA_SESSION_MINUTES = 120;
const DATA_SESSION_MS = DATA_SESSION_MINUTES * 60 * 1000;

let dataUnlocked = false;
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

async function loadWorkHoursSettings() {
  try {
    const ref = doc(db, "settings", WORK_HOURS_SETTINGS_DOC);

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("Work hours settings do not exist yet.");

      return false;
    }

    const data = snap.data();

    dailyTargetMinutes = Math.max(
      0,
      Number(data.dailyTargetMinutes) || 0,
    );

    openingFlexiMinutes = Math.max(
      0,
      Number(data.openingFlexiMinutes) || 0,
    );

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

  const dailyTarget = Math.max(
    0,
    Number($("dailyTargetMinutes")?.value) || 0,
  );

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
  const date = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!date) return "Recently";
  const diff = Math.max(0, Date.now() - date.getTime()),
    min = Math.floor(diff / 60000);
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
const taskMinutes = (id) =>
  state.workSessions
    .filter((x) => x.taskId === id)
    .reduce((s, x) => s + (Number(x.duration) || 0), 0) +
  state.corrections
    .filter((x) => x.taskId === id)
    .reduce((s, x) => s + (Number(x.duration) || 0), 0);
const normalMinutes = (id) =>
  state.workSessions
    .filter((x) => x.taskId === id)
    .reduce((s, x) => s + (Number(x.duration) || 0), 0);
const correctionMinutes = (id) =>
  state.corrections
    .filter((x) => x.taskId === id)
    .reduce((s, x) => s + (Number(x.duration) || 0), 0);

// =========================
// WORK HOURS / FLEXI SETTINGS
// =========================

const WORK_HOURS_SETTINGS_DOC = "workHours";

let dailyTargetMinutes = 480;
let openingFlexiMinutes = 10461;
// const dailyTargetMinutes = 480;
// const openingFlexiMinutes = 10461;
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

  // Supports an overnight shift if needed.
  if (gross < 0) {
    gross += 24 * 60;
  }

  const actual = Math.max(0, gross - lunch);
const target = dailyTargetMinutes;
  return {
    actualMinutes: actual,
    normalMinutes: Math.min(actual, target),
    flexiMinutes: Math.max(0, actual - target),
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

function weekFlexiMinutes(date = today()) {
  return getWeekWorkDays(date).reduce(
    (sum, x) => sum + (Number(x.flexiMinutes) || 0),
    0,
  );
}

function weekActualMinutes(date = today()) {
  return getWeekWorkDays(date).reduce(
    (sum, x) => sum + (Number(x.actualMinutes) || 0),
    0,
  );
}

function availableFlexiMinutes(date = today()) {
  return openingFlexiMinutes + weekFlexiMinutes(date);
}

function formatFlexi(mins = 0) {
  const value = Math.max(0, Math.round(Number(mins) || 0));
  return formatDuration(value);
}
function notify(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  $("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 3200);
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
// function taskDates(id) {
//   const dates = [...state.workSessions, ...state.corrections]
//     .filter((x) => x.taskId === id && x.date)
//     .map((x) => x.date);
//   return [...new Set(dates)].sort().reverse();
// }

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
  if (ts.toMillis) return ts.toMillis();
  const n = typeof ts === "number" ? ts : new Date(ts).getTime();
  return Number.isFinite(n) ? n : 0;
}
function sortNewest(a, b) {
  return dateValue(b.createdAt) - dateValue(a.createdAt);
}
// function renderTask(task, compact = false) {
//   const total = taskMinutes(task.id),
//     dates = taskDates(task.id),
//     s = STATUS_META[task.status] || STATUS_META.open;

//   const firstWorkDate = dates.length ? dates[dates.length - 1] : "";

//   const worked = firstWorkDate ? shortDate(firstWorkDate) : "No work date yet";

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
//           task.loggedMinutes > 0
//             ? `<span>Logged: <strong>${formatDuration(task.loggedMinutes)}</strong></span>`
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
//         <button class="task-action" data-action="add-time" data-task-id="${task.id}">+ Time</button>
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

function renderTask(task, compact = false) {
  const total = taskMinutes(task.id),
    dates = taskDates(task.id),
    s = STATUS_META[task.status] || STATUS_META.open;

  const firstWorkDate = dates.length ? dates[dates.length - 1] : "";

  const worked = firstWorkDate ? shortDate(firstWorkDate) : "No work date yet";

  // Logging status
  const fixedMinutes = Number(task.fixedMinutes) || 0;

  const taskCorrectionMinutes = correctionMinutes(task.id);

  const requiredMinutes = fixedMinutes + taskCorrectionMinutes;

  const loggedMinutes = Number(task.loggedMinutes) || 0;

  const remainingMinutes = Math.max(0, requiredMinutes - loggedMinutes);

  const quickLogButton =
    requiredMinutes > loggedMinutes
      ? `
      <button
        class="task-action quick-log-action"
        data-action="log-remaining"
        data-task-id="${task.id}"
      >
        ✓ Log ${formatDuration(remainingMinutes)}
      </button>
    `
      : "";
  let logStatus = "NO PLAN";
  let logStatusClass = "no-plan";

  if (requiredMinutes > 0 && loggedMinutes <= 0) {
    logStatus = "NOT LOGGED";
    logStatusClass = "not-logged";
  } else if (requiredMinutes > 0 && loggedMinutes < requiredMinutes) {
    logStatus = "INCOMPLETE";
    logStatusClass = "incomplete";
  } else if (requiredMinutes > 0 && loggedMinutes >= requiredMinutes) {
    logStatus = "LOGGED";
    logStatusClass = "complete";
  }

  return `<div class="task-row ${task.status === STATUS.ARCHIVED ? "is-archived" : ""}">
    <div class="task-main">

      <div class="task-title-line">
        <div class="task-title">${escapeHtml(task.title)}</div>
      </div>

      <div class="task-meta">
        <span>${escapeHtml(task.project || "No project")}</span>
        <span>•</span>
        <span>${escapeHtml(task.type || "Other")}</span>

        ${statusBadge(task.status)}

        <span class="task-log-badge ${logStatusClass}">
          ${logStatus}
        </span>
      </div>

      <div class="task-context">
        <span>Worked: ${escapeHtml(worked)}</span>
        <span>•</span>
        <span>Last activity: ${escapeHtml(lastActivity(task.id))}</span>
      </div>

      <div class="task-context task-time-context">

        ${
          total > 0
            ? `<span>WorkLog: <strong>${formatDuration(total)}</strong></span>`
            : ""
        }

        ${
          taskCorrectionMinutes > 0
            ? `<span>Correction: <strong>${formatDuration(taskCorrectionMinutes)}</strong></span>`
            : ""
        }

        ${
          requiredMinutes > 0
            ? `<span>Required: <strong>${formatDuration(requiredMinutes)}</strong></span>`
            : ""
        }

        ${
          loggedMinutes > 0
            ? `<span>Logged: <strong>${formatDuration(loggedMinutes)}</strong></span>`
            : ""
        }

        ${
          remainingMinutes > 0
            ? `<span>Remaining: <strong>${formatDuration(remainingMinutes)}</strong></span>`
            : ""
        }

      </div>

      ${
        !compact && task.note
          ? `<div class="task-note">${escapeHtml(task.note)}</div>`
          : ""
      }

    </div>

    <div class="task-actions">
      ${
        compact
          ? `<button class="task-action" data-action="history" data-task-id="${task.id}">History</button>`
          : `
          ${quickLogButton}
          <button
  class="task-action logged-time-action"
  data-action="edit-logged"
  data-task-id="${task.id}"
>
  Logged: ${formatDuration(loggedMinutes)}
</button>

          <button class="task-action" data-action="add-time" data-task-id="${task.id}">+ Time</button>
        <button class="task-action" data-action="correction" data-task-id="${task.id}">Correction</button>
        <button class="task-action" data-action="history" data-task-id="${task.id}">History</button>
        <button class="task-action" data-action="edit" data-task-id="${task.id}">Edit</button>
        ${
          task.status === STATUS.ARCHIVED
            ? `<button class="task-action" data-action="unarchive" data-task-id="${task.id}">Unarchive</button>`
            : `<button class="task-action" data-action="status-next" data-task-id="${task.id}">
                ${task.status === STATUS.COMPLETED ? "Reopen" : "Status"}
              </button>
              <button class="task-action danger" data-action="archive" data-task-id="${task.id}">Archive</button>`
        }
      `
      }
    </div>
  </div>`;
}
// function renderTask(task, compact = false) {
//   const total = taskMinutes(task.id),
//     dates = taskDates(task.id),
//     s = STATUS_META[task.status] || STATUS_META.open;
//   const worked = dates.length
//     ? dates.slice(0, 3).map(shortDate).join(" · ")
//     : "No time logged yet";
//   return `<div class="task-row ${task.status === STATUS.ARCHIVED ? "is-archived" : ""}">
//     <div class="task-main">
// <div class="task-title-line">
//   <div class="task-title">${escapeHtml(task.title)}</div>

//   <div class="task-time-summary">
//     ${
//       task.loggedMinutes
//         ? `<strong class="task-total">
//             Logged ${formatDuration(task.loggedMinutes)}
//           </strong>`
//         : ""
//     }

//     ${
//       task.fixedMinutes
//         ? `<span class="task-fixed-time">
//             Fixed ${formatDuration(task.fixedMinutes)}
//           </span>`
//         : ""
//     }

//     ${
//       total
//         ? `<span class="task-recorded-time">
//             WorkLog ${formatDuration(total)}
//           </span>`
//         : ""
//     }
//   </div>
// </div>
//       <div class="task-meta"><span>${escapeHtml(task.project || "No project")}</span><span>•</span><span>${escapeHtml(task.type || "Other")}</span>${statusBadge(task.status)}</div>
//       <div class="task-context"><span>Worked: ${escapeHtml(worked)}</span><span>•</span><span>Last activity: ${escapeHtml(lastActivity(task.id))}</span></div>
//       ${!compact && task.note ? `<div class="task-note">${escapeHtml(task.note)}</div>` : ""}
//     </div>
//     <div class="task-actions">
//       ${
//         compact
//           ? `<button class="task-action" data-action="history" data-task-id="${task.id}">History</button>`
//           : `
//         <button class="task-action" data-action="add-time" data-task-id="${task.id}">+ Time</button>
//         <button class="task-action" data-action="correction" data-task-id="${task.id}">Correction</button>
//         <button class="task-action" data-action="history" data-task-id="${task.id}">History</button>
//         <button class="task-action" data-action="edit" data-task-id="${task.id}">Edit</button>
//         ${
//           task.status === STATUS.ARCHIVED
//             ? `<button class="task-action" data-action="unarchive" data-task-id="${task.id}">Unarchive</button>`
//             : `<button class="task-action" data-action="status-next" data-task-id="${task.id}">${task.status === STATUS.COMPLETED ? "Reopen" : "Status"}</button>
//            <button class="task-action danger" data-action="archive" data-task-id="${task.id}">Archive</button>`
//         }
//       `
//       }
//     </div>
//   </div>`;
// }

// function renderTasks() {
//   const q = ($("taskSearch").value || "").toLowerCase().trim();

//   const sf = $("taskStatusFilter").value;
//   const tf = $("taskTypeFilter").value;
//   const lf = $("taskLogFilter")?.value || "all";

//   const df = $("taskDateFilter")?.value || "all";
//   const customDate = $("taskCustomDate")?.value || "";

//   let tasks = state.tasks.filter(
//     (t) => state.showArchived || t.status !== STATUS.ARCHIVED,
//   );

//   // Status
//   if (sf !== "all") {
//     tasks = tasks.filter((t) => t.status === sf);
//   }

//   // Type
//   if (tf !== "all") {
//     tasks = tasks.filter((t) => t.type === tf);
//   }
//   // Logging
//   if (lf !== "all") {
//     tasks = tasks.filter((t) => {
//       const loggedMinutes = Number(t.loggedMinutes) || 0;

//       return lf === "logged" ? loggedMinutes > 0 : loggedMinutes === 0;
//     });
//   }

//   // Date
//   tasks = tasks.filter((t) => taskMatchesDateFilter(t, df, customDate));

//   // Search
//   if (q) {
//     tasks = tasks.filter((t) =>
//       [t.title, t.project, t.note, t.type, t.url].some((v) =>
//         String(v || "")
//           .toLowerCase()
//           .includes(q),
//       ),
//     );
//   }

//  tasks.sort((a, b) => {
//   const getLogPriority = (task) => {
//     const fixedMinutes =
//       Number(task.fixedMinutes) || 0;

//     const correctionMinutes =
//       Number(task.correctionMinutes) || 0;

//     const requiredMinutes =
//       fixedMinutes + correctionMinutes;

//     const loggedMinutes =
//       Number(task.loggedMinutes) || 0;

//     // 0 = NOT LOGGED
//     if (requiredMinutes > 0 && loggedMinutes <= 0) {
//       return 0;
//     }

//     // 1 = INCOMPLETE
//     if (
//       requiredMinutes > 0 &&
//       loggedMinutes < requiredMinutes
//     ) {
//       return 1;
//     }

//     // 2 = COMPLETE
//     if (
//       requiredMinutes > 0 &&
//       loggedMinutes >= requiredMinutes
//     ) {
//       return 2;
//     }

//     // 3 = NO PLAN
//     return 3;
//   };

//   const statusCompare =
//     getLogPriority(a) -
//     getLogPriority(b);

//   if (statusCompare !== 0) {
//     return statusCompare;
//   }

//   // Same logging status → newest updated task first
//   return (
//     dateValue(b.updatedAt || b.createdAt) -
//     dateValue(a.updatedAt || a.createdAt)
//   );
// });

//   $("tasksList").innerHTML = tasks.length
//     ? tasks.map((t) => renderTask(t)).join("")
//     : `
//       <div class="empty-state">
//         <div class="empty-title">
//           No tasks found
//         </div>
//         <div class="empty-text">
//           Try another filter or create a new task.
//         </div>
//       </div>
//     `;
// }

function renderTasks() {
  const q = ($("taskSearch").value || "").toLowerCase().trim();

  const sf = $("taskStatusFilter").value;
  const tf = $("taskTypeFilter").value;
  const lf = $("taskLogFilter")?.value || "all";

  const df = $("taskDateFilter")?.value || "all";
  const customDate = $("taskCustomDate")?.value || "";

  let tasks = state.tasks.filter(
    (t) => state.showArchived || t.status !== STATUS.ARCHIVED,
  );

  // Status
  if (sf !== "all") {
    tasks = tasks.filter((t) => t.status === sf);
  }

  // Type
  if (tf !== "all") {
    tasks = tasks.filter((t) => t.type === tf);
  }

  // Logging
  if (lf !== "all") {
    tasks = tasks.filter((t) => {
      const loggedMinutes = Number(t.loggedMinutes) || 0;

      return lf === "logged" ? loggedMinutes > 0 : loggedMinutes === 0;
    });
  }

  // Date
  tasks = tasks.filter((t) => taskMatchesDateFilter(t, df, customDate));

  // Search
  if (q) {
    tasks = tasks.filter((t) =>
      [t.title, t.project, t.note, t.type, t.url].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }

  // Logging status priority
  tasks.sort((a, b) => {
    const getLogPriority = (task) => {
      const fixedMinutes = Number(task.fixedMinutes) || 0;

      const taskCorrectionMinutes = correctionMinutes(task.id);

      const requiredMinutes = fixedMinutes + taskCorrectionMinutes;

      const loggedMinutes = Number(task.loggedMinutes) || 0;

      // 0 = NOT LOGGED
      if (requiredMinutes > 0 && loggedMinutes <= 0) {
        return 0;
      }

      // 1 = INCOMPLETE
      if (requiredMinutes > 0 && loggedMinutes < requiredMinutes) {
        return 1;
      }

      // 2 = LOGGED
      if (requiredMinutes > 0 && loggedMinutes >= requiredMinutes) {
        return 2;
      }

      // 3 = NO PLAN
      return 3;
    };

    const statusCompare = getLogPriority(a) - getLogPriority(b);

    if (statusCompare !== 0) {
      return statusCompare;
    }

    // Same logging status → newest updated task first
    return (
      dateValue(b.updatedAt || b.createdAt) -
      dateValue(a.updatedAt || a.createdAt)
    );
  });

  $("tasksList").innerHTML = tasks.length
    ? tasks.map((t) => renderTask(t)).join("")
    : `
      <div class="empty-state">
        <div class="empty-title">
          No tasks found
        </div>
        <div class="empty-text">
          Try another filter or create a new task.
        </div>
      </div>
    `;
}
// function renderTasks() {
//   const q = ($("taskSearch").value || "").toLowerCase().trim();
//   const sf = $("taskStatusFilter").value,
//     tf = $("taskTypeFilter").value;
//   let tasks = state.tasks.filter(
//     (t) => state.showArchived || t.status !== STATUS.ARCHIVED,
//   );
//   if (sf !== "all") tasks = tasks.filter((t) => t.status === sf);
//   if (tf !== "all") tasks = tasks.filter((t) => t.type === tf);
//   if (q)
//     tasks = tasks.filter((t) =>
//       [t.title, t.project, t.note, t.type, t.url].some((v) =>
//         String(v || "")
//           .toLowerCase()
//           .includes(q),
//       ),
//     );
//   tasks.sort(
//     (a, b) =>
//       dateValue(b.updatedAt || b.createdAt) -
//       dateValue(a.updatedAt || a.createdAt),
//   );
//   $("tasksList").innerHTML = tasks.length
//     ? tasks.map((t) => renderTask(t)).join("")
//     : `<div class="empty-state"><div class="empty-title">No tasks found</div><div class="empty-text">Try another filter or create a new task.</div></div>`;
// }

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();

  // Monday = first day of week
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

  const dates = taskDates(task.id);

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
function activityLabel(a) {
  const m = a.metadata || {};
  if (a.action === "time_added")
    return `Time logged · ${formatDuration(m.duration)} · ${m.date || ""}`;
  if (a.action === "correction_added")
    return `Correction · ${formatDuration(m.duration)} · ${m.reason || "Other"}`;
  if (a.action === "correction_updated")
    return `Correction updated · ${formatDuration(m.duration)} · ${m.reason || "Other"}`;

  if (a.action === "correction_deleted")
    return `Correction deleted · ${formatDuration(m.duration)} · ${m.reason || "Other"}`;
  if (a.action === "status_changed")
    return `Status: ${STATUS_META[m.from]?.label || m.from} → ${STATUS_META[m.to]?.label || m.to}`;
  if (a.action === "task_archived") return "Task archived";
  if (a.action === "task_unarchived") return "Task unarchived";
  if (a.action === "task_edited") return "Task updated";
  if (a.action === "time_updated")
    return `WorkLog updated · ${formatDuration(m.duration)} · ${m.date || ""}`;

  if (a.action === "time_deleted")
    return `WorkLog deleted · ${formatDuration(m.duration)} · ${m.date || ""}`;
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

  $("statOpenTasks").textContent = state.tasks.filter((t) =>
    [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.WAITING, STATUS.BLOCKED].includes(
      t.status,
    ),
  ).length;

  $("summaryWorked").textContent = formatDuration(total);

  $("summaryTasks").textContent = ids.size;

  $("summaryCorrections").textContent = corr.length;

  renderToday();
  renderDashboardTasks();
  renderRecentActivity();
  renderWorkHours();
}

// function updateDashboard() {
//   const d = today(),
//     normal = state.workSessions.filter((x) => x.date === d),
//     corr = state.corrections.filter((x) => x.date === d);
//   const nm = normal.reduce((s, x) => s + (Number(x.duration) || 0), 0),
//     cm = corr.reduce((s, x) => s + (Number(x.duration) || 0), 0);
//   const ids = new Set(
//     [...normal, ...corr].map((x) => x.taskId).filter((id) => getTask(id)),
//   );
//   const fm = state.tasks
//   .filter(
//     (task) =>
//       task.fixedMinutes > 0 &&
//       task.fixedDate === today()
//   )
//   .reduce(
//     (sum, task) =>
//       sum + (Number(task.fixedMinutes) || 0),
//     0
//   );
// $("statTodayTime").textContent =
//     formatDuration(nm + cm + fm);
//   $("statTasksWorked").textContent = ids.size;
//   $("statCorrections").textContent = corr.length;
//   $("statOpenTasks").textContent = state.tasks.filter((t) =>
//     [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.WAITING, STATUS.BLOCKED].includes(
//       t.status,
//     ),
//   ).length;
//   $("summaryWorked").textContent = formatDuration(nm + cm);
//   $("summaryTasks").textContent = ids.size;
//   $("summaryCorrections").textContent = corr.length;
//   renderToday();
//   renderDashboardTasks();
//   renderRecentActivity();
//   renderWorkHours();
// }
function renderWorkHours() {
  const date = today();
  const day = getWorkDay(date);

  const calc = day
    ? calculateWorkDay(day.checkIn, day.checkOut, day.lunchMinutes)
    : {
        actualMinutes: 0,
        normalMinutes: 0,
        flexiMinutes: 0,
        valid: false,
      };

  $("workTodayActual").textContent = formatDuration(calc.actualMinutes);

  $("workTodayFlexi").textContent = formatFlexi(calc.flexiMinutes);

  $("workWeekActual").textContent = formatDuration(weekActualMinutes(date));

  // $("flexiOpening").textContent = formatFlexi(openingFlexiMinutes);
$("flexiOpening").textContent =
  formatFlexi(openingFlexiMinutes);

$("flexiWeekAdded").textContent =
  formatFlexi(weekFlexiMinutes(date));

$("flexiAvailable").textContent =
  formatFlexi(availableFlexiMinutes(date));

$("workAvailableFlexi").textContent =
  formatFlexi(availableFlexiMinutes(date));

$("workFlexiHelper").textContent =
  `${formatFlexi(openingFlexiMinutes)} opening + ${formatFlexi(
    weekFlexiMinutes(date),
  )} this week`;
  // $("workFlexiHelper").textContent =
  //   `${formatFlexi(openingFlexiMinutes)} opening + ${formatFlexi(weekFlexiMinutes(date))} this week`;

  $("workWeekFlexi").textContent =
    `${formatFlexi(weekFlexiMinutes(date))} flexi`;

  const monday = getMonday(date);
  const sunday = getSunday(date);

  $("workWeekLabel").textContent =
    `${dateLabel(monday)} → ${dateLabel(sunday)}`;

  renderTodayWorkDay(day, calc);
  renderWorkWeekTable(date);
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
        <span>Flexi earned</span>
        <strong>${formatFlexi(calc.flexiMinutes)}</strong>
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

      if (!item) {
        const dateObj = new Date(`${d}T00:00:00`);

        return `
        <tr>
          <td>${escapeHtml(shortDate(d))}</td>
          <td>${dateObj.toLocaleDateString("en-US", {
            weekday: "short",
          })}</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
        </tr>
      `;
      }

      const calc = calculateWorkDay(
        item.checkIn,
        item.checkOut,
        item.lunchMinutes,
      );

      const dateObj = new Date(`${d}T00:00:00`);

      const flexiClass =
        calc.flexiMinutes > 0
          ? "flexi-positive"
          : calc.actualMinutes < dailyTargetMinutes
            ? "below-target"
            : "";

      return `
      <tr>
        <td>${escapeHtml(shortDate(d))}</td>

        <td>
          ${dateObj.toLocaleDateString("en-US", {
            weekday: "short",
          })}
        </td>

        <td>${escapeHtml(item.checkIn || "—")}</td>

        <td>${escapeHtml(item.checkOut || "—")}</td>

        <td>${Number(item.lunchMinutes) || 0}m</td>

        <td>
          ${formatDuration(calc.actualMinutes)}
        </td>

        <td>
          ${formatDuration(calc.normalMinutes)}
        </td>

        <td class="${flexiClass}">
          ${
            calc.flexiMinutes > 0
              ? "+" + formatFlexi(calc.flexiMinutes)
              : formatFlexi(0)
          }
        </td>
      </tr>
    `;
    })
    .join("");
}
function openWorkDayModal(date = today()) {
  const item = getWorkDay(date);

  $("workDayDate").value = date;
  $("workDayCheckIn").value = item?.checkIn || "";
  $("workDayCheckOut").value = item?.checkOut || "";
  $("workDayLunch").value = item?.lunchMinutes ?? 60;

  $("workDayModalTitle").textContent =
    date === today() ? "Today's Work Hours" : `Work Hours · ${dateLabel(date)}`;

  updateWorkDayPreview();

  openModal("workDayModal");
}

function updateWorkDayPreview() {
  const calc = calculateWorkDay(
    $("workDayCheckIn").value,
    $("workDayCheckOut").value,
    $("workDayLunch").value,
  );

  if (!calc.valid) {
    $("workDayPreview").innerHTML =
      "Enter check-in and check-out to see the calculation.";
    return;
  }

  const target = dailyTargetMinutes;

  $("workDayPreview").innerHTML = `
    <div>
      Actual worked:
      <strong>${formatDuration(calc.actualMinutes)}</strong>
    </div>

    <div style="margin-top:5px">
      Daily target:
      <strong>${formatDuration(target)}</strong>
    </div>

    <div style="margin-top:5px">
      Flexi earned:
      <strong>${formatFlexi(calc.flexiMinutes)}</strong>
    </div>
  `;
}

async function saveWorkDay(e) {
  e.preventDefault();

  const date = $("workDayDate").value;
  const checkIn = $("workDayCheckIn").value;
  const checkOut = $("workDayCheckOut").value;
  const lunchMinutes = Math.max(0, Number($("workDayLunch").value) || 0);

  if (!date || !checkIn || !checkOut) {
    return notify("Please enter date, check-in and check-out.", "warning");
  }

  const calc = calculateWorkDay(checkIn, checkOut, lunchMinutes);

  if (!calc.valid || calc.actualMinutes <= 0) {
    return notify("The working time is not valid.", "warning");
  }

  try {
    const existing = getWorkDay(date);

    const data = {
      date,
      checkIn,
      checkOut,
      lunchMinutes,
      actualMinutes: calc.actualMinutes,
      normalMinutes: calc.normalMinutes,
      flexiMinutes: calc.flexiMinutes,
      updatedAt: serverTimestamp(),
    };

    if (existing) {
      await updateDoc(doc(db, "workDays", existing.id), data);
    } else {
      data.createdAt = serverTimestamp();

      await addDoc(collection(db, "workDays"), data);
    }

    closeModal("workDayModal");

    notify("Work hours saved.");

    renderWorkHours();
  } catch (err) {
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

  // Preserve the current filter before rebuilding options.
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

  // Restore the filter if that type still exists.
  if (selectedType === "all" || types.includes(selectedType)) {
    select.value = selectedType;
  } else {
    select.value = "all";
  }
}
function populateTaskStatusFilter() {
  const select = $("taskStatusFilter");

  if (!select) return;

  // Preserve current filter
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

  // Restore current filter if it still exists
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

  // Preserve current filter
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

  // Restore current filter if it still exists
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

  // Preserve current filter
  const selectedDate = select.value || "all";

  // Keep the existing date-filter options
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

  // Restore current filter if it still exists
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

// async function deleteClient(clientId) {
//   const client = getClient(clientId);

//   if (!client) return;

//   const affectedTasks =
//     state.tasks.filter(
//       (task) =>
//         task.clientId === clientId ||
//         (
//           !task.clientId &&
//           String(task.project || "")
//             .trim()
//             .toLowerCase() ===
//             String(client.name || "")
//               .trim()
//               .toLowerCase()
//         )
//     );

//   if (affectedTasks.length) {
//     return notify(
//       `Cannot delete "${client.name}" because ${affectedTasks.length} task(s) are using this client.`,
//       "warning"
//     );
//   }

//   showConfirm({
//     title: "Delete Client",
//     message:
//       `Delete "${client.name}" and all of its task type settings?`,
//     confirmText: "Delete",
//     danger: true,
//   }, async () => {
//     try {
//       await deleteDoc(
//         doc(db, "clients", clientId)
//       );

//       notify("Client deleted.");

//       renderClients();
//       populateTaskClients("");
//       populateTaskTypeFilter();

//     } catch (err) {
//       notify(
//         err.message ||
//           "Could not delete client.",
//         "error"
//       );
//     }
//   });
// }
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

  showConfirm({
    title: "Delete Client",
    message: `Delete "${client.name}" and all of its task type settings?`,
    confirmText: "Delete",
    danger: true,
  });
}
// function fillSelects() {
//   $("taskType").innerHTML = TASK_TYPES.map(
//     (x) => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`,
//   ).join("");
//   $("taskTypeFilter").innerHTML =
//     `<option value="all">All types</option>` +
//     TASK_TYPES.map(
//       (x) => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`,
//     ).join("");
//   $("taskStatus").innerHTML = Object.entries(STATUS_META)
//     .filter(([k]) => k !== STATUS.ARCHIVED)
//     .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`)
//     .join("");
// }
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
function setPage(page) {
  state.activePage = page;
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

function updateLoggedTimePreview() {
  const loggedMinutes = Math.max(
    0,
    Math.round(Number($("taskLoggedHours").value) || 0),
  );

  $("loggedTimePreview").textContent =
    `Logged: ${formatDuration(loggedMinutes)}`;
}
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

    await addActivity(taskId, "logged_time_updated");

    notify("Logged time updated.");
  } catch (err) {
    notify(err.message || "Could not update logged time.", "error");
  }
}
async function quickLogTask(task) {
  if (!task) return;

  const fixedMinutes = Number(task.fixedMinutes) || 0;
  const correction = correctionMinutes(task.id);
  const requiredMinutes = fixedMinutes + correction;
  const loggedMinutes = Number(task.loggedMinutes) || 0;
  const remainingMinutes = Math.max(0, requiredMinutes - loggedMinutes);

  if (remainingMinutes <= 0) return;

  try {
    await updateDoc(doc(db, "tasks", task.id), {
      loggedMinutes: requiredMinutes,
      updatedAt: serverTimestamp(),
    });

    await addActivity(task.id, "logged_time_updated");

    notify(`Logged ${formatDuration(remainingMinutes)}.`);
  } catch (err) {
    notify(err.message || "Could not update logged time.", "error");
  }
}
// function openTaskModal(task = null) {
//   $("taskId").value = task?.id || "";
//   $("taskModalTitle").textContent = task ? "Edit Task" : "New Task";
//   $("taskTitle").value = task?.title || "";
//   $("taskProject").value = task?.project || "ALSO";
//   $("taskType").value = task?.type || TASK_TYPES[0];
//   $("taskStatus").value = task?.status || STATUS.OPEN;
//   $("taskUrl").value = task?.url || "";
//   $("taskNote").value = task?.note || "";

//   $("taskAssetAmount").value =
//     task?.assetAmount || 1;

//   $("taskLoggedHours").value =
//     task?.loggedMinutes
//       ? Number(task.loggedMinutes) / 60
//       : 0;

//   updateAssetTimePreview();
//   updateLoggedTimePreview();

//   openModal("taskModal");
// }

function openTaskModal(task = null) {
  $("taskId").value = task?.id || "";

  $("taskModalTitle").textContent = task ? "Edit Task" : "New Task";

  $("taskTitle").value = task?.title || "";

  /*
   * New task:
   *   no client selected.
   *
   * Existing task:
   *   use clientId if available.
   *   otherwise try to match legacy `project`.
   */
  const inferredClient = task?.clientId
    ? getClient(task.clientId)
    : getClientByName(task?.project);

  const clientId = inferredClient?.id || "";

  populateTaskClients(clientId);

  populateTaskTypes(clientId, task?.type || "");

  $("taskStatus").value = task?.status || STATUS.OPEN;

  $("taskUrl").value = task?.url || "";

  $("taskNote").value = task?.note || "";

  $("taskAssetAmount").value = task?.assetAmount || 1;

  $("taskLoggedHours").value = task?.loggedMinutes
    ? Number(task.loggedMinutes)
    : 0;

  updateAssetTimePreview();
  updateLoggedTimePreview();

  openModal("taskModal");
}
// function openTaskModal(task = null) {
//   $("taskId").value = task?.id || "";
//   $("taskModalTitle").textContent = task ? "Edit Task" : "New Task";
//   $("taskTitle").value = task?.title || "";
//   $("taskProject").value = task?.project || "ALSO";
//   $("taskType").value = task?.type || TASK_TYPES[0];
//   $("taskStatus").value = task?.status || STATUS.OPEN;
//   $("taskUrl").value = task?.url || "";
//   $("taskNote").value = task?.note || "";

//   $("taskAssetAmount").value =
//     task?.assetAmount || 1;

//   updateAssetTimePreview();

//   openModal("taskModal");
// }

function openTimeModal(taskId, entry = null) {
  const t = getTask(taskId);
  if (!t) return;

  $("timeTaskId").value = taskId;
  $("timeModalTaskName").textContent = t.title;

  $("timeEntryId").value = entry?.id || "";

  $("timeDate").value = entry?.date || today();

  const duration = Number(entry?.duration) || 0;

  $("timeHours").value = Math.floor(duration / 60);

  $("timeMinutes").value = duration % 60;

  $("timeNote").value = entry?.note || "";

  const title = $("timeModalTitle");
  if (title) {
    title.textContent = entry ? "Edit WorkLog" : "Add WorkLog";
  }

  openModal("timeModal");
}
// function openTimeModal(taskId) {
//   const t = getTask(taskId);
//   if (!t) return;
//   $("timeTaskId").value = taskId;
//   $("timeModalTaskName").textContent = t.title;
//   $("timeDate").value = today();
//   $("timeHours").value = 0;
//   $("timeMinutes").value = 0;
//   $("timeNote").value = "";
//   openModal("timeModal");
// }
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
  if (!t) return;

  const normal = state.workSessions
    .filter((x) => x.taskId === taskId)
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
                    ${escapeHtml(
                      a.createdAt?.toDate
                        ? a.createdAt.toDate().toLocaleString()
                        : dateLabel(a.metadata?.date),
                    )}
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

                <span class="badge ${
                  e.kind === "Correction" ? "correction" : "normal"
                }">
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
  $("historyAddTimeBtn").onclick = () => {
    closeModal("historyModal");
    openTimeModal(taskId);
  };

  /*
   * Add Correction
   */
  $("historyCorrectionBtn").onclick = () => {
    closeModal("historyModal");
    openCorrectionModal(taskId, entry);
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
// async function saveTask(e) {
//   e.preventDefault();
//   const id = $("taskId").value.trim(),
//     data = {
//       title: $("taskTitle").value.trim(),
//       project: $("taskProject").value.trim(),
//       type: $("taskType").value,
//       status: $("taskStatus").value,
//       url: $("taskUrl").value.trim(),
//       note: $("taskNote").value.trim(),
//       updatedAt: serverTimestamp(),
//     };
//   if (!data.title) return;
//   try {
//     if (id) {
//       await updateDoc(doc(db, "tasks", id), data);
//       await addActivity(id, "task_edited");
//       notify("Task updated.");
//     } else {
//       data.createdAt = serverTimestamp();
//       const ref = await addDoc(collection(db, "tasks"), data);
//       await addActivity(ref.id, "task_created");
//       notify("Task created.");
//     }
//     closeModal("taskModal");
//     $("taskForm").reset();
//   } catch (err) {
//     notify(err.message || "Could not save task.", "error");
//   }
// }
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
//   const type = $("taskType").value;

//   const assetAmount =
//     FIXED_ASSET_TIMES[type]
//       ? Math.max(
//           0,
//           Number($("taskAssetAmount").value) || 0
//         )
//       : 0;

//   const fixedMinutes =
//     FIXED_ASSET_TIMES[type] &&
//     assetAmount > 0
//       ? assetAmount * FIXED_ASSET_TIMES[type]
//       : 0;

//   const loggedHours = Math.max(
//     0,
//     Number($("taskLoggedHours").value) || 0
//   );

//   const loggedMinutes =
//     Math.round(loggedHours * 60);

//   const existingTask =
//     id ? getTask(id) : null;

//   const fixedDate =
//     FIXED_ASSET_TIMES[type] &&
//     fixedMinutes > 0
//       ? existingTask?.fixedDate || today()
//       : "";

//   const data = {
//     title: $("taskTitle").value.trim(),
//     project: $("taskProject").value.trim(),
//     type,
//     status: $("taskStatus").value,
//     url: $("taskUrl").value.trim(),
//     note: $("taskNote").value.trim(),

//     assetAmount,
//     fixedMinutes,
//     fixedDate,

//     // External/manual logged time
//     loggedMinutes,

//     updatedAt: serverTimestamp(),
//   };

//   if (!data.title) return;

//   if (
//     FIXED_ASSET_TIMES[type] &&
//     assetAmount <= 0
//   ) {
//     return notify(
//       "Please enter the amount of assets.",
//       "warning"
//     );
//   }

//   try {
//     if (id) {
//       await updateDoc(
//         doc(db, "tasks", id),
//         data
//       );

//       await syncFixedWorkLog(
//         id,
//         fixedMinutes,
//         fixedDate
//       );

//       await addActivity(
//         id,
//         "task_edited"
//       );

//       notify("Task updated.");
//     } else {
//       data.createdAt =
//         serverTimestamp();

//       const ref = await addDoc(
//         collection(db, "tasks"),
//         data
//       );

//       await syncFixedWorkLog(
//         ref.id,
//         fixedMinutes,
//         fixedDate
//       );

//       await addActivity(
//         ref.id,
//         "task_created"
//       );

//       notify("Task created.");
//     }

//     closeModal("taskModal");
//     $("taskForm").reset();

//   } catch (err) {
//     notify(
//       err.message ||
//         "Could not save task.",
//       "error"
//     );
//   }
// }
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

  const loggedMinutes = Math.max(
    0,
    Math.round(Number($("taskLoggedHours").value) || 0),
  );

  const existingTask = id ? getTask(id) : null;

  const fixedDate =
    minutesPerAsset > 0 && fixedMinutes > 0
      ? existingTask?.fixedDate || today()
      : "";

  const data = {
    title: $("taskTitle").value.trim(),

    /*
     * NEW
     */
    clientId,

    /*
     * Keep the old field so Reports,
     * CSV export, old data, etc. continue
     * to work exactly as before.
     */
    project: client.name,

    type,

    status: $("taskStatus").value,

    url: $("taskUrl").value.trim(),

    note: $("taskNote").value.trim(),

    assetAmount,
    fixedMinutes,
    fixedDate,

    loggedMinutes,

    updatedAt: serverTimestamp(),
  };

  if (!data.title) {
    return notify("Please enter a task title.", "warning");
  }

  if (minutesPerAsset > 0 && assetAmount <= 0) {
    return notify("Please enter the amount of assets.", "warning");
  }

  /*
   * Close immediately.
   * Firebase saving continues in the background.
   */
  closeModal("taskModal");
  $("taskForm").reset();

  try {
    if (id) {
      await updateDoc(doc(db, "tasks", id), data);

      await syncFixedWorkLog(id, fixedMinutes, fixedDate);

      await addActivity(id, "task_edited");

      notify("Task updated.");
    } else {
      data.createdAt = serverTimestamp();

      const ref = await addDoc(collection(db, "tasks"), data);

      await syncFixedWorkLog(ref.id, fixedMinutes, fixedDate);

      await addActivity(ref.id, "task_created");

      notify("Task created.");
    }
  } catch (err) {
    notify(err.message || "Could not save task.", "error");
  }
}
// async function saveTask(e) {
//   e.preventDefault();

//   const id = $("taskId").value.trim();
//   const type = $("taskType").value;

//   const assetAmount =
//     FIXED_ASSET_TIMES[type]
//       ? Math.max(0, Number($("taskAssetAmount").value) || 0)
//       : 0;

//   const fixedMinutes =
//     FIXED_ASSET_TIMES[type] && assetAmount > 0
//       ? assetAmount * FIXED_ASSET_TIMES[type]
//       : 0;
//   const loggedHours =
//   Math.max(
//     0,
//     Number($("taskLoggedHours").value) || 0
//   );

// const loggedMinutes =
//   Math.round(loggedHours * 60);

//   const existingTask = id ? getTask(id) : null;

// const fixedDate =
//   FIXED_ASSET_TIMES[type] && fixedMinutes > 0
//     ? existingTask?.fixedDate || today()
//     : "";

//   const data = {
//   title: $("taskTitle").value.trim(),
//   project: $("taskProject").value.trim(),
//   type,
//   status: $("taskStatus").value,
//   url: $("taskUrl").value.trim(),
//   note: $("taskNote").value.trim(),

//   // Asset-based fixed time
//   assetAmount,
//     fixedMinutes,
//     fixedDate,

//   // Manually recorded time from external work system
//   loggedMinutes,

//   updatedAt: serverTimestamp(),
//   };

//   if (!data.title) return;

//   if (FIXED_ASSET_TIMES[type] && assetAmount <= 0) {
//     return notify(
//       "Please enter the amount of assets.",
//       "warning"
//     );
//   }

//   try {
//     if (id) {
//       await updateDoc(
//         doc(db, "tasks", id),
//         data
//       );

//       await addActivity(id, "task_edited");

//       notify("Task updated.");
//     } else {
//       data.createdAt = serverTimestamp();

//       const ref = await addDoc(
//         collection(db, "tasks"),
//         data
//       );

//       await addActivity(
//         ref.id,
//         "task_created"
//       );

//       notify("Task created.");
//     }

//     closeModal("taskModal");
//     $("taskForm").reset();

//   } catch (err) {
//     notify(
//       err.message || "Could not save task.",
//       "error"
//     );
//   }
// }
async function saveTime(e) {
  e.preventDefault();

  const taskId = $("timeTaskId").value;
  const entryId = $("timeEntryId").value.trim();

  const duration = minutes($("timeHours").value, $("timeMinutes").value);

  const date = $("timeDate").value;
  const note = $("timeNote").value.trim();

  if (!taskId || !date || duration <= 0) {
    return notify("Enter a valid duration.", "warning");
  }

  try {
    const data = {
      taskId,
      date,
      duration,
      note,
      type: "normal",
      updatedAt: serverTimestamp(),
    };

    // EDIT EXISTING WORKLOG
    if (entryId) {
      await updateDoc(doc(db, "workSessions", entryId), data);

      await updateDoc(doc(db, "tasks", taskId), {
        updatedAt: serverTimestamp(),
      });

      await addActivity(taskId, "time_updated", {
        duration,
        date,
      });

      closeModal("timeModal");

      notify("WorkLog updated.");
      return;
    }

    // ADD NEW WORKLOG
    data.createdAt = serverTimestamp();

    await addDoc(collection(db, "workSessions"), data);

    await updateDoc(doc(db, "tasks", taskId), {
      updatedAt: serverTimestamp(),
    });

    await addActivity(taskId, "time_added", {
      duration,
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
// async function saveTime(e) {
//   e.preventDefault();
//   const taskId = $("timeTaskId").value,
//     duration = minutes($("timeHours").value, $("timeMinutes").value),
//     date = $("timeDate").value;
//   if (!taskId || !date || duration <= 0)
//     return notify("Enter a valid duration.", "warning");
//   try {
//     await addDoc(collection(db, "workSessions"), {
//       taskId,
//       date,
//       duration,
//       note: $("timeNote").value.trim(),
//       type: "normal",
//       createdAt: serverTimestamp(),
//     });
//     await updateDoc(doc(db, "tasks", taskId), { updatedAt: serverTimestamp() });
//     await addActivity(taskId, "time_added", { duration, date });
//     closeModal("timeModal");
//     notify("Time added.");
//   } catch (err) {
//     notify(err.message || "Could not add time.", "error");
//   }
// }
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
    // =========================
    // EDIT EXISTING CORRECTION
    // =========================
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

    // =========================
    // ADD NEW CORRECTION
    // =========================
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
function nextStatus(current) {
  const order = [
    STATUS.OPEN,
    STATUS.IN_PROGRESS,
    STATUS.WAITING,
    STATUS.BLOCKED,
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
    await addActivity(id, "status_changed", { from: t.status, to });
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

// function renderTypeBreakdown(typeMap) {
//   const rows = [...typeMap.entries()].sort(
//     (a, b) =>
//       b[1].newTime + b[1].correctionTime - (a[1].newTime + a[1].correctionTime),
//   );

//   $("reportByType").innerHTML = rows.length
//     ? rows
//         .map(([name, data]) => {
//           const totalTime = data.newTime + data.correctionTime;

//           const maxTime =
//             (rows[0]?.[1]?.newTime || 0) +
//               (rows[0]?.[1]?.correctionTime || 0) || 1;

//           const width = Math.max(3, Math.round((totalTime / maxTime) * 100));

//           return `
//             <div class="breakdown-row type-breakdown-row">

//               <div class="type-breakdown-header">
//                 <span>${escapeHtml(name)}</span>

//                 <strong>
//                   ${formatDuration(totalTime)}
//                 </strong>
//               </div>

//               <div class="type-breakdown-details">

//                 ${
//                   data.newAssets > 0 || data.newTime > 0
//                     ? `
//                       <div class="type-breakdown-section">
//                         <div class="type-breakdown-label">
//                           NEW
//                         </div>

//                         <div class="type-breakdown-value">
//                           ${data.newAssets} assets
//                         </div>

//                         <strong>
//                           ${formatDuration(data.newTime)}
//                         </strong>
//                       </div>
//                     `
//                     : ""
//                 }

//                 ${
//                   data.correctionAssets > 0 || data.correctionTime > 0
//                     ? `
//                       <div class="type-breakdown-section correction">
//                         <div class="type-breakdown-label">
//                           CORRECTION
//                         </div>

//                         <div class="type-breakdown-value">
//                           ${data.correctionAssets} assets
//                         </div>

//                         <strong>
//                           ${formatDuration(data.correctionTime)}
//                         </strong>
//                       </div>
//                     `
//                     : ""
//                 }

//                 <div class="type-breakdown-total">
//                   <span>TOTAL</span>

//                   <strong>
//                     ${formatDuration(totalTime)}
//                   </strong>
//                 </div>

//               </div>

//               <div class="bar">
//                 <i style="width:${width}%"></i>
//               </div>

//             </div>
//           `;
//         })
//         .join("")
//     : `<div class="empty-small">No data for this period.</div>`;
// }
function firstWorkLogDate(taskId) {
  const logs = state.workSessions
    .filter((x) => x.taskId === taskId && x.createdAt)
    .sort((a, b) => dateValue(a.createdAt) - dateValue(b.createdAt));

  const first = logs[0];

  if (!first) return "";

  const created = first.createdAt?.toDate
    ? first.createdAt.toDate()
    : new Date(first.createdAt);

  return localDateString(created);
}

function renderReport() {
  const entries = reportEntries();

  const nm = entries
    .filter((x) => x.kind === "normal")
    .reduce((s, x) => s + x.duration, 0);

  const cm = entries
    .filter((x) => x.kind === "correction")
    .reduce((s, x) => s + x.duration, 0);

  const total = nm + cm;

  // Logged time = manual logged time stored on each task.
  // Count each task only once, even if it has multiple WorkLogs / Corrections.
  const reportTaskIds = new Set();

  for (const e of entries) {
    if (e.taskId) {
      reportTaskIds.add(e.taskId);
    }
  }

  const loggedTime = [...reportTaskIds].reduce((sum, taskId) => {
    const task = getTask(taskId);

    return sum + (Number(task?.loggedMinutes) || 0);
  }, 0);

  const remainingTime = total - loggedTime;

  // Summary
  $("reportNormalTime").textContent = formatDuration(nm);

  $("reportCorrectionTime").textContent = formatDuration(cm);

  $("reportTotalTime").textContent = formatDuration(total);

  $("reportLoggedTime").textContent = formatDuration(loggedTime);

  $("reportRemainingTime").textContent = formatDuration(
    Math.max(0, remainingTime),
  );

  // Aggregations
  const byP = new Map();
  const byT = new Map();

  // Report rows are grouped by Task.
  // Date = first WorkLog date for that task.
  const rows = new Map();

  for (const e of entries) {
    const task = getTask(e.taskId);

    if (!task) continue;

    const project = task.project?.trim() || "No project";
    const type = task.type?.trim() || "Other";

    // By Project
    byP.set(project, (byP.get(project) || 0) + e.duration);

    // By Type
    const existingType = byT.get(type) || {
      newTime: 0,
      newAssets: 0,
      correctionTime: 0,
      correctionAssets: 0,

      // NEW / CORRECTION asset tracking
      newTaskIds: new Set(),
      correctionTaskIds: new Set(),

      // NEW: task-level planned / logged time
      totalTime: 0,
      loggedTime: 0,
      totalAssets: 0,
      taskIds: new Set(),
    };

    const assetAmount = Number(task.assetAmount) || 1;

    if (e.kind === "normal") {
      existingType.newTime += Number(e.duration) || 0;

      if (!existingType.newTaskIds.has(e.taskId)) {
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

    // NEW:
    // Count each task only once for Type-level
    // TOTAL / LOGGED / REMAINING.
    if (!existingType.taskIds.has(e.taskId)) {
      existingType.taskIds.add(e.taskId);

      existingType.totalTime += Number(task.fixedMinutes) || 0;

      existingType.loggedTime += Number(task.loggedMinutes) || 0;

      existingType.totalAssets += assetAmount;
    }

    byT.set(type, existingType);

    // One row per Task
    const key = e.taskId;

    let row = rows.get(key);

    if (!row) {
      row = {
        date: firstWorkLogDate(e.taskId),
        taskId: e.taskId,
        task,
        normal: 0,
        correction: 0,
      };

      rows.set(key, row);
    }

    if (e.kind === "normal") {
      row.normal += e.duration;
    }

    if (e.kind === "correction") {
      row.correction += e.duration;
    }
  }

  // Charts / breakdowns
  renderBars("reportByProject", byP);
  renderTypeBreakdown(byT);

  // ==========================================
  // DETAILED REPORT TABLE
  // ==========================================

  const tableRows = [...rows.values()].sort((a, b) => {
    // ------------------------------------------
    // STATUS PRIORITY
    // 0 = NOT LOGGED
    // 1 = INCOMPLETE
    // 2 = COMPLETE
    // ------------------------------------------

    const getStatusPriority = (row) => {
      const taskTotal = Number(row.task.fixedMinutes) || 0;

      const taskCorrection = Number(row.correction) || 0;

      const taskRequired = taskTotal + taskCorrection;

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

    // ------------------------------------------
    // SAME STATUS → NEWEST DATE FIRST
    // ------------------------------------------

    const dateCompare = String(b.date).localeCompare(String(a.date));

    if (dateCompare !== 0) {
      return dateCompare;
    }

    // ------------------------------------------
    // SAME STATUS + SAME DATE → TASK NAME
    // ------------------------------------------

    return String(a.task.title || "").localeCompare(String(b.task.title || ""));
  });

  $("reportTableBody").innerHTML =
    tableRows
      .map((row) => {
        const taskTotal = Number(row.task.fixedMinutes) || 0;

        const taskCorrection = Number(row.correction) || 0;

        // Total time that needs to be logged
        // = planned/fixed time + correction time
        const taskRequired = taskTotal + taskCorrection;

        const taskLogged = Number(row.task.loggedMinutes) || 0;

        const taskRemaining = Math.max(0, taskRequired - taskLogged);

        // ------------------------------------------
        // STATUS
        // ------------------------------------------
        let rowClass = "";
        let statusLabel = "";

        if (taskRequired <= 0) {
          rowClass = "task-log-missing";
          statusLabel = "NO PLAN";
        } else if (taskLogged <= 0) {
          rowClass = "task-log-missing";
          statusLabel = "NOT LOGGED";
        } else if (taskLogged < taskRequired) {
          rowClass = "task-log-incomplete";
          statusLabel = "INCOMPLETE";
        } else {
          statusLabel = "COMPLETE";
        }

        console.log("REPORT TASK CHECK:", {
          task: row.task.title,
          fixedMinutes: taskTotal,
          correction: taskCorrection,
          required: taskRequired,
          logged: taskLogged,
          remaining: taskRemaining,
          status: statusLabel,
        });

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
              ${formatDuration(row.normal)}
            </td>

            <td>
              ${formatDuration(row.correction)}
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
        <td colspan="10" class="table-empty">
          No entries for this period.
        </td>
      </tr>
    `;
}

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
// function renderReport() {
//   const entries = reportEntries();

//   const nm = entries
//     .filter((x) => x.kind === "normal")
//     .reduce((s, x) => s + x.duration, 0);

//   const cm = entries
//     .filter((x) => x.kind === "correction")
//     .reduce((s, x) => s + x.duration, 0);

//   const total = nm + cm;

//   // Logged time = manual logged time stored on each task.
//   // Count each task only once, even if it has multiple WorkLogs / Corrections.
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

//   // Summary
//   $("reportNormalTime").textContent = formatDuration(nm);

//   $("reportCorrectionTime").textContent = formatDuration(cm);

//   $("reportTotalTime").textContent = formatDuration(total);

//   $("reportLoggedTime").textContent = formatDuration(loggedTime);

//   $("reportRemainingTime").textContent = formatDuration(
//     Math.max(0, remainingTime),
//   );

//   // Aggregations
//   const byP = new Map();
//   const byT = new Map();
//   // Report rows are grouped by Task.
//   // Date = first WorkLog date for that task.
//   const rows = new Map();

//   for (const e of entries) {
//     const task = getTask(e.taskId);

//     if (!task) continue;

//     const project = task.project?.trim() || "No project";
//     const type = task.type?.trim() || "Other";

//     // By Project
//     byP.set(project, (byP.get(project) || 0) + e.duration);

//     // By Type
//     const existingType = byT.get(type) || {
//       newTime: 0,
//       newAssets: 0,
//       correctionTime: 0,
//       correctionAssets: 0,

//       // Prevent the same task/asset from being
//       // counted more than once as an asset.
//       newTaskIds: new Set(),
//       correctionTaskIds: new Set(),
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

//     byT.set(type, existingType);
//     // One row per Task
//     const key = e.taskId;

//     let row = rows.get(key);

//     if (!row) {
//       row = {
//         date: firstWorkLogDate(e.taskId),
//         taskId: e.taskId,
//         task,
//         normal: 0,
//         correction: 0,
//       };

//       rows.set(key, row);
//     }

//     if (e.kind === "normal") {
//       row.normal += e.duration;
//     }

//     if (e.kind === "correction") {
//       row.correction += e.duration;
//     }
//   }

//   // Charts / breakdowns
//   renderBars("reportByProject", byP);
//   renderTypeBreakdown(byT);

//   // Detailed report table
//   const tableRows = [...rows.values()].sort((a, b) => {
//     const dateCompare = String(b.date).localeCompare(String(a.date));

//     if (dateCompare !== 0) {
//       return dateCompare;
//     }

//     return String(a.task.title || "").localeCompare(String(b.task.title || ""));
//   });

//   $("reportTableBody").innerHTML =
//     tableRows
//       .map((row) => {
//         const rowTotal = row.normal + row.correction;

//         return `
//           <tr>
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
//                 ${formatDuration(rowTotal)}
//               </strong>
//             </td>
//           </tr>
//         `;
//       })
//       .join("") ||
//     `
//       <tr>
//         <td colspan="7" class="table-empty">
//           No entries for this period.
//         </td>
//       </tr>
//     `;
// }
function initReportDates() {
  const d = new Date(),
    first = new Date(d.getFullYear(), d.getMonth(), 1);
  $("reportFrom").value = first.toISOString().slice(0, 10);
  $("reportTo").value = today();
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
// function generateSummary() {
//   const d = today(),
//     entries = [
//       ...state.workSessions.map((x) => ({ ...x, kind: "normal" })),
//       ...state.corrections.map((x) => ({ ...x, kind: "correction" })),
//     ].filter((x) => x.date === d && getTask(x.taskId));
//   const total = entries.reduce((s, x) => s + x.duration, 0),
//     corrections = entries.filter((x) => x.kind === "correction").length,
//     ids = [...new Set(entries.map((x) => x.taskId))];
//   const grouped = ids
//     .map((id) => ({
//       task: getTask(id),
//       mins: entries
//         .filter((x) => x.taskId === id)
//         .reduce((s, x) => s + x.duration, 0),
//     }))
//     .sort((a, b) => b.mins - a.mins);
//   const completed = state.tasks
//     .filter(
//       (t) =>
//         t.status === STATUS.COMPLETED &&
//         state.activities.some(
//           (a) =>
//             a.taskId === t.id &&
//             a.action === "status_changed" &&
//             a.metadata?.to === STATUS.COMPLETED &&
//             timeAgo(a.createdAt).includes("ago"),
//         ),
//     )
//     .slice(0, 6);
//   const active = state.tasks
//     .filter(
//       (t) =>
//         [
//           STATUS.OPEN,
//           STATUS.IN_PROGRESS,
//           STATUS.WAITING,
//           STATUS.BLOCKED,
//         ].includes(t.status) && taskMinutes(t.id) > 0,
//     )
//     .sort((a, b) => taskMinutes(b.id) - taskMinutes(a.id))
//     .slice(0, 6);
//   const lines = [
//     dateLabel(d),
//     "",
//     `Worked: ${formatDuration(total)}`,
//     `Tasks: ${ids.length}`,
//     `Corrections: ${corrections}`,
//     "",
//     "Main work:",
//     ...grouped
//       .slice(0, 6)
//       .map((x) => `• ${x.task.title} — ${formatDuration(x.mins)}`),
//     "",
//     "Completed:",
//     ...(completed.length
//       ? completed.map((t) => `✓ ${t.title}`)
//       : ["• None recorded today"]),
//     "",
//     "Open:",
//     ...(active.length ? active.map((t) => `• ${t.title}`) : ["• None"]),
//   ];
//   $("summaryModalSubtitle").textContent =
//     `${dateLabel(d)} · ${formatDuration(total)}`;
//   $("summaryText").value = lines.join("\n");
//   openModal("summaryModal");
// }
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

// ==================== APP LOCK SETTINGS ====================

function hasAppLockPassword() {
  return Boolean(appLockPasswordHash);
}

// ==================== UPDATE SETTINGS UI ====================

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

// ==================== OPEN PASSWORD MODAL ====================

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

// ==================== CLOSE PASSWORD MODAL ====================

function closeAppLockPasswordModal() {
  $("appLockPasswordModal")?.classList.add("hidden");
}

// ==================== SAVE PASSWORD ====================

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
  $("addClientBtn").onclick = () => openClientModal();

  $("clientForm").onsubmit = saveClient;

  $("addClientTypeBtn").onclick = addClientType;

  $("clientTypeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addClientType();
    }
  });
  $("editWorkDayBtn").onclick = () => openWorkDayModal(today());

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
  $("taskSearch").oninput = renderTasks;
  $("taskStatusFilter").onchange = renderTasks;
  $("taskTypeFilter").onchange = renderTasks;
  $("showArchivedBtn").onclick = () => {
    state.showArchived = !state.showArchived;
    $("showArchivedBtn").textContent = state.showArchived
      ? "Hide Archived"
      : "Show Archived";
    renderTasks();
  };
  $("refreshReportBtn").onclick = renderReport;
  $("reportProject").onchange = renderReport;
  $("reportFrom").onchange = renderReport;
  $("reportTo").onchange = renderReport;
  $("exportCsvBtn").onclick = exportCsv;
  $("exportJsonBtn").onclick = exportJson;
  $("restoreJsonBtn").onclick = () => $("restoreFileInput").click();
  $("restoreFileInput").onchange = restoreJson;
  $("clearAllBtn").onclick = clearAll;
$("workHoursSettingsForm")?.addEventListener(
  "submit",
  saveWorkHoursSettings,
);
  // ==================== APP LOCK SETTINGS ====================

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

    // ====================
    // VALIDATE
    // ====================

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

    // ====================
    // SAVE
    // ====================

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

  // $("unlockForm")?.addEventListener("submit", async (e) => {
  //   e.preventDefault();

  //   const password = $("unlockPassword")?.value || "";

  //   const error = $("unlockError");

  //   try {
  //     const isCorrect = await checkUnlockPassword(password);

  //     if (isCorrect) {
  //       unlockApp();
  //       return;
  //     }

  //     error?.classList.remove("hidden");

  //     $("unlockPassword").value = "";

  //     $("unlockPassword").focus();
  //   } catch (err) {
  //     console.error("Unlock failed:", err);

  //     error?.classList.remove("hidden");

  //     $("unlockPassword").value = "";

  //     $("unlockPassword").focus();
  //   }
  // });
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
  // $("unlockForm")?.addEventListener("submit", async (e) => {
  //   e.preventDefault();

  //   const password = $("unlockPassword")?.value || "";

  //   const error = $("unlockError");

  //   const isCorrect = await checkUnlockPassword(password);

  //   if (isCorrect) {
  //     unlockApp();
  //     return;
  //   }

  //   error?.classList.remove("hidden");

  //   $("unlockPassword").value = "";
  //   $("unlockPassword").focus();
  // });
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
      const b = e.target.closest("[data-action]");
      if (!b) return;
      const id = b.dataset.taskId;
      const a = b.dataset.action;
      if (a === "add-time") openTimeModal(id);
      if (a === "correction") openCorrectionModal(id);
      if (a === "edit-logged") openLoggedTimeModal(getTask(id));
      if (a === "log-remaining") quickLogTask(getTask(id));
      if (a === "history") openHistory(id);
      if (a === "edit") openTaskModal(getTask(id));
      if (a === "status-next") changeStatus(id);
      if (a === "archive") archiveTask(id);
      if (a === "unarchive") unarchiveTask(id);
    }),
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
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tasks)) throw new Error("Invalid WorkLog backup.");
    for (const t of data.tasks) {
      const id = t.id;
      const copy = { ...t };
      delete copy.id;
      await importDoc("tasks", id, copy);
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

    notify("Backup restored.");
    e.target.value = "";
  } catch (err) {
    notify(err.message || "Could not restore backup.", "error");
  }
}
async function importDoc(col, id, data) {
  await updateDoc(doc(db, col, id), data).catch(async () => {
    await addDoc(collection(db, col), data);
  });
}

// function subscribe() {
//   onSnapshot(collection(db, "clients"), (snap) => {
//     state.clients = snap.docs.map((d) => ({
//       id: d.id,
//       ...d.data(),
//     }));

//     renderClients();

//     populateTaskClients($("taskClient")?.value || "");

//     populateTaskTypeFilter();

//     const currentClientId = $("taskClient")?.value || "";

//     if (currentClientId) {
//       populateTaskTypes(currentClientId, $("taskType")?.value || "");
//     }
//   });
//   onSnapshot(collection(db, "tasks"), async (snap) => {
//     state.tasks = snap.docs.map((d) => ({
//       id: d.id,
//       ...d.data(),
//     }));

//     populateProjects();
//     populateTaskTypeFilter();
//     renderTasks();
//     updateDashboard();

//     try {
//       await migrateFixedTasksToWorkLogs();
//     } catch (err) {
//       console.error("Fixed → WorkLog migration failed:", err);
//     }
//   });

//   onSnapshot(collection(db, "workSessions"), (snap) => {
//     state.workSessions = snap.docs.map((d) => ({
//       id: d.id,
//       ...d.data(),
//     }));

//     updateDashboard();
//     renderTasks();
//   });

//   onSnapshot(collection(db, "corrections"), (snap) => {
//     state.corrections = snap.docs.map((d) => ({
//       id: d.id,
//       ...d.data(),
//     }));

//     updateDashboard();
//     renderTasks();
//   });

//   onSnapshot(collection(db, "activityLogs"), (snap) => {
//     state.activities = snap.docs.map((d) => ({
//       id: d.id,
//       ...d.data(),
//     }));

//     updateDashboard();
//     renderTasks();
//   });

//   onSnapshot(collection(db, "workDays"), (snap) => {
//     state.workDays = snap.docs.map((d) => ({
//       id: d.id,
//       ...d.data(),
//     }));

//     updateDashboard();
//     renderWorkHours();
//   });
// }
function subscribe() {
  stopSubscriptions();

  unsubscribeListeners = [
    onSnapshot(collection(db, "clients"), (snap) => {
      state.clients = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      renderClients();

      populateTaskClients($("taskClient")?.value || "");

      populateTaskTypeFilter();

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
      renderTasks();
      updateDashboard();

      try {
        await migrateFixedTasksToWorkLogs();
      } catch (err) {
        console.error("Fixed → WorkLog migration failed:", err);
      }
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
// function lockApp() {
//   if (appLocked) return;

//   appLocked = true;

//   localStorage.setItem("worklog_locked", "1");

//   stopSubscriptions();

//   $("app")?.classList.add("hidden");
//   $("lockScreen")?.classList.remove("hidden");

//   const input = $("unlockPassword");

//   if (input) {
//     input.value = "";
//     setTimeout(() => input.focus(), 50);
//   }

//   $("unlockError")?.classList.add("hidden");
// }

// function unlockApp() {
//   appLocked = false;

//   localStorage.removeItem("worklog_locked");

//   $("lockScreen")?.classList.add("hidden");
//   $("app")?.classList.remove("hidden");

//   $("unlockPassword").value = "";
//   $("unlockError")?.classList.add("hidden");

//   subscribe();
//   renderWorkHours();
//   updateDashboard();
// }

// async function checkUnlockPassword(password) {
//   if (!appLockPasswordHash) {
//     return false;
//   }

//   const hash = await hashPassword(password);

//   return hash === appLockPasswordHash;
// }
// ==================== DATA LOCK ====================

function clearDataState() {
  state.clients = [];
  state.tasks = [];
  state.workSessions = [];
  state.corrections = [];
  state.activities = [];
  state.workDays = [];
}

function clearDataUI() {
  // Dashboard
  $("statTodayTime").textContent = "—";
  $("statTasksWorked").textContent = "—";
  $("statCorrections").textContent = "—";
  $("statOpenTasks").textContent = "—";

  $("todayTimelineTotal").textContent = "—";

  // Clear lists
  const emptyContainers = ["todayWorkList", "dashboardTasks", "tasksList"];

  emptyContainers.forEach((id) => {
    const el = $(id);

    if (el) {
      el.innerHTML = "";
    }
  });

  // Work hours
  const workHours = $("workHoursList");

  if (workHours) {
    workHours.innerHTML = "";
  }
  // Work hours summary
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

  // Reports
  const reportBody = $("reportTableBody");

  if (reportBody) {
    reportBody.innerHTML = "";
  }

  // Client/project/task related selects
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

  dataLockTimer = setTimeout(() => {
    lockData("Data locked automatically.");
  }, DATA_SESSION_MS);
}
function lockData(message = "Work data locked.") {
  if (!dataUnlocked) {
    showDataLockedState();
    return;
  }

  dataUnlocked = false;

  clearDataLockTimer();
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

    $("unlockPassword").value = "";
    error?.classList.add("hidden");

    $("lockScreen")?.classList.add("hidden");
await loadWorkHoursSettings();

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
$("taskLoggedHours").addEventListener("input", updateLoggedTimePreview);
$("taskLogFilter")?.addEventListener("change", () => {
  renderTasks();
});
$("taskDateFilter")?.addEventListener("change", () => {
  const value = $("taskDateFilter").value;
  const input = $("taskCustomDate");

  if (!input) return;

  const isCustom = value === "custom";

  input.style.display = isCustom ? "" : "none";

  if (!isCustom) {
    input.value = "";
  }

  renderTasks();
});

$("taskCustomDate")?.addEventListener("change", () => {
  renderTasks();
});

fillSelects();

initReportDates();

bindActions();

setConnection(navigator.onLine);
// ==================== LOAD DATA LOCK CONFIG ====================

await loadAppLockConfig();

renderAppLockSettings();

dataUnlocked = false;

stopSubscriptions();

clearDataState();

clearDataUI();

showDataLockedState();

$("loadingScreen")?.classList.add("hidden");
$("app")?.classList.remove("hidden");
