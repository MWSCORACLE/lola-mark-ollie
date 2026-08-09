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
  if (screen === "rent") renderRentals();
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

// ---------- Rentals ----------
const STATUS_LABELS = {
  toured: "Toured", shortlist: "Shortlist", applied: "Applied",
  passed: "Passed", chosen: "Chosen",
};
const VERDICT_LABELS = { comfortable: "Comfortable", tight: "Tight", over: "Over budget" };
const EXPENSE_CATEGORIES = [
  "Housing (current)", "Car & transport", "Debt", "Groceries", "Ollie",
  "Health", "Subscriptions", "Eating out", "Fun", "Savings", "Other",
];
let rentFilter = "";

function money(n) {
  return "$" + (Math.round(Number(n) || 0)).toLocaleString();
}
function patch(path, body) {
  return api(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del(path) {
  return api(path, { method: "DELETE" });
}

async function renderRentals() {
  const data = await api("/api/affordability" + (rentFilter ? `?status=${rentFilter}` : ""));
  renderRentHeadline(data);
  renderPlaces(data);
  renderMoney(data);
}

function renderRentHeadline(data) {
  const { headline, income, expenses, rules } = data;
  const hasIncome = income.net > 0;
  const wrap = document.getElementById("rent-headline");

  if (!hasIncome && !expenses.rows.length) {
    wrap.innerHTML = `<div class="xcard" style="grid-column:1/-1">
      <h3>Start with your money</h3>
      <p>Add what comes in and what goes out each month down below, then add the
      places you've toured. The math takes care of itself.</p>
    </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="xcard">
      <h3>We can spend up to</h3>
      <div class="big-count mark-num">${money(headline.max_housing)}<span style="font-size:1rem;font-weight:400;color:var(--muted)"> /mo</span></div>
      <div class="stat-note">on everything housing — rent, utilities, pet rent, parking, the lot.
      ${headline.max_housing_if_cut_everything > headline.max_housing
        ? `Cutting every flexible expense stretches it to <b>${money(headline.max_housing_if_cut_everything)}</b>.` : ""}</div>
    </div>
    <div class="xcard">
      <h3>Coming in</h3>
      <div class="big-count">${money(income.net)}<span style="font-size:1rem;font-weight:400;color:var(--muted)"> /mo</span></div>
      <div class="stat-note">average take-home, both of you together</div>
    </div>
    <div class="xcard">
      <h3>Going out (not housing)</h3>
      <div class="big-count lola-num">${money(expenses.ongoing_total)}<span style="font-size:1rem;font-weight:400;color:var(--muted)"> /mo</span></div>
      <div class="stat-note">${money(expenses.flexible_total)} of that is flexible if it comes to it${
        rules.savings_target > 0 ? ` · keeping ${money(rules.savings_target)}/mo set aside` : ""}</div>
    </div>`;
}

function renderPlaces(data) {
  const wrap = document.getElementById("rent-places");
  const { rentals, rules, income } = data;
  if (!rentals.length) {
    wrap.innerHTML = `<div class="empty-side" style="grid-column:1/-1">
      <span class="serif" style="display:block;color:var(--ink);margin-bottom:6px;">No places here yet.</span>
      Tour somewhere, then tap “+ Add a place” while it's fresh.
    </div>`;
    return;
  }

  wrap.innerHTML = rentals.map((r) => {
    const stars = r.rating ? "★".repeat(r.rating) + "☆".repeat(5 - r.rating) : "";
    const ratioPct = r.housing_ratio !== null ? Math.min(100, Math.round(r.housing_ratio * 100)) : null;
    const targetPct = Math.round(rules.ratio_target * 100);

    const bits = [
      ["rent", r.monthly.rent], ["utilities", r.monthly.utilities], ["internet", r.monthly.internet],
      ["insurance", r.monthly.insurance], ["Ollie", r.monthly.pet_rent], ["parking", r.monthly.parking],
      ["fees", r.monthly.other_monthly], ["commute", r.monthly.commute],
    ].filter(([, v]) => v > 0)
     .map(([k, v]) => `<span class="bit">${k} <b>${money(v)}</b></span>`).join("");

    let verdictLine;
    if (r.verdict === "comfortable") {
      verdictLine = `Leaves <b>${money(r.leftover)}</b> a month after everything.` +
        (r.months_to_save_move_in ? ` Move-in cash (${money(r.move_in.total)}) is about <b>${r.months_to_save_move_in} month${r.months_to_save_move_in === 1 ? "" : "s"}</b> of that.` : "");
    } else if (r.verdict === "over") {
      verdictLine = `Costs <b>${money(-r.leftover)}</b> more a month than everything you bring in.`;
    } else {
      const reasons = [];
      if (r.savings_gap > 0) reasons.push(`<b>${money(r.savings_gap)}</b> short of the cushion you want`);
      if (ratioPct !== null && ratioPct > targetPct) reasons.push(`housing would be <b>${ratioPct}%</b> of income (target ${targetPct}%)`);
      verdictLine = `Doable, but ${reasons.join(" and ")}.`;
    }

    let cutbacks = "";
    if (r.cutbacks.needed > 0 && r.leftover >= 0) {
      const items = r.cutbacks.cuts.map((c) =>
        `<li>${c.partial ? `Trim <b>${esc(c.name)}</b> by ${money(c.cut)} (now ${money(c.monthly)})` : `Drop <b>${esc(c.name)}</b> — saves ${money(c.cut)}`}</li>`
      ).join("");
      cutbacks = `<div class="cutbacks">
        <div class="label">To make it work, cut ${money(r.cutbacks.needed)}/mo</div>
        ${items ? `<ul>${items}</ul>` : ""}
        ${r.cutbacks.covered
          ? ""
          : `<p class="short">Even cutting everything flexible leaves you ${money(r.cutbacks.still_short)} short.</p>`}
      </div>`;
    } else if (r.verdict === "over") {
      cutbacks = `<div class="cutbacks">
        <div class="label">Can cutting back fix it?</div>
        ${r.cutbacks.covered && r.cutbacks.cuts.length
          ? `<ul>${r.cutbacks.cuts.map((c) => `<li>${c.partial ? `Trim <b>${esc(c.name)}</b> by ${money(c.cut)}` : `Drop <b>${esc(c.name)}</b> — saves ${money(c.cut)}`}</li>`).join("")}</ul>`
          : `<p class="short">No — even cutting everything flexible leaves you ${money(r.cutbacks.still_short)} short every month.</p>`}
      </div>`;
    }

    return `<div class="place ${r.verdict}${r.status === "passed" ? " passed" : ""}">
      <div class="place-head">
        <h4>${esc(r.name)}</h4>
        ${stars ? `<span class="stars-read">${stars}</span>` : ""}
        <span class="verdict ${r.verdict}">${VERDICT_LABELS[r.verdict]}</span>
      </div>
      <div class="addr">${esc(r.address ?? "")}${r.address && (r.beds || r.sqft) ? " · " : ""}${
        r.beds ? `${r.beds} bd` : ""}${r.beds && r.baths ? ` / ${r.baths} ba` : ""}${
        r.sqft ? ` · ${r.sqft} sqft` : ""} ${r.status !== "toured" ? `· ${STATUS_LABELS[r.status]}` : ""}</div>
      <div class="headline-row">
        <span class="amount">${money(r.monthly.total)}</span><span class="per">/mo all-in</span>
        ${r.move_in.total > 0 ? `<span class="per" style="margin-left:auto">${money(r.move_in.total)} to move in</span>` : ""}
      </div>
      ${ratioPct !== null ? `
      <div class="ratio-wrap">
        <div class="ratio ${r.verdict}"><i style="width:${ratioPct}%"></i></div>
        <span class="ratio-target" style="left:${Math.min(99, targetPct)}%"></span>
        <div class="ratio-legend"><span>${ratioPct}% of ${income.basis_label} income</span><span>target ${targetPct}%</span></div>
      </div>` : ""}
      ${bits ? `<div class="breakdown">${bits}</div>` : ""}
      <div class="verdict-line">${verdictLine}</div>
      ${cutbacks}
      ${r.notes ? `<p class="addr" style="margin-top:10px">“${esc(r.notes)}”</p>` : ""}
      <div class="place-actions">
        ${r.url ? `<a class="btn small ghost" href="${esc(r.url)}" target="_blank" rel="noopener">Listing ↗</a>` : ""}
        <button class="btn small ghost" data-edit-rental="${r.id}">Edit</button>
      </div>
    </div>`;
  }).join("");

  wrap.querySelectorAll("[data-edit-rental]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = data.rentals.find((x) => x.id === Number(b.dataset.editRental));
      openRentalDialog(r);
    }));
}

function renderMoney(data) {
  const wrap = document.getElementById("rent-money");
  const { income, expenses } = data;

  const incomeRows = income.rows.map((r) => `
    <button class="money-row" data-edit-income="${r.id}">
      <i class="dot ${r.who === "shared" ? "shared" : r.who}"></i>
      <span class="nm">${esc(r.label)} <span class="muted-note">· ${NAMES[r.who] ?? "Both"}</span></span>
      <span class="amt">${money(r.amount)}</span>
    </button>`).join("");

  const expenseRows = expenses.rows.map((e) => `
    <button class="money-row" data-edit-expense="${e.id}">
      <i class="dot ${e.who === "shared" ? "shared" : e.who}"></i>
      <span class="nm">${esc(e.name)} <span class="muted-note">· ${esc(e.category)}</span></span>
      ${e.replaced_by_move ? `<span class="tag gone">gone after move</span>` : e.essential ? "" : `<span class="tag flex">flexible</span>`}
      <span class="amt">${money(e.amount)}</span>
    </button>`).join("");

  wrap.innerHTML = `
    <div class="money-col">
      <h4><i class="dot mark"></i> Coming in each month</h4>
      ${incomeRows || `<div class="empty-side">Nothing yet — add both paychecks (use a low-month average if they vary).</div>`}
      ${income.rows.length ? `<div class="money-total"><span>Take-home together</span><span>${money(income.net)}</span></div>` : ""}
    </div>
    <div class="money-col">
      <h4><i class="dot lola"></i> Going out each month</h4>
      ${expenseRows || `<div class="empty-side">Nothing yet — car, groceries, debt, subscriptions, Ollie's kibble…</div>`}
      ${expenses.rows.length ? `<div class="money-total"><span>Total (after the move)</span><span>${money(expenses.ongoing_total)}</span></div>` : ""}
    </div>`;

  wrap.querySelectorAll("[data-edit-income]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = income.rows.find((x) => x.id === Number(b.dataset.editIncome));
      openIncomeDialog(r);
    }));
  wrap.querySelectorAll("[data-edit-expense]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = expenses.rows.find((x) => x.id === Number(b.dataset.editExpense));
      openExpenseDialog(r);
    }));
}

document.getElementById("rent-filter").addEventListener("change", (e) => {
  rentFilter = e.target.value;
  renderRentals();
});

// --- Rental dialog ---
const rentalDialog = document.getElementById("rental-dialog");
let editingRentalId = null;
let rentalRating = null;

function renderStars() {
  const wrap = document.getElementById("r-rating");
  wrap.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.className = "star" + (rentalRating >= i ? " on" : "");
    b.textContent = rentalRating >= i ? "★" : "☆";
    b.addEventListener("click", () => {
      rentalRating = rentalRating === i ? null : i;
      renderStars();
    });
    wrap.appendChild(b);
  }
}

const RENTAL_FIELD_IDS = {
  name: "r-name", address: "r-address", url: "r-url", toured_on: "r-toured",
  status: "r-status", beds: "r-beds", baths: "r-baths", sqft: "r-sqft",
  rent: "r-rent", utilities: "r-utilities", internet: "r-internet",
  insurance: "r-insurance", pet_rent: "r-pet-rent", parking: "r-parking",
  other_monthly: "r-other", commute: "r-commute", deposit: "r-deposit",
  pet_deposit: "r-pet-deposit", application_fee: "r-app-fee",
  move_in_other: "r-move-other", notes: "r-notes",
};

function openRentalDialog(r) {
  editingRentalId = r?.id ?? null;
  document.getElementById("r-heading").textContent = r ? "Edit this place" : "A place we toured";
  document.getElementById("r-delete").style.display = r ? "" : "none";
  for (const [field, id] of Object.entries(RENTAL_FIELD_IDS)) {
    const el = document.getElementById(id);
    const v = r?.[field];
    el.value = v === null || v === undefined || v === 0 ? (field === "status" ? "toured" : "") : v;
  }
  if (r?.status) document.getElementById("r-status").value = r.status;
  if (!r) document.getElementById("r-toured").value = isoToday();
  rentalRating = r?.rating ?? null;
  renderStars();
  rentalDialog.showModal();
}

document.getElementById("add-rental-btn").addEventListener("click", () => openRentalDialog(null));
document.getElementById("r-cancel").addEventListener("click", () => rentalDialog.close());
document.getElementById("r-delete").addEventListener("click", async () => {
  if (!editingRentalId) return;
  if (!confirm("Remove this place from the list?")) return;
  await del(`/api/rentals/${editingRentalId}`);
  rentalDialog.close();
  toast("Removed");
  renderRentals();
});
document.getElementById("r-save").addEventListener("click", async () => {
  try {
    const body = { rating: rentalRating };
    for (const [field, id] of Object.entries(RENTAL_FIELD_IDS)) {
      body[field] = document.getElementById(id).value.trim() || null;
    }
    if (!body.name) return toast("Give the place a name");
    body.status = body.status || "toured";
    if (editingRentalId) await patch(`/api/rentals/${editingRentalId}`, body);
    else await post("/api/rentals", body);
    rentalDialog.close();
    toast("Saved");
    renderRentals();
  } catch (err) {
    toast(err.message);
  }
});

// --- Income dialog ---
const incomeDialog = document.getElementById("income-dialog");
let editingIncomeId = null;

function openIncomeDialog(r) {
  editingIncomeId = r?.id ?? null;
  document.getElementById("i-heading").textContent = r ? "Edit income" : "Money coming in";
  document.getElementById("i-delete").style.display = r ? "" : "none";
  document.getElementById("i-who").value = r?.who ?? whoami;
  document.getElementById("i-label").value = r?.label ?? "";
  document.getElementById("i-amount").value = r?.amount || "";
  document.getElementById("i-gross").value = r?.gross_amount || "";
  incomeDialog.showModal();
}

document.getElementById("add-income-btn").addEventListener("click", () => openIncomeDialog(null));
document.getElementById("i-cancel").addEventListener("click", () => incomeDialog.close());
document.getElementById("i-delete").addEventListener("click", async () => {
  if (!editingIncomeId) return;
  await del(`/api/income/${editingIncomeId}`);
  incomeDialog.close();
  renderRentals();
});
document.getElementById("i-save").addEventListener("click", async () => {
  try {
    const body = {
      who: document.getElementById("i-who").value,
      label: document.getElementById("i-label").value.trim(),
      amount: Number(document.getElementById("i-amount").value) || 0,
      gross_amount: Number(document.getElementById("i-gross").value) || null,
    };
    if (!body.label) return toast("What should we call it?");
    if (editingIncomeId) await patch(`/api/income/${editingIncomeId}`, body);
    else await post("/api/income", body);
    incomeDialog.close();
    renderRentals();
  } catch (err) {
    toast(err.message);
  }
});

// --- Expense dialog ---
const expenseDialog = document.getElementById("expense-dialog");
let editingExpenseId = null;

function openExpenseDialog(r) {
  editingExpenseId = r?.id ?? null;
  document.getElementById("e-heading").textContent = r ? "Edit expense" : "Money going out";
  document.getElementById("e-delete").style.display = r ? "" : "none";
  const catSel = document.getElementById("e-category");
  catSel.innerHTML = EXPENSE_CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  if (r?.category && !EXPENSE_CATEGORIES.includes(r.category)) {
    catSel.insertAdjacentHTML("beforeend", `<option>${esc(r.category)}</option>`);
  }
  catSel.value = r?.category ?? "Other";
  document.getElementById("e-name").value = r?.name ?? "";
  document.getElementById("e-amount").value = r?.amount || "";
  document.getElementById("e-who").value = r?.who ?? "shared";
  document.getElementById("e-flexible").checked = r ? !r.essential : false;
  document.getElementById("e-replaced").checked = Boolean(r?.replaced_by_move);
  expenseDialog.showModal();
}

document.getElementById("add-expense-btn").addEventListener("click", () => openExpenseDialog(null));
document.getElementById("e-cancel").addEventListener("click", () => expenseDialog.close());
document.getElementById("e-delete").addEventListener("click", async () => {
  if (!editingExpenseId) return;
  await del(`/api/expenses/${editingExpenseId}`);
  expenseDialog.close();
  renderRentals();
});
document.getElementById("e-save").addEventListener("click", async () => {
  try {
    const body = {
      name: document.getElementById("e-name").value.trim(),
      category: document.getElementById("e-category").value,
      amount: Number(document.getElementById("e-amount").value) || 0,
      who: document.getElementById("e-who").value,
      essential: !document.getElementById("e-flexible").checked,
      replaced_by_move: document.getElementById("e-replaced").checked,
    };
    if (!body.name) return toast("What should we call it?");
    if (editingExpenseId) await patch(`/api/expenses/${editingExpenseId}`, body);
    else await post("/api/expenses", body);
    expenseDialog.close();
    renderRentals();
  } catch (err) {
    toast(err.message);
  }
});

// --- Budget rules dialog ---
const rulesDialog = document.getElementById("rules-dialog");
document.getElementById("edit-rules-btn").addEventListener("click", async () => {
  const settings = await api("/api/settings");
  document.getElementById("ru-ratio").value =
    Math.round((Number(settings.rent_ratio_target) || 0.3) * 100);
  document.getElementById("ru-savings").value = Number(settings.savings_target) || "";
  rulesDialog.showModal();
});
document.getElementById("ru-cancel").addEventListener("click", () => rulesDialog.close());
document.getElementById("ru-save").addEventListener("click", async () => {
  const pct = Number(document.getElementById("ru-ratio").value);
  await post("/api/settings", {
    rent_ratio_target: String((pct > 0 ? pct : 30) / 100),
    savings_target: String(Number(document.getElementById("ru-savings").value) || 0),
  });
  rulesDialog.close();
  renderRentals();
});

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
