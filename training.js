// Training by level: each day a few Lichess puzzles near the player's level (sessions/puzzles.js),
// solved the Zwischenzug way — the whole line, both sides, to the last capture, then Lock.
// Right on the first try: level +40. A miss on the way: level −40. The day's set stays fixed.
// A missed position comes back as "Again" two days later until it is right on the first try;
// repeats do not move the level. Difficulty: easier / at level / harder picks around level −200 / 0 / +200.
// State lives in the store (state.training) and syncs.
(function () {
  const PUZZLES = window.PATH_PUZZLES || [];
  if (!PUZZLES.length) return;
  const START = 1500, STEP = 40, MIN = 800, MAX = 2800, PER_DAY = 3, NEAR = 100, AGAIN_AFTER = 2;
  const COUNTS = [3, 5, 10];
  const DIFFS = [[-200, "Easier"], [0, "At level"], [200, "Harder"]];
  let store = null;
  let redrawBar = function () {};

  let today = function () {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  function clamp(n) { return Math.max(MIN, Math.min(MAX, Math.round(n))); }

  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

  // Misses due again (oldest first): at most one in three of the day's positions.
  function due(t, date, count) {
    return Object.keys(t.missed).filter(function (id) { return daysBetween(t.missed[id], date) >= AGAIN_AFTER && byId(id); })
      .sort(function (a, b) { return t.missed[a] < t.missed[b] ? -1 : t.missed[a] > t.missed[b] ? 1 : (a < b ? -1 : 1); })
      .slice(0, Math.max(1, Math.floor(count / 3)));
  }

  // Stable for a given day and level: the NEAR closest unseen puzzles, shuffled by the date.
  function pick(level, done, date, count) {
    count = count || PER_DAY;
    let seed = 0;
    for (let i = 0; i < date.length; i++) seed = (seed * 31 + date.charCodeAt(i)) >>> 0;
    const pool = PUZZLES.filter(function (p) { return !(p.id in done); })
      .sort(function (a, b) { return Math.abs(a.r - level) - Math.abs(b.r - level) || (a.id < b.id ? -1 : 1); })
      .slice(0, NEAR);
    for (let i = pool.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const j = seed % (i + 1);
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, count).sort(function (a, b) { return a.r - b.r; }).map(function (p) { return p.id; });
  }

  function byId(id) { return PUZZLES.find(function (p) { return p.id === id; }); }

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function step(p, i, again) {
    const side = p.fen.split(" ")[1] === "w" ? "White" : "Black";
    const themes = p.themes.length ? " Themes: " + p.themes.map(esc).join(", ") + "." : "";
    return {
      id: p.id,
      name: again ? "Again" : "Position " + (i + 1),
      title: side + " to move · rated " + p.r + (again ? " · missed on " + again : ""),
      prompt: "Calculate first, without moving pieces. Then write the whole line, both sides, to the last capture — and Lock.",
      fen: p.fen,
      type: "solve",
      solve: { line: p.line },
      questions: [],
      key: "<p>The line: <b>" + esc(p.line.join(" ")) + "</b>." + themes + "</p>" +
        '<p class="muted">Lichess puzzle ' + esc(p.id) + ' · <a href="https://lichess.org/training/' + esc(p.id) +
        '" target="_blank" rel="noopener">open on Lichess</a></p>'
    };
  }

  function sessionFor(t, date) {
    const list = t.days[date].map(byId).filter(Boolean);
    const again = list.filter(function (p) { return p.id in t.missed; }).length;
    return {
      id: "training-" + date,
      group: "Training",
      title: "Today · " + list.length + " positions near " + ((t.level || START) + t.diff) + (again ? " (" + again + " again)" : ""),
      date: date,
      result: "",
      event: "Training",
      startFen: list[0].fen,
      logNote: "",
      steps: list.map(function (p, i) { return step(p, i, t.missed[p.id] || ""); })
    };
  }

  function state() {
    const s = store.state;
    if (!s.training || typeof s.training !== "object") s.training = {};
    const t = s.training;
    t.days = t.days || {};
    t.done = t.done || {};
    t.missed = t.missed || {};
    if (COUNTS.indexOf(t.perDay) < 0) t.perDay = PER_DAY;
    if (!DIFFS.some(function (d) { return d[0] === t.diff; })) t.diff = 0;
    return t;
  }

  function register() {
    const t = state();
    const date = today();
    if (!t.days[date] || !t.days[date].length) {
      const again = due(t, date, t.perDay);
      t.days[date] = again.concat(pick((t.level || START) + t.diff, t.done, date, t.perDay - again.length));
    }
    if (!t.days[date].length) return null;
    const s = sessionFor(t, date);
    window.PATH_SESSIONS = window.PATH_SESSIONS || {};
    Object.keys(window.PATH_SESSIONS).forEach(function (id) {
      if (id.indexOf("training-") === 0 && id !== s.id) delete window.PATH_SESSIONS[id];
    });
    window.PATH_SESSIONS[s.id] = s;
    return s;
  }

  function setLevel(n) {
    const t = state();
    t.level = clamp(n);
    return newSet();
  }

  function setCount(n) {
    const t = state();
    t.perDay = COUNTS.indexOf(n) >= 0 ? n : PER_DAY;
    return newSet();
  }

  function setDiff(n) {
    const t = state();
    t.diff = DIFFS.some(function (d) { return d[0] === n; }) ? n : 0;
    return newSet();
  }

  function newSet() {
    const t = state();
    // A new level or count gives a new set today, unless one of today's is already solved.
    const date = today();
    const started = (t.days[date] || []).some(function (id) { return id in t.done; });
    if (!started) delete t.days[date];
    register();
    return store.commit();
  }

  function reloadToday() {
    const u = new URL(location.href);
    u.searchParams.set("session", "training-" + today());
    history.replaceState(null, "", u.toString());
    location.reload();             // the board reads the new set on load
  }

  function levelBar() {
    const panel = document.getElementById("panel-session");
    const steps = document.getElementById("boardSteps");
    if (!panel || !steps || document.getElementById("trainingLevel")) return;
    const bar = document.createElement("p");
    bar.id = "trainingLevel";
    bar.className = "muted training-level hidden";
    steps.parentNode.insertBefore(bar, steps);
    function show() {
      const t = state();
      const id = new URLSearchParams(location.search).get("session") || (document.getElementById("sessionPick") || {}).value || "";
      bar.classList.toggle("hidden", id.indexOf("training-") !== 0);
      const waiting = Object.keys(t.missed).length;
      bar.innerHTML = (t.level
        ? "Your level: <b>" + t.level + "</b>. Right on the first try +" + STEP + ", a miss −" + STEP + '. <a href="#" id="trainingSet">Change</a>'
        : 'Set your rating to get positions at your level. <a href="#" id="trainingSet">Set rating</a>') +
        '<br><span id="trainingCount">' + t.perDay + " a day</span> · " + COUNTS.filter(function (n) { return n !== t.perDay; })
          .map(function (n) { return '<a href="#" data-count="' + n + '">' + n + "</a>"; }).join(" · ") +
        '<br><span id="trainingDiff">' + DIFFS.map(function (d) {
          return d[0] === t.diff ? "<b>" + d[1] + "</b>" : '<a href="#" data-diff="' + d[0] + '">' + d[1] + "</a>";
        }).join(" · ") + "</span>" +
        (waiting ? " · " + waiting + (waiting === 1 ? " miss comes" : " misses come") + " back to repeat" : "");
      bar.querySelectorAll("[data-count]").forEach(function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          setCount(parseInt(a.dataset.count, 10)).then(reloadToday);
        });
      });
      bar.querySelectorAll("[data-diff]").forEach(function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          setDiff(parseInt(a.dataset.diff, 10)).then(reloadToday);
        });
      });
      document.getElementById("trainingSet").addEventListener("click", function (e) {
        e.preventDefault();
        const raw = window.prompt("Your rating (FIDE, or Lichess classical/rapid):", t.level || START);
        const n = parseInt(raw, 10);
        if (!n || n < 400 || n > 3200) return;
        setLevel(n).then(reloadToday);
      });
    }
    show();
    redrawBar = show;
    const pick = document.getElementById("sessionPick");
    if (pick) pick.addEventListener("change", show);
  }

  document.addEventListener("path:locked", function (e) {
    const d = e.detail || {};
    if (!store || !d.sessionId || d.sessionId.indexOf("training-") !== 0) return;
    const t = state();
    if (d.stepId in t.missed && d.stepId in t.done && t.missed[d.stepId] !== today()) {
      // A repeat: right on the first try clears it; another miss brings it back in two days.
      if (d.clean) delete t.missed[d.stepId]; else t.missed[d.stepId] = today();
    } else if (!(d.stepId in t.done)) {     // a redo the same day does not move the level twice
      t.done[d.stepId] = d.clean ? 1 : 0;
      t.level = clamp((t.level || START) + (d.clean ? STEP : -STEP));
      if (!d.clean) t.missed[d.stepId] = today();
    } else return;
    store.commit();
    redrawBar();
  });

  window.PathTraining = {
    START: START,
    STEP: STEP,
    pick: pick,
    // Called by index.html once the store is hydrated, before the board renders.
    prepare: function (s) {
      store = s;
      const session = register();
      if (!session) return;
      const q = new URLSearchParams(location.search);
      let guest = false;
      try { guest = localStorage.getItem("zz_role") === "guest"; } catch (err) { guest = false; }
      if (q.get("session") === "training-today" || (!q.get("session") && guest)) {
        q.set("session", session.id);
        history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash);
      }
      levelBar();
    },
    setLevel: setLevel,
    setCount: setCount,
    setDiff: setDiff,
    // Tests: pretend today is another day.
    _today: function (fn) { today = fn; }
  };
})();
