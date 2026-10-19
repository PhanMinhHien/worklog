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
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

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
  tasks: [],
  workSessions: [],
  corrections: [],
  activities: [],
  workDays: [],
  workSettings: {
    dailyTargetMinutes: 480,
    openingFlexiMinutes: 10461
  },
  activePage: "dashboard",
  showArchived: false,
  pendingConfirm: null
};

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
/* =========================
   WORK HOURS / FLEXI HELPERS
========================= */

const DAILY_TARGET_MINUTES = 480;

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
      valid: false
    };
  }

  let gross = end - start;

  // Supports an overnight shift if needed.
  if (gross < 0) {
    gross += 24 * 60;
  }

  const actual = Math.max(0, gross - lunch);
  const target = Number(state.workSettings.dailyTargetMinutes) || DAILY_TARGET_MINUTES;

  return {
    actualMinutes: actual,
    normalMinutes: Math.min(actual, target),
    flexiMinutes: Math.max(0, actual - target),
    valid: true
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

  return Array.from({length: 7}, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateString(d);
  });
}

function getWorkDay(date) {
  return state.workDays.find(x => x.date === date);
}

function getWeekWorkDays(date = today()) {
  const dates = new Set(getWeekDates(date));
  return state.workDays
    .filter(x => dates.has(x.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function weekFlexiMinutes(date = today()) {
  return getWeekWorkDays(date)
    .reduce((sum, x) => sum + (Number(x.flexiMinutes) || 0), 0);
}

function weekActualMinutes(date = today()) {
  return getWeekWorkDays(date)
    .reduce((sum, x) => sum + (Number(x.actualMinutes) || 0), 0);
}

function availableFlexiMinutes(date = today()) {
  return (
    Number(state.workSettings.openingFlexiMinutes) || 0
  ) + weekFlexiMinutes(date);
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
function renderTask(task, compact = false) {
  const total = taskMinutes(task.id),
    dates = taskDates(task.id),
    s = STATUS_META[task.status] || STATUS_META.open;

  const worked = dates.length
    ? dates.slice(0, 3).map(shortDate).join(" · ")
    : "No time logged yet";

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
      </div>

      <div class="task-context">
        <span>Worked: ${escapeHtml(worked)}</span>
        <span>•</span>
        <span>Last activity: ${escapeHtml(lastActivity(task.id))}</span>
      </div>

      <div class="task-context task-time-context">
        ${
          task.fixedMinutes > 0
            ? `<span>Fixed: <strong>${formatDuration(task.fixedMinutes)}</strong></span>`
            : ""
        }

        ${
          total > 0
            ? `<span>WorkLog: <strong>${formatDuration(total)}</strong></span>`
            : ""
        }

        ${
          task.loggedMinutes > 0
            ? `<span>Logged: <strong>${formatDuration(task.loggedMinutes)}</strong></span>`
            : ""
        }
      </div>

      ${!compact && task.note
        ? `<div class="task-note">${escapeHtml(task.note)}</div>`
        : ""
      }

    </div>

    <div class="task-actions">
      ${
        compact
          ? `<button class="task-action" data-action="history" data-task-id="${task.id}">History</button>`
          : `
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

function renderTasks() {
  const q = ($("taskSearch").value || "").toLowerCase().trim();
  const sf = $("taskStatusFilter").value,
    tf = $("taskTypeFilter").value;
  let tasks = state.tasks.filter(
    (t) => state.showArchived || t.status !== STATUS.ARCHIVED,
  );
  if (sf !== "all") tasks = tasks.filter((t) => t.status === sf);
  if (tf !== "all") tasks = tasks.filter((t) => t.type === tf);
  if (q)
    tasks = tasks.filter((t) =>
      [t.title, t.project, t.note, t.type, t.url].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q),
      ),
    );
  tasks.sort(
    (a, b) =>
      dateValue(b.updatedAt || b.createdAt) -
      dateValue(a.updatedAt || a.createdAt),
  );
  $("tasksList").innerHTML = tasks.length
    ? tasks.map((t) => renderTask(t)).join("")
    : `<div class="empty-state"><div class="empty-title">No tasks found</div><div class="empty-text">Try another filter or create a new task.</div></div>`;
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
    }[a] || "•"
  );
}
function activityLabel(a) {
  const m = a.metadata || {};
  if (a.action === "time_added")
    return `Time logged · ${formatDuration(m.duration)} · ${m.date || ""}`;
  if (a.action === "correction_added")
    return `Correction · ${formatDuration(m.duration)} · ${m.reason || "Other"}`;
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
  const d = today(),
    normal = state.workSessions.filter((x) => x.date === d),
    corr = state.corrections.filter((x) => x.date === d);
  const nm = normal.reduce((s, x) => s + (Number(x.duration) || 0), 0),
    cm = corr.reduce((s, x) => s + (Number(x.duration) || 0), 0);
  const ids = new Set(
    [...normal, ...corr].map((x) => x.taskId).filter((id) => getTask(id)),
  );
  $("statTodayTime").textContent = formatDuration(nm + cm);
  $("statTasksWorked").textContent = ids.size;
  $("statCorrections").textContent = corr.length;
  $("statOpenTasks").textContent = state.tasks.filter((t) =>
    [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.WAITING, STATUS.BLOCKED].includes(
      t.status,
    ),
  ).length;
  $("summaryWorked").textContent = formatDuration(nm + cm);
  $("summaryTasks").textContent = ids.size;
  $("summaryCorrections").textContent = corr.length;
  renderToday();
  renderDashboardTasks();
  renderRecentActivity();
  renderWorkHours();
}
function renderWorkHours() {
  const date = today();
  const day = getWorkDay(date);

  const calc = day
    ? calculateWorkDay(
        day.checkIn,
        day.checkOut,
        day.lunchMinutes
      )
    : {
        actualMinutes: 0,
        normalMinutes: 0,
        flexiMinutes: 0,
        valid: false
      };

  $("workTodayActual").textContent =
    formatDuration(calc.actualMinutes);

  $("workTodayFlexi").textContent =
    formatFlexi(calc.flexiMinutes);

  $("workWeekActual").textContent =
    formatDuration(weekActualMinutes(date));

  $("flexiOpening").textContent =
    formatFlexi(state.workSettings.openingFlexiMinutes);

  $("flexiWeekAdded").textContent =
    formatFlexi(weekFlexiMinutes(date));

  $("flexiAvailable").textContent =
    formatFlexi(availableFlexiMinutes(date));

  $("workAvailableFlexi").textContent =
    formatFlexi(availableFlexiMinutes(date));

  $("workFlexiHelper").textContent =
    `${formatFlexi(state.workSettings.openingFlexiMinutes)} opening + ${formatFlexi(weekFlexiMinutes(date))} this week`;

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

  $("workWeekTableBody").innerHTML = dates.map(d => {
    const item = getWorkDay(d);

    if (!item) {
      const dateObj = new Date(`${d}T00:00:00`);

      return `
        <tr>
          <td>${escapeHtml(shortDate(d))}</td>
          <td>${dateObj.toLocaleDateString("en-US", {
            weekday: "short"
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
      item.lunchMinutes
    );

    const dateObj = new Date(`${d}T00:00:00`);

    const flexiClass =
      calc.flexiMinutes > 0
        ? "flexi-positive"
        : calc.actualMinutes < (state.workSettings.dailyTargetMinutes || 480)
          ? "below-target"
          : "";

    return `
      <tr>
        <td>${escapeHtml(shortDate(d))}</td>

        <td>
          ${dateObj.toLocaleDateString("en-US", {
            weekday: "short"
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
          ${calc.flexiMinutes > 0
            ? "+" + formatFlexi(calc.flexiMinutes)
            : formatFlexi(0)}
        </td>
      </tr>
    `;
  }).join("");
}
function openWorkDayModal(date = today()) {
  const item = getWorkDay(date);

  $("workDayDate").value = date;
  $("workDayCheckIn").value = item?.checkIn || "";
  $("workDayCheckOut").value = item?.checkOut || "";
  $("workDayLunch").value =
    item?.lunchMinutes ?? 60;

  $("workDayModalTitle").textContent =
    date === today()
      ? "Today's Work Hours"
      : `Work Hours · ${dateLabel(date)}`;

  updateWorkDayPreview();

  openModal("workDayModal");
}

function updateWorkDayPreview() {
  const calc = calculateWorkDay(
    $("workDayCheckIn").value,
    $("workDayCheckOut").value,
    $("workDayLunch").value
  );

  if (!calc.valid) {
    $("workDayPreview").innerHTML =
      "Enter check-in and check-out to see the calculation.";
    return;
  }

  const target =
    Number(state.workSettings.dailyTargetMinutes) || 480;

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
  const lunchMinutes = Math.max(
    0,
    Number($("workDayLunch").value) || 0
  );

  if (!date || !checkIn || !checkOut) {
    return notify(
      "Please enter date, check-in and check-out.",
      "warning"
    );
  }

  const calc = calculateWorkDay(
    checkIn,
    checkOut,
    lunchMinutes
  );

  if (!calc.valid || calc.actualMinutes <= 0) {
    return notify(
      "The working time is not valid.",
      "warning"
    );
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
      updatedAt: serverTimestamp()
    };

    if (existing) {
      await updateDoc(
        doc(db, "workDays", existing.id),
        data
      );
    } else {
      data.createdAt = serverTimestamp();

      await addDoc(
        collection(db, "workDays"),
        data
      );
    }

    closeModal("workDayModal");

    notify("Work hours saved.");

    renderWorkHours();

  } catch (err) {
    notify(
      err.message || "Could not save work hours.",
      "error"
    );
  }
}
async function saveWorkSettings() {
  const dailyTargetHours =
    Number($("settingsDailyTarget").value);

  const openingFlexiMinutes =
    Math.max(
      0,
      Number($("settingsOpeningFlexi").value) || 0
    );

  if (!dailyTargetHours || dailyTargetHours <= 0) {
    return notify(
      "Please enter a valid daily target.",
      "warning"
    );
  }

  try {
    await updateDoc(
      doc(db, "settings", "workHours"),
      {
        dailyTargetMinutes:
          Math.round(dailyTargetHours * 60),

        openingFlexiMinutes,

        updatedAt: serverTimestamp()
      }
    );

    state.workSettings.dailyTargetMinutes =
      Math.round(dailyTargetHours * 60);

    state.workSettings.openingFlexiMinutes =
      openingFlexiMinutes;

    notify("Work hours settings saved.");

    renderWorkHours();

  } catch (err) {
    notify(
      err.message || "Could not save settings.",
      "error"
    );
  }
}

async function loadWorkSettings() {
  try {
    const snap = await getDocs(
      collection(db, "settings")
    );

    const docData =
      snap.docs.find(d => d.id === "workHours");

    if (!docData) {
      return;
    }

    const data = docData.data();

    state.workSettings = {
      dailyTargetMinutes:
        Number(data.dailyTargetMinutes) || 480,

      openingFlexiMinutes:
        Number(data.openingFlexiMinutes) || 0
    };

  } catch (err) {
    console.warn(
      "Could not load work settings:",
      err
    );
  }

  if ($("settingsDailyTarget")) {
    $("settingsDailyTarget").value =
      state.workSettings.dailyTargetMinutes / 60;

    $("settingsOpeningFlexi").value =
      state.workSettings.openingFlexiMinutes;
  }
}
function fillSelects() {
  $("taskType").innerHTML = TASK_TYPES.map(
    (x) => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`,
  ).join("");
  $("taskTypeFilter").innerHTML =
    `<option value="all">All types</option>` +
    TASK_TYPES.map(
      (x) => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`,
    ).join("");
  $("taskStatus").innerHTML = Object.entries(STATUS_META)
    .filter(([k]) => k !== STATUS.ARCHIVED)
    .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`)
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
const meta={
  dashboard:[
    "Dashboard",
    "Track your work, rework, and daily progress."
  ],

  "work-hours":[
    "Work Hours",
    "Track office hours and flexi time."
  ],

  tasks:[
    "Tasks",
    "Work items, time history, and status."
  ],

  reports:[
    "Reports",
    "Understand where your time is going."
  ],

  settings:[
    "Settings",
    "Backup and manage your WorkLog data."
  ]
}[page];
  $("pageTitle").textContent = meta[0];
  $("pageSubtitle").textContent = meta[1];
  if (page === "tasks") renderTasks();
  if (page === "reports") renderReport();
  if(page==="work-hours")renderWorkHours();
}

function updateAssetTimePreview() {
  const type = $("taskType").value;
  const amount = Math.max(
    0,
    Number($("taskAssetAmount").value) || 0
  );

  const minutesPerAsset = FIXED_ASSET_TIMES[type];

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
  const hours = Math.max(
    0,
    Number($("taskLoggedHours").value) || 0
  );

  const loggedMinutes = Math.round(hours * 60);

  $("loggedTimePreview").textContent =
    `Logged: ${formatDuration(loggedMinutes)}`;
}

function openTaskModal(task = null) {
  $("taskId").value = task?.id || "";
  $("taskModalTitle").textContent = task ? "Edit Task" : "New Task";
  $("taskTitle").value = task?.title || "";
  $("taskProject").value = task?.project || "ALSO";
  $("taskType").value = task?.type || TASK_TYPES[0];
  $("taskStatus").value = task?.status || STATUS.OPEN;
  $("taskUrl").value = task?.url || "";
  $("taskNote").value = task?.note || "";

  $("taskAssetAmount").value =
    task?.assetAmount || 1;

  $("taskLoggedHours").value =
    task?.loggedMinutes
      ? Number(task.loggedMinutes) / 60
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

  $("timeDate").value =
    entry?.date || today();

  const duration = Number(entry?.duration) || 0;

  $("timeHours").value =
    Math.floor(duration / 60);

  $("timeMinutes").value =
    duration % 60;

  $("timeNote").value =
    entry?.note || "";

  const title = $("timeModalTitle");
  if (title) {
    title.textContent =
      entry ? "Edit WorkLog" : "Add WorkLog";
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
function openCorrectionModal(taskId) {
  const t = getTask(taskId);
  if (!t) return;
  $("correctionTaskId").value = taskId;
  $("correctionModalTaskName").textContent = t.title;
  $("correctionDate").value = today();
  $("correctionHours").value = 0;
  $("correctionMinutes").value = 0;
  $("correctionNote").value = "";
  document.querySelector(
    'input[name="correctionReason"][value="client_feedback"]',
  ).checked = true;
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
      <strong>${escapeHtml(
        STATUS_META[t.status]?.label || t.status
      )}</strong>
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
                  <strong>${escapeHtml(
                    activityLabel(a)
                  )}</strong>

                  <small>
                    ${escapeHtml(
                      a.createdAt?.toDate
                        ? a.createdAt.toDate().toLocaleString()
                        : dateLabel(a.metadata?.date)
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
                  ${escapeHtml(
                    e.date ? dateLabel(e.date) : "No date"
                  )}
                </strong>

                <span class="badge ${
                  e.kind === "Correction"
                    ? "correction"
                    : "normal"
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
                  : ""
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
    .querySelectorAll(
      '[data-history-action="edit-worklog"]'
    )
    .forEach((button) => {
      button.addEventListener("click", () => {
        const entryId = button.dataset.entryId;

        const entry = state.workSessions.find(
          (x) => x.id === entryId
        );

        if (!entry) {
          return notify(
            "WorkLog entry not found.",
            "error"
          );
        }

        closeModal("historyModal");

        openTimeModal(taskId, entry);
      });
    });

  $("historyContent")
    .querySelectorAll(
      '[data-history-action="delete-worklog"]'
    )
    .forEach((button) => {
      button.addEventListener("click", () => {
        deleteWorkLog(button.dataset.entryId);
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

async function saveTask(e) {
  e.preventDefault();

  const id = $("taskId").value.trim();
  const type = $("taskType").value;

  const assetAmount =
    FIXED_ASSET_TIMES[type]
      ? Math.max(0, Number($("taskAssetAmount").value) || 0)
      : 0;

  const fixedMinutes =
    FIXED_ASSET_TIMES[type] && assetAmount > 0
      ? assetAmount * FIXED_ASSET_TIMES[type]
      : 0;
  const loggedHours =
  Math.max(
    0,
    Number($("taskLoggedHours").value) || 0
  );

const loggedMinutes =
  Math.round(loggedHours * 60);
  
  const data = {
  title: $("taskTitle").value.trim(),
  project: $("taskProject").value.trim(),
  type,
  status: $("taskStatus").value,
  url: $("taskUrl").value.trim(),
  note: $("taskNote").value.trim(),

  // Asset-based fixed time
  assetAmount,
  fixedMinutes,

  // Manually recorded time from external work system
  loggedMinutes,

  updatedAt: serverTimestamp(),
};

  if (!data.title) return;

  if (FIXED_ASSET_TIMES[type] && assetAmount <= 0) {
    return notify(
      "Please enter the amount of assets.",
      "warning"
    );
  }

  try {
    if (id) {
      await updateDoc(
        doc(db, "tasks", id),
        data
      );

      await addActivity(id, "task_edited");

      notify("Task updated.");
    } else {
      data.createdAt = serverTimestamp();

      const ref = await addDoc(
        collection(db, "tasks"),
        data
      );

      await addActivity(
        ref.id,
        "task_created"
      );

      notify("Task created.");
    }

    closeModal("taskModal");
    $("taskForm").reset();

  } catch (err) {
    notify(
      err.message || "Could not save task.",
      "error"
    );
  }
}
async function saveTime(e) {
  e.preventDefault();

  const taskId = $("timeTaskId").value;
  const entryId = $("timeEntryId").value.trim();

  const duration = minutes(
    $("timeHours").value,
    $("timeMinutes").value
  );

  const date = $("timeDate").value;
  const note = $("timeNote").value.trim();

  if (!taskId || !date || duration <= 0) {
    return notify(
      "Enter a valid duration.",
      "warning"
    );
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
      await updateDoc(
        doc(db, "workSessions", entryId),
        data
      );

      await updateDoc(
        doc(db, "tasks", taskId),
        {
          updatedAt: serverTimestamp()
        }
      );

      await addActivity(
        taskId,
        "time_updated",
        {
          duration,
          date
        }
      );

      closeModal("timeModal");

      notify("WorkLog updated.");
      return;
    }

    // ADD NEW WORKLOG
    data.createdAt = serverTimestamp();

    await addDoc(
      collection(db, "workSessions"),
      data
    );

    await updateDoc(
      doc(db, "tasks", taskId),
      {
        updatedAt: serverTimestamp()
      }
    );

    await addActivity(
      taskId,
      "time_added",
      {
        duration,
        date
      }
    );

    closeModal("timeModal");

    notify("WorkLog added.");

  } catch (err) {
    notify(
      err.message || "Could not save WorkLog.",
      "error"
    );
  }
}

async function deleteWorkLog(entryId) {
  const entry = state.workSessions.find(
    (x) => x.id === entryId
  );

  if (!entry) return;

  const task = getTask(entry.taskId);

  confirmAction(
    "Delete WorkLog?",
    `Delete ${formatDuration(entry.duration)} from "${task?.title || "this task"}"? This cannot be undone.`,
    "",
    "Delete"
  );

  state.pendingConfirm = async () => {
    try {
      await deleteDoc(
        doc(db, "workSessions", entryId)
      );

      if (task) {
        await updateDoc(
          doc(db, "tasks", entry.taskId),
          {
            updatedAt: serverTimestamp()
          }
        );

        await addActivity(
          entry.taskId,
          "time_deleted",
          {
            duration: entry.duration,
            date: entry.date
          }
        );
      }

      notify("WorkLog deleted.");

    } catch (err) {
      notify(
        err.message || "Could not delete WorkLog.",
        "error"
      );
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
  const taskId = $("correctionTaskId").value,
    duration = minutes(
      $("correctionHours").value,
      $("correctionMinutes").value,
    ),
    date = $("correctionDate").value,
    reason =
      document.querySelector('input[name="correctionReason"]:checked')?.value ||
      "other";
  if (!taskId || !date || duration <= 0 || !$("correctionNote").value.trim())
    return notify("Enter a duration and description.", "warning");
  try {
    await addDoc(collection(db, "corrections"), {
      taskId,
      date,
      duration,
      note: $("correctionNote").value.trim(),
      reason,
      type: "correction",
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "tasks", taskId), { updatedAt: serverTimestamp() });
    await addActivity(taskId, "correction_added", { duration, date, reason });
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
        "workDays"

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
  const from = $("reportFrom").value,
    to = $("reportTo").value,
    project = $("reportProject").value;
  return [
    ...state.workSessions.map((x) => ({ ...x, kind: "normal" })),
    ...state.corrections.map((x) => ({ ...x, kind: "correction" })),
  ].filter((e) => {
    const t = getTask(e.taskId);
    if (!t || (t.status === STATUS.ARCHIVED && false)) return false;
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
function renderReport() {
  const entries = reportEntries();

  const nm = entries
    .filter((x) => x.kind === "normal")
    .reduce((s, x) => s + x.duration, 0);

  const cm = entries
    .filter((x) => x.kind === "correction")
    .reduce((s, x) => s + x.duration, 0);

  const total = nm + cm;

  // Summary
  $("reportNormalTime").textContent = formatDuration(nm);
  $("reportCorrectionTime").textContent = formatDuration(cm);

  $("reportTotalTime").textContent = formatDuration(total);

  $("reportCorrectionRate").textContent = total
    ? `${Math.round((cm / total) * 1000) / 10}%`
    : "0%";

  // Aggregations
  const byP = new Map();
  const byT = new Map();

  // Report rows are grouped by:
  // Date + Task
  const rows = new Map();

  for (const e of entries) {
    const task = getTask(e.taskId);

    // Ignore orphan entries whose task no longer exists.
    // Keep the underlying Firebase data untouched.
    if (!task) continue;

    const project = task.project?.trim() || "No project";
    const type = task.type?.trim() || "Other";

    // By Project
    byP.set(
      project,
      (byP.get(project) || 0) + e.duration
    );

    // By Type
    byT.set(
      type,
      (byT.get(type) || 0) + e.duration
    );

    // One row per Date + Task
    const key = `${e.date}|${e.taskId}`;

    let row = rows.get(key);

    if (!row) {
      row = {
        date: e.date,
        taskId: e.taskId,
        task,
        normal: 0,
        correction: 0
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
  renderBars("reportByType", byT);

  // Detailed report table
  const tableRows = [...rows.values()]
    .sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(
        String(a.date)
      );

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return String(a.task.title || "").localeCompare(
        String(b.task.title || "")
      );
    });

  $("reportTableBody").innerHTML =
    tableRows
      .map((row) => {
        const rowTotal =
          row.normal + row.correction;

        return `
          <tr>
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
                ${formatDuration(rowTotal)}
              </strong>
            </td>
          </tr>
        `;
      })
      .join("") ||
    `
      <tr>
        <td colspan="7" class="table-empty">
          No entries for this period.
        </td>
      </tr>
    `;
}
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
  const d = today(),
    entries = [
      ...state.workSessions.map((x) => ({ ...x, kind: "normal" })),
      ...state.corrections.map((x) => ({ ...x, kind: "correction" })),
    ].filter((x) => x.date === d && getTask(x.taskId));
  const total = entries.reduce((s, x) => s + x.duration, 0),
    corrections = entries.filter((x) => x.kind === "correction").length,
    ids = [...new Set(entries.map((x) => x.taskId))];
  const grouped = ids
    .map((id) => ({
      task: getTask(id),
      mins: entries
        .filter((x) => x.taskId === id)
        .reduce((s, x) => s + x.duration, 0),
    }))
    .sort((a, b) => b.mins - a.mins);
  const completed = state.tasks
    .filter(
      (t) =>
        t.status === STATUS.COMPLETED &&
        state.activities.some(
          (a) =>
            a.taskId === t.id &&
            a.action === "status_changed" &&
            a.metadata?.to === STATUS.COMPLETED &&
            timeAgo(a.createdAt).includes("ago"),
        ),
    )
    .slice(0, 6);
  const active = state.tasks
    .filter(
      (t) =>
        [
          STATUS.OPEN,
          STATUS.IN_PROGRESS,
          STATUS.WAITING,
          STATUS.BLOCKED,
        ].includes(t.status) && taskMinutes(t.id) > 0,
    )
    .sort((a, b) => taskMinutes(b.id) - taskMinutes(a.id))
    .slice(0, 6);
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

function bindActions() {
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => (b.onclick = () => setPage(b.dataset.page)));
  document
    .querySelectorAll("[data-page-link]")
    .forEach((b) => (b.onclick = () => setPage(b.dataset.pageLink)));
  $("newTaskBtn").onclick = () => openTaskModal();
  $("editWorkDayBtn").onclick =
  () => openWorkDayModal(today());

$("workDayForm").onsubmit =
  saveWorkDay;

$("workDayCheckIn").oninput =
  updateWorkDayPreview;

$("workDayCheckOut").oninput =
  updateWorkDayPreview;

$("workDayLunch").oninput =
  updateWorkDayPreview;

$("saveWorkSettingsBtn").onclick =
  saveWorkSettings;
  $("generateSummaryBtn").onclick = generateSummary;
  $("copySummaryBtn").onclick = copySummary;
  $("taskForm").onsubmit = saveTask;
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
      const b = e.target.closest("[data-action]");
      if (!b) return;
      const id = b.dataset.taskId;
      const a = b.dataset.action;
      if (a === "add-time") openTimeModal(id);
      if (a === "correction") openCorrectionModal(id);
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
const data={
  version:"2.1",
  exportedAt:new Date().toISOString(),

  tasks:state.tasks,
  workSessions:state.workSessions,
  corrections:state.corrections,
  activityLogs:state.activities,

  workDays:state.workDays,

  workSettings:state.workSettings
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
    for(const x of data.workDays||[]){
  const id=x.id;
  const copy={...x};
  delete copy.id;
  await importDoc("workDays",id,copy);
}

if(data.workSettings){
  await updateDoc(
    doc(db,"settings","workHours"),
    {
      dailyTargetMinutes:
        Number(data.workSettings.dailyTargetMinutes) || 480,

      openingFlexiMinutes:
        Number(data.workSettings.openingFlexiMinutes) || 0,

      updatedAt:serverTimestamp()
    }
  );
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

function subscribe() {
  onSnapshot(collection(db, "tasks"), (snap) => {
    state.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    populateProjects();
    renderTasks();
    updateDashboard();
  });
  onSnapshot(collection(db, "workSessions"), (snap) => {
    state.workSessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateDashboard();
    renderTasks();
  });
  onSnapshot(collection(db, "corrections"), (snap) => {
    state.corrections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateDashboard();
    renderTasks();
  });
  onSnapshot(collection(db, "activityLogs"), (snap) => {
    state.activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateDashboard();
    renderTasks();
  });
  onSnapshot(collection(db,"workDays"),snap=>{
  state.workDays =
    snap.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  updateDashboard();
  renderWorkHours();
});
}
function setConnection(online = true) {
  $("connectionDot").classList.toggle("offline", !online);
  $("connectionStatus").textContent = online ? "Online" : "Offline";
}
window.addEventListener("online", () => setConnection(true));
window.addEventListener("offline", () => setConnection(false));
$("taskType").addEventListener(
  "change",
  updateAssetTimePreview
);

$("taskAssetAmount").addEventListener(
  "input",
  updateAssetTimePreview
);
$("taskLoggedHours").addEventListener(
  "input",
  updateLoggedTimePreview
);
fillSelects();
initReportDates();
bindActions();
setConnection(navigator.onLine);

await loadWorkSettings();

subscribe();

renderWorkHours();

$("loadingScreen").classList.add("hidden");
$("app").classList.remove("hidden");
