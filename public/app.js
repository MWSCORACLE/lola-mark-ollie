"use strict";

const NAMES = { lola: "Lola", mark: "Mark", ollie: "Ollie", shared: "Together" };
const MOODS = ["Steady", "Happy", "Cozy", "Excited", "Stretched thin", "Anxious", "Tired"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOWS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

let whoami = localStorage.getItem("whoami") || "mark";
let viewMonth = new Date(); // month being shown on the calendar
let selectedDate = isoToday();

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, "0"); }
function partnerOf(who) { return who === "mark" ? "lola" : "mark"; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}
function post(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Navigation ----------
function show(screen) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById("screen-" + screen).classList.add("active");
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.screen === screen));
  window.scrollTo({ top: 0 });
  if (screen === "cal") renderCalendar();
  if (screen === "day") renderDay();
  if (screen === "compose") renderCompose();
  if (screen === "us") renderUs();
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    if (t.dataset.screen === "day" || t.dataset.screen === "compose") selectedDate = isoToday();
    show(t.dataset.screen);
  }));
document.getElementById("back-to-cal").addEventListener("click", () => show("cal"));
document.getElementById("back-to-day").addEventListener("click", () => show("day"));

// ---------- Who am I ----------
function renderWho() {
  document.getElementById("who-lola").classList.toggle("sel", whoami === "lola");
  document.getElementById("who-mark").classList.toggle("sel", whoami === "mark");
}
for (const who of ["lola", "mark"]) {
  document.getElementById("who-" + who).addEventListener("click", () => {
    whoami = who;
    localStorage.setItem("whoami", who);
    renderWho();
    const active = document.querySelector(".screen.active").id.replace("screen-", "");
    if (active === "compose") renderCompose();
    if (active === "day") renderDay();
    toast(`Hi, ${NAMES[who]}`);
  });
}

// ---------- Calendar ----------
document.getElementById("prev-month").addEventListener("click", () => {
  viewMonth.setMonth(viewMonth.getMonth() - 1);
  renderCalendar();
});
document.getElementById("next-month").addEventListener("click", () => {
  viewMonth.setMonth(viewMonth.getMonth() + 1);
  renderCalendar();
});

async function renderCalendar() {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const ym = `${y}-${pad(m + 1)}`;
  document.getElementById("cal-title").textContent = `${MONTHS[m]} ${y}`;

  const { events, entryDays } = await api(`/api/month/${ym}`);
  const eventsByDate = {};
  for (const ev of events) (eventsByDate[ev.date] ??= []).push(ev);
  const entriesByDate = Object.fromEntries(entryDays.map((r) => [r.date, r]));

  // Today's agenda strip
  const today = isoToday();
  const agenda = document.getElementById("agenda");
  const todayEvents = eventsByDate[today] ?? [];
  const partner = partnerOf(whoami);
  const partnerWrote = (entriesByDate[today]?.[partner] ?? 0) > 0;
  agenda.innerHTML =
    `<span class="when">Today</span>` +
    todayEvents.map((ev) =>
      `<span class="chip ${ev.who}">${esc(ev.title)}${ev.time ? " · " + esc(ev.time) : ""}</span>`
    ).join("") +
    (partnerWrote ? `<span class="chip lola">♥ ${NAMES[partner]} wrote to you</span>` : "") +
    `<button class="chip ghost" id="add-event-btn">+ Add event</button>`;
  document.getElementById("add-event-btn").addEventListener("click", () => openEventDialog(today));

  // Grid
  const grid = document.getElementById("cal-grid");
  grid.innerHTML = DOWS.map((d) => `<div class="dow">${d}</div>`).join("");
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let i = 0; i < first.getDay(); i++) grid.insertAdjacentHTML("beforeend", `<div class="day blank"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${ym}-${pad(d)}`;
    const evs = eventsByDate[iso] ?? [];
    const ent = entriesByDate[iso];
    const both = ent && ent.lola > 0 && ent.mark > 0;
    const dots = [...new Set(evs.map((e) => e.who))]
      .map((w) => `<i class="dot ${w}"></i>`).join("");
    const btn = document.createElement("button");
    btn.className = "day" + (iso === today ? " today" : "");
    btn.innerHTML =
      `<span class="num">${d}</span>` +
      (dots ? `<span class="marks">${dots}</span>` : "") +
      (both ? `<span class="wrote">♥</span>` : "");
    btn.addEventListener("click", () => { selectedDate = iso; show("day"); });
    grid.appendChild(btn);
  }
}

// ---------- Day view ----------
async function renderDay() {
  const data = await api(`/api/day/${selectedDate}`);
  document.getElementById("day-title").textContent = prettyDate(selectedDate);

  const evWrap = document.getElementById("day-events");
  evWrap.innerHTML =
    data.events.map((ev) =>
      `<span class="chip ${ev.who}">${esc(ev.title)}${ev.time ? " · " + esc(ev.time) : ""} · ${NAMES[ev.who]}</span>`
    ).join("") +
    `<button class="chip ghost" id="day-add-event">+ Add event</button>`;
  document.getElementById("day-add-event").addEventListener("click", () => openEventDialog(selectedDate));

  const byAuthor = {};
  for (const e of data.entries) byAuthor[e.author] = e;
  const partner = partnerOf(whoami);

  const side = (author) => {
    const e = byAuthor[author];
    const forWhom = NAMES[partnerOf(author)];
    const title =
      `<h3 class="col-title"><i class="dot ${author}"></i> From ${NAMES[author]}, for ${forWhom}</h3>`;
    if (!e) {
      const mine = author === whoami;
      return `<div>${title}<div class="empty-side">
        <span class="serif" style="display:block;color:var(--ink);margin-bottom:6px;">Nothing here yet.</span>
        ${mine
          ? `<button class="btn" id="write-now">Write today's five</button>`
          : `${NAMES[author]} hasn't written for this day.`}
      </div></div>`;
    }
    const card = (label, val) =>
      val ? `<div class="prompt-card"><div class="label">${label}</div><div class="answer">${esc(val)}</div></div>` : "";
    const mood = e.mood
      ? `<div class="prompt-card"><div class="label">How I'm feeling today</div>
         <div class="answer"><span class="chip ${author}" style="font-family:'Segoe UI',system-ui,sans-serif;">${esc(e.mood)}</span> ${esc(e.feeling_text ?? "")}</div></div>`
      : card("How I'm feeling today", e.feeling_text);
    return `<div>${title}
      ${card("A thing you do that I love", e.love_note)}
      ${mood}
      ${card("Something I'm excited for", e.excited)}
      ${card("A thought that might interest you", e.thought)}
    </div>`;
  };

  const goalChecks = data.entries.map((e) => e.goal_checkin).filter(Boolean);
  const goalTitle = data.goals[0]?.title ?? "Add a goal on the Us screen";
  const goalCard = `<div class="goal-card">
    <div class="label">A goal we're chasing together</div>
    <div class="answer">${esc(goalTitle)}${goalChecks.length ? " — " + goalChecks.map(esc).join(" ♥ ") : ""}</div>
  </div>`;

  const ollieCard = data.ollie
    ? `<div class="ollie-card"><div class="label">The Ollie report</div><div class="answer">${esc(data.ollie.text)}</div></div>`
    : "";

  document.getElementById("day-cols").innerHTML =
    side(partner) + side(whoami) + goalCard + ollieCard;

  const writeNow = document.getElementById("write-now");
  if (writeNow) writeNow.addEventListener("click", () => show("compose"));
}

// ---------- Compose ----------
let selectedMood = null;

async function renderCompose() {
  const partner = NAMES[partnerOf(whoami)];
  document.getElementById("compose-title").textContent =
    `${prettyDate(selectedDate)} — your five, for ${partner}`;
  document.getElementById("lbl-love").textContent = `A thing ${partner} does that you love`;
  document.getElementById("lbl-thought").textContent = `A thought that might interest ${partner}`;

  const data = await api(`/api/day/${selectedDate}`);
  const mine = data.entries.find((e) => e.author === whoami);
  document.getElementById("f-love").value = mine?.love_note ?? "";
  document.getElementById("f-feeling").value = mine?.feeling_text ?? "";
  document.getElementById("f-excited").value = mine?.excited ?? "";
  document.getElementById("f-thought").value = mine?.thought ?? "";
  document.getElementById("f-goal").value = mine?.goal_checkin ?? "";
  document.getElementById("f-ollie").value = data.ollie?.text ?? "";
  selectedMood = mine?.mood ?? null;

  const moodsWrap = document.getElementById("moods");
  moodsWrap.innerHTML = "";
  for (const m of MOODS) {
    const b = document.createElement("button");
    b.className = "mood-opt" + (m === selectedMood ? ` sel${whoami === "lola" ? " lola-sel" : ""}` : "");
    b.textContent = m;
    b.addEventListener("click", () => {
      selectedMood = selectedMood === m ? null : m;
      renderMoodSelection();
    });
    moodsWrap.appendChild(b);
  }
}
function renderMoodSelection() {
  document.querySelectorAll(".mood-opt").forEach((b) => {
    const on = b.textContent === selectedMood;
    b.classList.toggle("sel", on);
    b.classList.toggle("lola-sel", on && whoami === "lola");
  });
}

document.getElementById("save-entry").addEventListener("click", async () => {
  try {
    await post("/api/entries", {
      date: selectedDate,
      author: whoami,
      love_note: document.getElementById("f-love").value.trim() || null,
      mood: selectedMood,
      feeling_text: document.getElementById("f-feeling").value.trim() || null,
      excited: document.getElementById("f-excited").value.trim() || null,
      thought: document.getElementById("f-thought").value.trim() || null,
      goal_checkin: document.getElementById("f-goal").value.trim() || null,
    });
    const ollieText = document.getElementById("f-ollie").value.trim();
    if (ollieText) await post("/api/ollie", { date: selectedDate, text: ollieText, author: whoami });
    toast(`Saved — ${NAMES[partnerOf(whoami)]} can read it now ♥`);
    show("day");
  } catch (err) {
    toast(err.message);
  }
});

// ---------- Us ----------
async function renderUs() {
  const us = await api("/api/us");
  const wrap = document.getElementById("us-cards");

  const wedding = us.wedding.date ? new Date(us.wedding.date + "T00:00:00") : null;
  const daysOut = wedding ? Math.max(0, Math.ceil((wedding - new Date()) / 86400000)) : null;

  const goalCards = us.goals.map((g) => {
    const pct = g.target_value ? Math.min(100, Math.round(((g.current_value ?? 0) / g.target_value) * 100)) : null;
    return `<div class="xcard">
      <h3>${g.done ? "✓ " : ""}${esc(g.title)}</h3>
      <p>${g.target_value
        ? `${g.current_value ?? 0} of ${g.target_value} ${esc(g.unit ?? "")}`
        : esc(g.detail ?? "")}</p>
      ${pct !== null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}
      ${!g.done && g.target_value
        ? `<button class="btn small ghost" style="margin-top:10px" data-progress="${g.id}" data-title="${esc(g.title)}" data-value="${g.current_value ?? 0}">Update progress</button>`
        : ""}
    </div>`;
  }).join("");

  const streakHits = us.streak.filter((s) => s.both).length;
  const streakCard = `<div class="xcard">
    <h3>Writing streak</h3>
    <p>You've both written ${streakHits} of the last 7 days</p>
    <div class="streak-row">${us.streak.map((s) => `<span class="streak-day${s.both ? " hit" : ""}" title="${s.date}"></span>`).join("")}</div>
  </div>`;

  const weddingCard = `<div class="xcard">
    <h3>Wedding countdown</h3>
    <div class="big-count">${daysOut !== null ? daysOut + " days" : "—"}</div>
    <p>${esc(us.wedding.label ?? "")}</p>
  </div>`;

  const otdCard = us.onThisDay
    ? `<div class="xcard"><h3>From the archive</h3>
       <p class="serif" style="color:var(--ink);font-size:0.95rem;">${esc(us.onThisDay.date)} — “${esc(us.onThisDay.love_note)}”</p>
       <p>Written by ${NAMES[us.onThisDay.author]}</p></div>`
    : "";

  const aiNote = us.aiEnabled
    ? (us.aiKeyPresent ? "Claude writes the recap." : "AI is on, but no API key was found — using the local recap.")
    : "AI is off — recaps are assembled locally. Toggle below.";
  const recapCard = `<div class="xcard">
    <h3>Sunday recap</h3>
    ${us.lastRecap
      ? `<p>Week ending ${esc(us.lastRecap.week_end)} · ${us.lastRecap.source === "claude" ? "written by Claude" : "assembled locally"}</p>
         <div class="recap-body">${esc(us.lastRecap.body)}</div>`
      : `<p>No recap yet. Generate one for the current week.</p>`}
    <p style="margin-top:10px">${aiNote}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
      <button class="btn small shared-btn" id="gen-recap">Generate this week's recap</button>
      <button class="btn small ghost" id="toggle-ai">${us.aiEnabled ? "Turn AI off" : "Turn AI on"}</button>
    </div>
  </div>`;

  const newGoalCard = `<div class="xcard">
    <h3>New goal</h3>
    <p>Add something you want to chase together — a trip, a habit, a number.</p>
    <button class="btn small shared-btn" id="add-goal-btn">+ Add a goal</button>
  </div>`;

  wrap.innerHTML = weddingCard + goalCards + streakCard + otdCard + recapCard + newGoalCard;

  document.getElementById("add-goal-btn").addEventListener("click", openGoalDialog);
  document.getElementById("gen-recap").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Writing…";
    try {
      await post("/api/recap", {});
      renderUs();
    } catch (err) {
      toast(err.message);
      e.target.disabled = false;
      e.target.textContent = "Generate this week's recap";
    }
  });
  document.getElementById("toggle-ai").addEventListener("click", async () => {
    await post("/api/settings", { ai_enabled: us.aiEnabled ? "0" : "1" });
    renderUs();
  });
  wrap.querySelectorAll("[data-progress]").forEach((b) =>
    b.addEventListener("click", () => openProgressDialog(b.dataset.progress, b.dataset.title, b.dataset.value)));
}

// ---------- Dialogs ----------
const eventDialog = document.getElementById("event-dialog");
function openEventDialog(date) {
  document.getElementById("ev-date").value = date;
  document.getElementById("ev-title").value = "";
  document.getElementById("ev-time").value = "";
  document.getElementById("ev-who").value = "shared";
  eventDialog.showModal();
}
document.getElementById("ev-cancel").addEventListener("click", () => eventDialog.close());
document.getElementById("ev-save").addEventListener("click", async () => {
  try {
    await post("/api/events", {
      date: document.getElementById("ev-date").value,
      time: document.getElementById("ev-time").value || null,
      title: document.getElementById("ev-title").value.trim(),
      who: document.getElementById("ev-who").value,
    });
    eventDialog.close();
    toast("Added to the calendar");
    const active = document.querySelector(".screen.active").id.replace("screen-", "");
    if (active === "cal") renderCalendar();
    if (active === "day") renderDay();
  } catch (err) {
    toast(err.message);
  }
});

const goalDialog = document.getElementById("goal-dialog");
function openGoalDialog() {
  document.getElementById("g-title").value = "";
  document.getElementById("g-target").value = "";
  document.getElementById("g-unit").value = "";
  goalDialog.showModal();
}
document.getElementById("g-cancel").addEventListener("click", () => goalDialog.close());
document.getElementById("g-save").addEventListener("click", async () => {
  try {
    const target = document.getElementById("g-target").value;
    await post("/api/goals", {
      title: document.getElementById("g-title").value.trim(),
      target_value: target ? Number(target) : null,
      unit: document.getElementById("g-unit").value.trim() || null,
    });
    goalDialog.close();
    renderUs();
  } catch (err) {
    toast(err.message);
  }
});

const progressDialog = document.getElementById("progress-dialog");
let progressGoalId = null;
function openProgressDialog(id, title, value) {
  progressGoalId = id;
  document.getElementById("p-title").textContent = title;
  document.getElementById("p-value").value = value;
  progressDialog.showModal();
}
document.getElementById("p-cancel").addEventListener("click", () => progressDialog.close());
document.getElementById("p-save").addEventListener("click", async () => {
  try {
    await api(`/api/goals/${progressGoalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_value: Number(document.getElementById("p-value").value) }),
    });
    progressDialog.close();
    renderUs();
  } catch (err) {
    toast(err.message);
  }
});

// ---------- Init ----------
document.getElementById("today-label").textContent =
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
renderWho();
renderCalendar();
