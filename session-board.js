(function () {
  function sessions() {
    return window.PATH_SESSIONS || {};
  }
  // Newest first by optional `date`; undated sessions keep bundle order at the end.
  function orderedIds() {
    const all = sessions();
    return Object.keys(all).sort(function (a, b) {
      return String(all[b].date || "").localeCompare(String(all[a].date || ""));
    });
  }
  let requestedId = null;
  function currentId() {
    if (requestedId && sessions()[requestedId]) return requestedId;
    const q = new URLSearchParams(location.search).get("session");
    if (q && sessions()[q]) return q;
    return orderedIds()[0] || null;
  }

  let sessionId = null;
  let session = null;
  let step = 0;
  let game = null;
  let selected = null;
  let locked = [];
  let branchLocked = [];
  let activeBranch = 0;
  let ready = false;
  let stopPassed = false;
  let firstMiss = null;
  let stepStarted = 0;
  // Saved progress for the open session: { at, logged, steps: { [stepId]: entry } }.
  let progress = { at: "", logged: false, steps: {} };
  // Moves stepped back over, newest last. Only valid for the Chess object they came from,
  // so any `game = new Chess(...)` elsewhere drops them without extra bookkeeping.
  let future = [];
  let futureGame = null;

  function steps() { return (session && session.steps) || []; }
  function cur() { return steps()[step] || {}; }

  function pieceSVG(color, type) {
    const key = (color === "w" ? "w" : "b") + type.toUpperCase();
    return (window.CHESS_PIECES && window.CHESS_PIECES[key]) || "";
  }

  function renderBoard() {
    const boardEl = document.getElementById("chessBoard");
    if (!boardEl || !game) return;
    const files = "abcdefgh".split("");
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    boardEl.innerHTML = "";
    const last = game.history({ verbose: true }).slice(-1)[0];
    const legal = selected ? game.moves({ square: selected, verbose: true }) : [];
    const dests = new Set(legal.map(function (m) { return m.to; }));
    ranks.forEach(function (r, ri) {
      files.forEach(function (f, fi) {
        const sq = f + r;
        const piece = game.get(sq);
        const el = document.createElement("button");
        el.type = "button";
        el.className = "sq " + ((fi + ri) % 2 ? "dark" : "light");
        if (selected === sq) el.classList.add("sel");
        if (dests.has(sq)) el.classList.add("hint", piece ? "piece" : "empty");
        if (last && (last.from === sq || last.to === sq)) el.classList.add("last");
        if (piece) el.innerHTML = pieceSVG(piece.color, piece.type);
        if (r === 1) {
          const c = document.createElement("span");
          c.className = "coord file";
          c.textContent = f;
          el.appendChild(c);
        }
        if (f === "a") {
          const c = document.createElement("span");
          c.className = "coord rank";
          c.textContent = String(r);
          el.appendChild(c);
        }
        el.addEventListener("click", function () { onSquare(sq); });
        boardEl.appendChild(el);
      });
    });
    const turn = game.turn() === "w" ? "White" : "Black";
    const hist = game.history().join(" ");
    const need = mustPlayNow();
    const extra = need.length && !locked[step] ? " · need " + need.join(" ") : "";
    const ahead = aheadMoves();
    document.getElementById("boardStatus").textContent = turn + " to move" + (hist ? " · " + hist : "") +
      (ahead.length ? " · ▶ " + ahead.length + " more" : "") + extra;
    // Lichess analysis of the board as it stands; closed until Lock so the engine comes after his own line.
    const lichess = document.getElementById("boardLichess");
    if (lichess) {
      const open = !!locked[step];
      lichess.href = "https://lichess.org/analysis/standard/" + encodeURI(game.fen().replace(/ /g, "_")) +
        (startOf(cur().fen).black ? "?color=black" : "");
      lichess.classList.toggle("disabled", !open);
      lichess.setAttribute("aria-disabled", open ? "false" : "true");
      lichess.title = open ? "Open this board position in the Lichess analysis board" : "Lock first: your own line before the engine";
    }
    const take = document.getElementById("boardTake");
    if (take) {
      const n = boardLine().length;
      take.disabled = !n || !takesLine();
      take.textContent = "Use board line" + (n ? " (" + n + " ply)" : "");
      take.title = n ? "Put the line on the board into the answer" : "Play the line on the board first";
    }
    const back = document.getElementById("boardBack");
    if (back) {
      const atStart = !game.history().length;
      document.getElementById("boardStart").disabled = atStart;
      back.disabled = atStart;
      document.getElementById("boardFwd").disabled = !ahead.length;
      document.getElementById("boardEnd").disabled = !ahead.length;
    }
  }

  // The board stays playable after Lock so lines can be analysed and saved.
  function onSquare(sq) {
    const piece = game.get(sq);
    if (selected) {
      const move = game.move({ from: selected, to: sq, promotion: "q" });
      selected = null;
      if (move) keepFuture(move);
      if (!move && piece && piece.color === game.turn()) selected = sq;
      renderBoard();
      return;
    }
    if (piece && piece.color === game.turn()) {
      selected = sq;
      renderBoard();
    }
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  function renderQuestion(q) {
    const hint = q.hint ? "<span>" + esc(q.hint) + "</span>" : "";
    if (q.type === "textarea") {
      return "<label>" + esc(q.label) + hint + "<textarea name='" + esc(q.name) + "' required></textarea></label>";
    }
    if (q.type === "select") {
      const opts = (q.options || []).map(function (o) {
        return "<option value='" + esc(o.value) + "'>" + esc(o.label) + "</option>";
      }).join("");
      return "<label>" + esc(q.label) + hint + "<select name='" + esc(q.name) + "' required>" + opts + "</select></label>";
    }
    if (q.type === "triple") {
      const names = q.names || ["a", "b", "c"];
      const inputs = names.map(function (n, i) {
        return "<input name='" + esc(n) + "' type='text' required placeholder='" + (i + 1) + "'>";
      }).join("");
      return "<label>" + esc(q.label) + hint + "</label><div class='triple'>" + inputs + "</div>";
    }
    return "<label>" + esc(q.label) + hint + "<input name='" + esc(q.name) + "' type='text' required></label>";
  }

  function renderBranches() {
    const list = cur().branches;
    const host = document.getElementById("branchList");
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = "";
      host.classList.add("hidden");
      return;
    }
    host.classList.remove("hidden");
    host.innerHTML = list.map(function (b, i) {
      const cls = i === activeBranch ? "on" : (branchLocked[i] ? "done" : "");
      const mark = branchLocked[i] ? " ✓" : "";
      return "<button type='button' class='branch " + cls + "' data-i='" + i + "'>" + esc(b.label) + mark + "</button>";
    }).join("");
    host.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (locked[step]) return;
        activeBranch = Number(btn.dataset.i);
        game = new Chess(cur().fen);
        selected = null;
        renderBranches();
        renderBoard();
      });
    });
  }

  function renderSteps() {
    document.getElementById("boardSteps").innerHTML = steps().map(function (s, i) {
      const cls = i === step ? "on" : (locked[i] ? "done" : "");
      const now = i === step ? " aria-current='step'" : "";
      return "<button type='button' class='" + cls + "' data-i='" + i + "'" + now + ">" + esc(s.name) + "</button>";
    }).join("");
    // Any step, any time, both directions. A key still only comes from Lock.
    document.getElementById("boardSteps").querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const to = Number(btn.dataset.i);
        if (to === step) return;
        captureAnswers();
        saveProgress();
        loadStep(to);
      });
    });
    document.getElementById("boardTitle").textContent = cur().title || "";
    document.getElementById("boardPrompt").textContent = cur().prompt || "";
    const qs = cur().questions || [];
    const lead = cur().type === "stopPly" ? renderStopPly(cur().stopPly || {})
      : cur().type === "solve" ? renderSolve(cur().solve || {}) : "";
    const figure = document.getElementById("boardFigure");
    if (figure) {
      figure.innerHTML = renderFigure(cur());
      bindFigure(figure);
    }
    document.getElementById("boardForm").innerHTML = lead + qs.map(renderQuestion).join("");
    const take = document.getElementById("boardTake");
    if (take) take.addEventListener("click", function () { fillAnswer(boardLine()); });
    document.getElementById("boardKey").classList.remove("show");
    document.getElementById("boardKey").innerHTML = "";
    document.getElementById("boardErr").textContent = "";
    document.getElementById("boardNext").disabled = step >= steps().length - 1;
    document.getElementById("boardLock").disabled = locked[step];
    renderBranches();
    renderVariations();
  }

  function norm(s) { return (s || "").replace(/\s+/g, "").replace(/[+#]/g, ""); }

  // Stop-ply: name the reply that stopped you, then keep going. The continuation box is
  // not required, so an empty one reaches the grader and gets "that is ply 1".
  function renderStopPly(sp) {
    return "<label>After " + esc(sp.candidate) + ", which reply stopped you?<span>One move.</span>" +
      "<input name='scare' type='text' required></label>" +
      "<label>Now the moves after it<span>In order, until nothing can take back or check.</span>" +
      "<input name='continue' type='text'></label>" + takeButton();
  }

  // Board entry for written lines: one click copies the board's line into the answer; Lock still grades it.
  function takeButton() {
    return "<div class='row'><button type='button' class='btn ghost' id='boardTake' disabled>Use board line</button></div>";
  }

  // Optional source image and links shown before Lock (e.g. the book diagram to compare with the board).
  function renderFigure(s) {
    if (!s.image && !(s.links || []).length) return "";
    const img = s.image ? "<a href='" + esc(s.image) + "' target='_blank'><img src='" + esc(s.image) + "' alt='" + esc(s.caption || "source diagram") + "'></a>" : "";
    const links = (s.links || []).map(function (l) {
      return "<a href='" + esc(l.href) + "' target='_blank' rel='noopener'>" + esc(l.label) + "</a>";
    }).join("");
    // Collapsible so the board can be the only diagram; the open/closed choice carries across steps.
    return "<details class='step-figure'" + (figureOpen() ? " open" : "") + "><summary>" + (s.image ? "Book diagram" : "Source") + "</summary>" +
      "<figure>" + img + "<figcaption>" + esc(s.caption || "") + (links ? "<span class='links'>" + links + "</span>" : "") + "</figcaption></figure></details>";
  }

  const FIGURE_KEY = "zwischenzug_figure_open";
  function figureOpen() {
    try { return localStorage.getItem(FIGURE_KEY) !== "0"; } catch (e) { return true; }
  }
  function bindFigure(host) {
    const d = host && host.querySelector("details.step-figure");
    if (!d) return;
    d.addEventListener("toggle", function () {
      try { localStorage.setItem(FIGURE_KEY, d.open ? "1" : "0"); } catch (e) { /* ignore */ }
    });
  }

  // Solve: write the whole line from the first move; graded ply by ply against solve.line.
  function renderSolve(sp) {
    const n = (sp.line || []).length;
    return "<label>Your line, from the first move<span>The book's line is " + n + " ply. Calculate all of it first, then type it or play it on the board and press Use board line.</span>" +
      "<input name='line' type='text' required></label>" + takeButton();
  }

  function gradeSolve(s, form) {
    const line = (s.solve && s.solve.line) || [];
    const have = tokens(form.elements.line && form.elements.line.value);
    if (!have.length) return { ok: false, msg: "Write the first move." };
    const g = new Chess(s.fen);
    for (let i = 0; i < line.length; i++) {
      const ply = i + 1;
      if (i >= have.length) {
        return { ok: false, at: i, miss: { result: "short", ply: i },
          msg: "You stopped at ply " + i + ". The book's line is " + line.length + " ply. What happens next?" };
      }
      const mv = g.move(have[i], { sloppy: true });
      if (!mv) return { ok: false, at: i, msg: "Ply " + ply + ": " + have[i] + " is not legal there, or it is ambiguous (write Rexe5, R8xf6). Set it up on the board and look again." };
      if (norm(mv.san) !== norm(line[i])) {
        if (i === 0) {
          return { ok: false, at: 0, miss: { result: "wrong" },
            msg: "Not the book's first move. Before the obvious move, look for one in between: a check, a capture, a threat." };
        }
        return { ok: false, at: i, miss: { result: "short", ply: i },
          msg: "Ply " + ply + ": " + have[i] + " leaves the book's line. " + (i % 2 ? "Which reply is the most testing?" : "Look again from there.") };
      }
    }
    return { ok: true };
  }

  function tokens(text) {
    return String(text || "")
      .replace(/…/g, " ")
      .replace(/(^|\s)\d+\s*\.+/g, " ")
      .split(/[\s,;]+/)
      .map(function (t) { return norm(t).replace(/^\.+/, "").replace(/[.!?]+$/, ""); })
      .filter(Boolean);
  }

  function startsWith(have, prefix) {
    return have.length >= prefix.length && prefix.every(function (m, i) { return have[i] === norm(m); });
  }

  function gradeStopPly(s, form) {
    const sp = s.stopPly || {};
    const cont = sp.continue || [];
    // Accept the whole line typed into the first box too.
    const all = tokens(form.elements.scare && form.elements.scare.value)
      .concat(tokens(form.elements["continue"] && form.elements["continue"].value));
    // `at` counts plies from the step position (the candidate is the first), for rewinding a board-entered line.
    if (all[0] !== norm(sp.scare)) {
      return { ok: false, at: 1, msg: "After " + sp.candidate + ", that is not the reply that stopped you. Which move was it?" };
    }
    const rest = all.slice(1);
    if (!rest.length) {
      return { ok: false, at: 2, msg: "That is ply 1. " + sp.scare + " is where you stopped. Write the moves after it." };
    }
    const mix = (sp.mixups || []).find(function (m) { return startsWith(rest, m.match || []); });
    if (mix && !startsWith(rest, cont)) {
      return { ok: false, contrast: mix, msg: "Not that line. The board shows where it goes. Reset position, then write it again." };
    }
    const g = new Chess(s.fen);
    g.move(sp.candidate, { sloppy: true });
    g.move(sp.scare, { sloppy: true });
    for (let i = 0; i < cont.length; i++) {
      const ply = i + 2;
      if (i >= rest.length) {
        return { ok: false, at: i + 2, msg: "You stopped at ply " + (ply - 1) + " (" + (i ? rest[i - 1] : sp.scare) + "). Can anything still capture or check? Keep going." };
      }
      const mv = g.move(rest[i], { sloppy: true });
      if (!mv) return { ok: false, at: i + 2, msg: "Ply " + ply + ": " + rest[i] + " is not legal there. Set it up on the board and look again." };
      if (norm(mv.san) !== norm(cont[i])) {
        return { ok: false, at: i + 2, msg: "Ply " + ply + ": " + rest[i] + " is not the critical move. Look again from there." };
      }
    }
    return { ok: true };
  }

  function showContrast(s, mix) {
    game = new Chess(s.fen);
    (mix.line || []).forEach(function (m) { game.move(m, { sloppy: true }); });
    selected = null;
    renderBoard();
    const key = document.getElementById("boardKey");
    key.innerHTML = mix.key || "";
    key.classList.add("show");
  }

  function mustPlayNow() {
    const s = cur();
    if (s.type === "stopPly") {
      const sp = s.stopPly || {};
      // Hidden until the written line passes, so the status bar cannot give it away.
      return stopPassed ? [sp.candidate, sp.scare].concat(sp.continue || []) : [];
    }
    if (s.type === "solve") return stopPassed ? ((s.solve && s.solve.line) || []) : [];
    if (s.branches && s.branches.length) return s.branches[activeBranch].mustPlay || [];
    return s.mustPlay || [];
  }

  function historyMatches(need) {
    const h = game.history().map(norm);
    if (!need.length) return true;
    if (h.length < need.length) return false;
    return need.every(function (m, i) { return h[i] === norm(m); });
  }

  function lockStep() {
    const form = document.getElementById("boardForm");
    const s = cur();
    const missing = Array.from(form.querySelectorAll("[required]")).filter(function (el) {
      return !String(el.value || "").trim();
    });
    if (missing.length) {
      document.getElementById("boardErr").textContent = "Fill every field.";
      missing[0].focus();
      return;
    }
    if ((s.type === "stopPly" || s.type === "solve") && !stopPassed) {
      const graded = s.type === "solve" ? gradeSolve(s, form) : gradeStopPly(s, form);
      if (!graded.ok) {
        if (graded.miss && !firstMiss) firstMiss = graded.miss;
        const onBoard = boardLine();
        if (graded.contrast) {
          showContrast(s, graded.contrast);
        } else if (graded.at != null && onBoard.length && sameLine(onBoard, writtenLine(s, form))) {
          // The line came from the board: keep it, stand at the ply that went wrong, the rest stays ahead (▶).
          rewindTo(onBoard, graded.at);
        } else if (game.history().length || document.getElementById("boardKey").innerHTML) {
          // Drop a comparison board left over from an earlier mix-up.
          game = new Chess(s.fen);
          selected = null;
          renderBoard();
          document.getElementById("boardKey").classList.remove("show");
          document.getElementById("boardKey").innerHTML = "";
        }
        document.getElementById("boardErr").textContent = graded.msg;
        return;
      }
      stopPassed = true;
      document.getElementById("boardKey").classList.remove("show");
      document.getElementById("boardKey").innerHTML = "";
      renderVariations();
      // A line entered from the board is already played; only replay to its end.
      if (!historyMatches(mustPlayNow()) && startsWith(boardLine().map(norm), mustPlayNow())) {
        while (stepForward()) { /* replay */ }
      }
      if (!historyMatches(mustPlayNow())) {
        game = new Chess(s.fen);
        selected = null;
        renderBoard();
        document.getElementById("boardErr").textContent = "Right. Now play it on the board: " + mustPlayNow().join(" ");
        return;
      }
    }
    const need = mustPlayNow();
    if (!historyMatches(need)) {
      document.getElementById("boardErr").textContent = "On the board play: " + need.join(" ");
      return;
    }
    if (s.branches && s.branches.length) {
      branchLocked[activeBranch] = true;
      const bkey = s.branches[activeBranch].key || "";
      document.getElementById("boardKey").innerHTML = bkey;
      document.getElementById("boardKey").classList.add("show");
      const nextOpen = branchLocked.indexOf(false);
      if (nextOpen !== -1) {
        // Jump to the next unplayed line; the key of the one just locked stays visible.
        activeBranch = nextOpen;
        game = new Chess(s.fen);
        selected = null;
        renderBranches();
        renderBoard();
        const left = branchLocked.filter(function (x) { return !x; }).length;
        document.getElementById("boardErr").textContent =
          "Locked. Now play: " + s.branches[nextOpen].label + " (" + left + " left)";
        return;
      }
      renderBranches();
    }
    locked[step] = true;
    captureAnswers();
    const entry = entryFor(stepId(step));
    entry.locked = true;
    entry.passed = stopPassed;
    entry.branches = (cur().branches || []).filter(function (b, i) { return branchLocked[i]; })
      .map(function (b) { return b.id; });
    saveProgress();
    const key = document.getElementById("boardKey");
    key.innerHTML = (s.branches && s.branches.length ? key.innerHTML : "") + (s.key || "");
    key.classList.add("show");
    document.getElementById("boardLock").disabled = true;
    document.getElementById("boardNext").disabled = step >= steps().length - 1;
    document.getElementById("boardErr").textContent = "";
    renderBoard();
    renderVariations();
    const logAs = session.logAs || {};
    if (step === steps().length - 1 && logAs.kind === "aagaard" && typeof window.pathLogAagaard === "function") {
      // The first failed attempt decides the log entry; a clean first write is a full line.
      const miss = firstMiss || { result: "full" };
      window.pathLogAagaard({
        date: new Date().toISOString().slice(0, 10),
        chapter: logAs.chapter,
        exercise: logAs.exercise,
        minutes: Math.max(1, Math.round((Date.now() - stepStarted) / 60000)),
        result: miss.result,
        ply: miss.ply || null,
        note: "board drill",
      });
    } else if (step === steps().length - 1 && typeof window.pathLogGame === "function") {
      const noteEl = form.note;
      window.pathLogGame({
        date: new Date().toISOString().slice(0, 10),
        event: session.event || session.id,
        result: session.result || "",
        tag: (form.tag && form.tag.value) || "calculation",
        note: (noteEl && noteEl.value) || session.logNote || "",
      });
    }
  }

  function stepId(n) {
    const s = steps()[n] || {};
    return s.id || ("step" + n);
  }

  function entryFor(id) {
    if (!progress.steps[id]) {
      progress.steps[id] = { locked: false, passed: false, answers: {}, branches: [] };
    }
    return progress.steps[id];
  }

  // The form is rebuilt by renderSteps, so answers are read out before leaving a step.
  function captureAnswers() {
    const form = document.getElementById("boardForm");
    if (!form || !session) return;
    const answers = {};
    Array.from(form.elements).forEach(function (el) {
      if (el.name) answers[el.name] = el.value;
    });
    entryFor(stepId(step)).answers = answers;
  }

  function restoreAnswers(entry) {
    const form = document.getElementById("boardForm");
    if (!form) return;
    Object.keys(entry.answers || {}).forEach(function (name) {
      const el = form.elements[name];
      if (el && typeof el.value === "string") el.value = entry.answers[name];
    });
  }

  function saveProgress() {
    if (!sessionId || typeof window.pathProgress !== "object") return;
    progress.at = stepId(step);
    // Visiting a step creates an entry; storing the empty ones would grow the blob
    // for nothing and keep a session "started" that was only looked at.
    Object.keys(progress.steps).forEach(function (id) {
      const e = progress.steps[id];
      const empty = !e.locked && !e.passed && !e.branches.length
        && !Object.keys(e.answers || {}).some(function (k) { return String(e.answers[k] || "").trim(); });
      if (empty) delete progress.steps[id];
    });
    window.pathProgress.set(sessionId, progress);
  }

  function loadStep(n) {
    step = n;
    activeBranch = 0;
    firstMiss = null;
    stepStarted = Date.now();
    const entry = entryFor(stepId(n));
    stopPassed = !!entry.passed;
    branchLocked = (cur().branches || []).map(function (b) {
      return entry.branches.indexOf(b.id) !== -1;
    });
    locked[n] = !!entry.locked;
    game = new Chess(cur().fen);
    selected = null;
    renderSteps();
    restoreAnswers(entry);
    if (locked[n]) {
      const key = document.getElementById("boardKey");
      key.innerHTML = (cur().branches || []).map(function (b) { return b.key || ""; }).join("")
        + (cur().key || "");
      key.classList.add("show");
    }
    renderBoard();
    saveProgress();
  }

  function renderPicker() {
    const wrap = document.getElementById("sessionPickWrap");
    const sel = document.getElementById("sessionPick");
    if (!wrap || !sel) return;
    const ids = orderedIds();
    wrap.classList.toggle("hidden", ids.length <= 1);
    function option(id) {
      const s = sessions()[id];
      const label = (s.date ? s.date + " · " : "") + (s.title || id) + (s.result ? " · " + s.result : "");
      return "<option value='" + esc(id) + "'>" + esc(label) + "</option>";
    }
    // Optional `group` puts sessions under an optgroup; ungrouped ones are "Games".
    const groups = [];
    ids.forEach(function (id) {
      const name = sessions()[id].group || "Games";
      let g = groups.find(function (x) { return x.name === name; });
      if (!g) { g = { name: name, ids: [] }; groups.push(g); }
      g.ids.push(id);
    });
    sel.innerHTML = groups.length > 1
      ? groups.map(function (g) {
          return "<optgroup label='" + esc(g.name) + "'>" + g.ids.map(option).join("") + "</optgroup>";
        }).join("")
      : ids.map(option).join("");
    sel.value = sessionId || "";
  }

  function loadSession(id) {
    sessionId = id;
    session = id ? sessions()[id] : null;
    progress = (typeof window.pathProgress === "object" && id)
      ? window.pathProgress.get(id)
      : { at: "", logged: false, steps: {} };
    locked = steps().map(function (s, i) {
      const e = progress.steps[stepId(i)];
      return !!(e && e.locked);
    });
    renderPicker();
    if (!session) {
      document.getElementById("boardTitle").textContent = "No session loaded";
      document.getElementById("boardPrompt").textContent = "Add sessions/*.json and run python3 scripts/bundle_sessions.py";
      return false;
    }
    // Resume where he was; an id that no longer exists falls back to the first step.
    let at = 0;
    steps().forEach(function (s, i) { if (stepId(i) === progress.at) at = i; });
    loadStep(at);
    return true;
  }

  // Board navigation: back keeps the moves, forward replays them, a new move drops them.
  function aheadMoves() { return futureGame === game ? future : []; }

  function keepFuture(move) {
    const ahead = aheadMoves();
    if (ahead.length && norm(ahead[ahead.length - 1]) === norm(move.san)) ahead.pop();
    else future = [];
  }

  function stepBack() {
    if (futureGame !== game) { future = []; futureGame = game; }
    const m = game.undo();
    if (!m) return false;
    future.push(m.san);
    selected = null;
    return true;
  }

  function stepForward() {
    const ahead = aheadMoves();
    const san = ahead.pop();
    if (!san) return false;
    game.move(san, { sloppy: true });
    selected = null;
    return true;
  }

  function navigate(dir) {
    if (!game) return;
    if (dir === "back") stepBack();
    else if (dir === "fwd") stepForward();
    else if (dir === "start") { while (stepBack()) { /* rewind */ } }
    else if (dir === "end") { while (stepForward()) { /* replay */ } }
    renderBoard();
  }

  // Put a saved line on the board at the start position, ready to step through with ▶ / →.
  function showLine(moves) {
    rewindTo(moves, 0);
  }

  // Play the first `at` moves of a line and keep the rest ahead of the board.
  function rewindTo(moves, at) {
    game = new Chess(cur().fen);
    moves.slice(0, at).forEach(function (m) { game.move(m, { sloppy: true }); });
    futureGame = game;
    future = moves.slice(at).reverse();
    selected = null;
    renderBoard();
  }

  // The whole line on the board from the step position, including moves stepped back over.
  function boardLine() {
    return game ? game.history().concat(aheadMoves().slice().reverse()) : [];
  }

  function takesLine() {
    const t = cur().type;
    return (t === "solve" || t === "stopPly") && !stopPassed && !locked[step];
  }

  // What the answer boxes say, as plies from the step position.
  function writtenLine(s, form) {
    if (s.type === "solve") return tokens(form.elements.line && form.elements.line.value);
    const sp = s.stopPly || {};
    return [norm(sp.candidate)].concat(tokens(form.elements.scare && form.elements.scare.value),
      tokens(form.elements["continue"] && form.elements["continue"].value));
  }

  function sameLine(a, b) {
    return a.length === b.length && a.every(function (m, i) { return norm(m) === norm(b[i]); });
  }

  // Write a line into the answer boxes so it need not be typed. Lock still grades it.
  function fillAnswer(moves) {
    const form = document.getElementById("boardForm");
    const err = document.getElementById("boardErr");
    const s = cur();
    if (!takesLine() || !form) return false;
    if (!moves.length) {
      err.textContent = "Play the line on the board first.";
      return false;
    }
    let box;
    if (s.type === "solve") {
      box = form.elements.line;
      box.value = numbered(s.fen, moves);
    } else {
      const sp = s.stopPly || {};
      if (norm(moves[0]) !== norm(sp.candidate)) {
        err.textContent = "Start the board line with " + sp.candidate + ", then the reply that stopped you.";
        return false;
      }
      if (moves.length < 2) {
        err.textContent = "Now play the reply that stopped you, and the moves after it.";
        return false;
      }
      form.elements.scare.value = moves[1];
      box = form.elements["continue"];
      box.value = numbered(s.fen, moves.slice(2), 2);
    }
    err.textContent = moves.length + " ply written from the board. Is the last one really the end? Then Lock.";
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    return true;
  }

  // Saved variations: lines played on the board, stored per session step through
  // window.pathVariations (index.html state, so they are part of the JSON export).
  function varKey() { return (sessionId || "") + ":" + (cur().id || step); }
  function varGet() { return window.pathVariations ? window.pathVariations.get(varKey()) : []; }
  function varSet(list) { if (window.pathVariations) window.pathVariations.set(varKey(), list); }

  function startOf(fen) {
    const p = String(fen || "").split(" ");
    return { n: Number(p[5]) || 1, black: p[1] === "b" };
  }

  // Numbered SAN; `skip` plies from the position already played before `moves` start.
  function numbered(fen, moves, skip) {
    const s = startOf(fen);
    let n = s.n, black = s.black;
    for (let k = 0; k < (skip || 0); k++) {
      if (black) n++;
      black = !black;
    }
    return moves.map(function (m, i) {
      const t = black ? (i === 0 ? n + "... " + m : m) : n + ". " + m;
      if (black) n++;
      black = !black;
      return t;
    }).join(" ");
  }

  // Merge saved lines into one tree: the first saved line is the main line, later ones become side lines.
  function pgnMoves(fen, lines) {
    const root = { kids: [], notes: [] };
    lines.forEach(function (l) {
      let node = root;
      l.moves.forEach(function (m) {
        let k = node.kids.find(function (x) { return x.san === m; });
        if (!k) { k = { san: m, kids: [], notes: [] }; node.kids.push(k); }
        node = k;
      });
      if (l.note && node !== root) node.notes.push(l.note);
    });
    const s = startOf(fen);
    function tok(node, ply, force) {
      const black = s.black ? ply % 2 === 0 : ply % 2 === 1;
      const n = s.n + Math.floor((ply + (s.black ? 1 : 0)) / 2);
      const num = !black ? n + ". " : (force ? n + "... " : "");
      return num + node.san + node.notes.map(function (c) { return " {" + c.replace(/[{}]/g, "") + "}"; }).join("");
    }
    function walk(node, ply, force) {
      if (!node.kids.length) return "";
      const main = node.kids[0];
      let out = tok(main, ply, force);
      node.kids.slice(1).forEach(function (a) {
        out += " (" + tok(a, ply, true) + after(a, ply + 1, a.notes.length > 0) + ")";
      });
      return out + after(main, ply + 1, node.kids.length > 1 || main.notes.length > 0);
    }
    function after(node, ply, force) {
      const r = walk(node, ply, force);
      return r ? " " + r : "";
    }
    return walk(root, 0, true);
  }

  function pgnText(fen, lines) {
    const tag = function (k, v) { return "[" + k + " \"" + String(v).replace(/"/g, "'") + "\"]\n"; };
    return tag("Event", (session && session.title) || sessionId || "Zwischenzug") +
      (session && session.url ? tag("Site", session.url) : "") +
      tag("Annotator", "Zwischenzug") + tag("SetUp", "1") + tag("FEN", fen) + tag("Result", "*") +
      "\n" + pgnMoves(fen, lines) + " *\n";
  }

  function copyText(text) {
    const msg = document.getElementById("varMsg");
    function done(ok) { if (msg) msg.textContent = ok ? "Copied." : "Copy blocked: select the text below and copy it."; }
    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }

  function renderVariations() {
    const list = document.getElementById("varList");
    if (!list) return;
    const lines = varGet();
    const fen = cur().fen;
    list.innerHTML = lines.length
      ? lines.map(function (l, i) {
          return "<li><span class='var-line'>" + esc(numbered(fen, l.moves)) + "</span>" +
            (l.note ? "<div class='muted'>" + esc(l.note) + "</div>" : "") +
            "<div class='row'>" + (takesLine() ? "<button type='button' class='btn ghost' data-var-use='" + i + "'>Use as answer</button>" : "") +
            "<button type='button' class='btn ghost' data-var-show='" + i + "'>Show</button>" +
            "<button type='button' class='btn ghost' data-var-copy='" + i + "'>Copy</button>" +
            "<button type='button' class='btn ghost' data-var-del='" + i + "'>Delete</button></div></li>";
        }).join("")
      : "<li class='muted'>No saved lines for this position. Play one on the board, then Save line.</li>";
    document.getElementById("varCopyPgn").disabled = !lines.length;
    const pgn = document.getElementById("varPgn");
    if (pgn && !pgn.classList.contains("hidden")) pgn.value = lines.length ? pgnText(fen, lines) : "";
    list.querySelectorAll("[data-var-copy]").forEach(function (b) {
      b.addEventListener("click", function () { copyText(numbered(fen, lines[Number(b.dataset.varCopy)].moves)); });
    });
    list.querySelectorAll("[data-var-use]").forEach(function (b) {
      b.addEventListener("click", function () {
        const moves = lines[Number(b.dataset.varUse)].moves;
        // Also on the board, so a miss can rewind to the ply and Lock need not replay it.
        showLine(moves);
        if (fillAnswer(moves)) document.getElementById("varMsg").textContent = "In the answer box. Lock when it is the whole line.";
      });
    });
    list.querySelectorAll("[data-var-show]").forEach(function (b) {
      b.addEventListener("click", function () {
        showLine(lines[Number(b.dataset.varShow)].moves);
        document.getElementById("varMsg").textContent = "On the board. Step through with ▶ or the → key.";
      });
    });
    list.querySelectorAll("[data-var-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        const next = varGet();
        next.splice(Number(b.dataset.varDel), 1);
        varSet(next);
        renderVariations();
      });
    });
  }

  function saveVariation() {
    const msg = document.getElementById("varMsg");
    const moves = game.history();
    if (!moves.length) {
      msg.textContent = "Play a line on the board first.";
      return;
    }
    const noteEl = document.getElementById("varNote");
    const note = noteEl.value.trim();
    const lines = varGet();
    const same = lines.find(function (l) { return l.moves.join(" ") === moves.join(" "); });
    if (same) {
      if (note) same.note = note;
    } else {
      lines.push({ moves: moves, note: note, ts: Date.now() });
    }
    varSet(lines);
    noteEl.value = "";
    msg.textContent = same ? "Already saved" + (note ? "; comment updated." : ".") : "Saved.";
    renderVariations();
  }

  // Open a session from elsewhere in the page (e.g. the Drills overview). Before the board
  // has initialised, remember the id so the first initPathBoard picks it.
  window.pathOpenSession = function (id) {
    if (!sessions()[id]) return;
    if (!ready) {
      requestedId = id;
      return;
    }
    loadSession(id);
  };

  window.initPathBoard = function () {
    if (ready) {
      renderBoard();
      return;
    }
    if (typeof Chess !== "function" || !window.CHESS_PIECES) return;
    if (!loadSession(currentId())) return;
    const pick = document.getElementById("sessionPick");
    if (pick) {
      pick.addEventListener("change", function () {
        loadSession(pick.value);
        // Keep ?session= in step so a reload stays on this game; file:// may refuse, which is harmless.
        try {
          const u = new URL(location.href);
          u.searchParams.set("session", pick.value);
          history.replaceState(null, "", u);
        } catch (e) { /* ignore */ }
      });
    }
    [["boardStart", "start"], ["boardBack", "back"], ["boardFwd", "fwd"], ["boardEnd", "end"]].forEach(function (pair) {
      const btn = document.getElementById(pair[0]);
      if (btn) btn.addEventListener("click", function () { navigate(pair[1]); });
    });
    // Arrow keys like Lichess: ← → step, ↑ start, ↓ end. Ignored while typing or off the Board tab.
    document.addEventListener("keydown", function (e) {
      const panel = document.getElementById("panel-session");
      if (!panel || panel.classList.contains("hidden")) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
      const dir = { ArrowLeft: "back", ArrowRight: "fwd", ArrowUp: "start", ArrowDown: "end", Home: "start", End: "end" }[e.key];
      if (!dir) return;
      e.preventDefault();
      navigate(dir);
    });
    document.getElementById("boardReset").addEventListener("click", function () {
      game = new Chess(cur().fen);
      selected = null;
      renderBoard();
    });
    const lichessLink = document.getElementById("boardLichess");
    if (lichessLink) {
      lichessLink.addEventListener("click", function (e) {
        if (!lichessLink.classList.contains("disabled")) return;
        e.preventDefault();
        document.getElementById("boardErr").textContent = "Lichess analysis opens after Lock. Write your own line first.";
      });
    }
    const varSave = document.getElementById("varSave");
    if (varSave) {
      varSave.addEventListener("click", saveVariation);
      document.getElementById("varCopyPgn").addEventListener("click", function () {
        const lines = varGet();
        if (!lines.length) return;
        const text = pgnText(cur().fen, lines);
        const pgn = document.getElementById("varPgn");
        pgn.value = text;
        pgn.classList.remove("hidden");
        copyText(text);
      });
    }
    document.getElementById("boardLock").addEventListener("click", lockStep);
    // Enter in an answer box locks; without this a one-field form submits and reloads the page.
    document.getElementById("boardForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!locked[step]) lockStep();
    });
    document.getElementById("boardNext").addEventListener("click", function () {
      if (step >= steps().length - 1) return;
      captureAnswers();
      saveProgress();
      loadStep(step + 1);
    });
    ready = true;
  };
})();
