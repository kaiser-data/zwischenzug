// Training by level: each day a few Lichess puzzles near the player's level (sessions/puzzles.js),
// solved the Zwischenzug way — the whole line, both sides, to the last capture, then Lock.
// Right on the first try: level +40. A miss on the way: level −40. The day's set stays fixed.
// A missed position comes back as "Again" two days later until it is right on the first try;
// repeats do not move the level. Difficulty: easier / at level / harder picks around level −200 / 0 / +200.
// Focus: mixed, or only puzzles tagged zwischenzug / long line / defence / endgame (`f` in puzzles.js).
// State lives in the store (state.training) and syncs.
(function () {
  const PUZZLES = window.PATH_PUZZLES || [];
  if (!PUZZLES.length) return;
  const START = 1500, STEP = 40, MIN = 800, MAX = 2800, PER_DAY = 3, NEAR = 100, AGAIN_AFTER = 2;
  const COUNTS = [3, 5, 10, 15, 20];
  const DIFFS = [[-200, "Easier"], [0, "At level"], [200, "Harder"]];
  const FOCUSES = [["", "Mixed"], ["z", "Zwischenzug"], ["l", "Long lines"], ["d", "Defence"], ["e", "Endgame"]];
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
  function pick(level, done, date, count, focus) {
    if (count === undefined) count = PER_DAY;
    let seed = 0;
    for (let i = 0; i < date.length; i++) seed = (seed * 31 + date.charCodeAt(i)) >>> 0;
    const pool = PUZZLES.filter(function (p) { return !(p.id in done) && (!focus || (p.f || "").indexOf(focus) >= 0); })
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
      title: "Today · " + (t.focus ? focusName(t.focus) + " · " : "") + list.length + " positions near " + ((t.level || START) + t.diff) + (again ? " (" + again + " again)" : ""),
      date: date,
      result: "",
      event: "Training",
      startFen: list[0].fen,
      logNote: "",
      steps: list.map(function (p, i) { return step(p, i, t.missed[p.id] || ""); })
    };
  }

  function focusName(f) {
    const hit = FOCUSES.find(function (x) { return x[0] === f; });
    return hit ? hit[1] : "";
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
    if (!FOCUSES.some(function (f) { return f[0] === t.focus; })) t.focus = "";
    return t;
  }

  function register() {
    const t = state();
    const date = today();
    if (!t.days[date] || !t.days[date].length) {
      const again = due(t, date, t.perDay);
      t.days[date] = again.concat(pick((t.level || START) + t.diff, t.done, date, t.perDay - again.length, t.focus));
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

  function setFocus(f) {
    const t = state();
    t.focus = FOCUSES.some(function (x) { return x[0] === f; }) ? f : "";
    return newSet();
  }

  function newSet() {
    const t = state();
    // A new level, count, difficulty or focus refills today's set: positions already solved today stay,
    // the unsolved ones are picked again. So after the day's 3, "10" gives 7 more.
    const date = today();
    const solved = (t.days[date] || []).filter(function (id) {
      return id in t.done && !(id in t.missed && t.missed[id] !== date);
    });
    const again = due(t, date, t.perDay).filter(function (id) { return solved.indexOf(id) < 0; })
      .slice(0, Math.max(0, t.perDay - solved.length));
    const done = Object.assign({}, t.done);
    again.forEach(function (id) { done[id] = 1; });
    t.days[date] = solved.concat(again, pick((t.level || START) + t.diff, done, date,
      Math.max(0, t.perDay - solved.length - again.length), t.focus));
    register();
    return store.commit();
  }

  function reloadToday() {
    const u = new URL(location.href);
    u.searchParams.set("session", "training-" + today());
    history.replaceState(null, "", u.toString());
    location.reload();             // the board reads the new set on load
  }

  // Above the board on a Training day: the level in one line, the settings one tap away.
  // Every choice is a button (aria-pressed marks the current one); the rating is typed in place.
  let settingsOpen = false;
  function levelBar() {
    const panel = document.getElementById("panel-session");
    const steps = document.getElementById("boardSteps");
    if (!panel || !steps || document.getElementById("trainingLevel")) return;
    const bar = document.createElement("div");
    bar.id = "trainingLevel";
    bar.className = "training-level hidden";
    steps.parentNode.insertBefore(bar, steps);
    function seg(id, attr, items, current) {
      return '<span class="seg" id="' + id + '" role="group">' + items.map(function (it) {
        const on = it[0] === current;
        return '<button type="button" ' + attr + '="' + it[0] + '" aria-pressed="' + on + '">' + it[1] + "</button>";
      }).join("") + "</span>";
    }
    function show() {
      const t = state();
      // The picker knows what is open now; the URL only at load time.
      const id = (document.getElementById("sessionPick") || {}).value || new URLSearchParams(location.search).get("session") || "";
      bar.classList.toggle("hidden", id.indexOf("training-") !== 0);
      const waiting = Object.keys(t.missed).length;
      const rate = '<form id="trainingRate" class="tl-rate' + (t.level && !settingsOpen ? " hidden" : "") + '">' +
        '<label>Your rating <span class="muted">(Lichess rapid or classical, or FIDE)</span>' +
        '<input type="number" inputmode="numeric" min="400" max="3200" step="10" value="' + (t.level || "") + '" placeholder="e.g. 1400"></label>' +
        '<button class="btn" type="submit">' + (t.level ? "Save" : "Start") + "</button></form>";
      bar.innerHTML = (t.level
        ? '<p class="tl-head">Your level <b id="trainingLevelValue">' + t.level + "</b>" +
          '<span class="muted"> · right on the first try +' + STEP + ", a miss −" + STEP +
          (waiting ? " · " + waiting + (waiting === 1 ? " miss comes" : " misses come") + " back to repeat" : "") + "</span>" +
          ' <button type="button" class="linkish" id="trainingSet" aria-expanded="' + settingsOpen + '">' +
          (settingsOpen ? "Close settings" : "Settings") + "</button></p>"
        : '<p class="tl-head"><b>Set your rating once</b> and every day brings positions near it. ' +
          '<button type="button" class="linkish" id="trainingSet" aria-expanded="' + settingsOpen + '">' +
          (settingsOpen ? "Close settings" : "Settings") + "</button></p>") + rate +
        '<div class="tl-rows' + (settingsOpen ? "" : " hidden") + '">' +
          '<div class="tl-row"><span class="tl-name">A day</span>' +
            seg("trainingCount", "data-count", COUNTS.map(function (n) { return [n, String(n)]; }), t.perDay) + "</div>" +
          '<div class="tl-row"><span class="tl-name">Difficulty</span>' + seg("trainingDiff", "data-diff", DIFFS, t.diff) + "</div>" +
          '<div class="tl-row"><span class="tl-name">Focus</span>' + seg("trainingFocus", "data-focus", FOCUSES, t.focus) + "</div>" +
          '<p class="muted tl-note">A change keeps what you solved today and picks the rest again.</p>' +
        "</div>";
      function on(sel, fn) {
        bar.querySelectorAll(sel).forEach(function (b) {
          b.addEventListener("click", function () {
            if (b.getAttribute("aria-pressed") === "true") return;
            fn(b).then(reloadToday);
          });
        });
      }
      on("[data-count]", function (b) { return setCount(parseInt(b.dataset.count, 10)); });
      on("[data-diff]", function (b) { return setDiff(parseInt(b.dataset.diff, 10)); });
      on("[data-focus]", function (b) { return setFocus(b.dataset.focus); });
      const toggle = document.getElementById("trainingSet");
      if (toggle) toggle.addEventListener("click", function () { settingsOpen = !settingsOpen; show(); });
      const form = document.getElementById("trainingRate");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        const input = form.querySelector("input");
        const n = parseInt(input.value, 10);
        if (!n || n < 400 || n > 3200) { input.setCustomValidity("A rating between 400 and 3200."); input.reportValidity(); return; }
        if (n === t.level) { settingsOpen = false; show(); return; }
        setLevel(n).then(reloadToday);
      });
      form.querySelector("input").addEventListener("input", function (e) { e.target.setCustomValidity(""); });
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

  // An invitee's own game comes first until every step of it is locked; then Training.
  function unfinishedOwnGame(st) {
    const viewer = window.PATH_VIEWER;
    const all = window.PATH_SESSIONS || {};
    if (!viewer || !viewer.player) return "";
    return Object.keys(all).filter(function (id) { return all[id].player === viewer.player; })
      .sort(function (a, b) { return String(all[b].date || "").localeCompare(String(all[a].date || "")); })
      .find(function (id) {
        const steps = ((st.progress || {})[id] || {}).steps || {};
        return (all[id].steps || []).some(function (x) { return !(steps[x.id] && steps[x.id].locked); });
      }) || "";
  }

  window.PathTraining = {
    START: START,
    STEP: STEP,
    pick: pick,
    // Called by index.html once the store is hydrated, before the board renders.
    prepare: function (s) {
      store = s;
      const viewer = window.PATH_VIEWER;
      const player = viewer && (window.PATH_PLAYERS || {})[viewer.player];
      if (player && player.level && !state().level) {
        state().level = clamp(player.level);
        store.commit();
      }
      const session = register();
      if (!session) return;
      const q = new URLSearchParams(location.search);
      let guest = false;
      try { guest = localStorage.getItem("zz_role") === "guest"; } catch (err) { guest = false; }
      if (q.get("session") === "training-today" || (!q.get("session") && guest)) {
        q.set("session", (!q.get("session") && unfinishedOwnGame(s.state)) || session.id);
        history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash);
      }
      levelBar();
    },
    setLevel: setLevel,
    setCount: setCount,
    setDiff: setDiff,
    setFocus: setFocus,
    // Tests: pretend today is another day.
    _today: function (fn) { today = fn; }
  };
})();
