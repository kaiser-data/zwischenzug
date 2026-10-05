(function () {
  function sessions() {
    return window.PATH_SESSIONS || {};
  }
  // Optional session `category`: what kind of game it was decides the follow-up it gets.
  const CATEGORIES = {
    leak: { label: "Leak", followUp: "Stopped one ply early. Name the reply you stopped at, then write the line to the last capture." },
    clean: { label: "Clean", followUp: "Few mistakes. Check the opening, write the winning line to the last capture, play his best defence, find the move that lost." },
    clock: { label: "Clock", followUp: "Lost to time trouble. Find where the minutes went and the move the clock chose." },
    gift: { label: "Gift", followUp: "The result is better than the position. Work the moment it turned, not the result." },
  };
  function categoryOf(s) { return (s && CATEGORIES[s.category]) || null; }

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
  // The line a written answer passed with (the main line or an accepted alternative).
  let passedLine = null;
  let stepStarted = 0;
  // Saved progress for the open session: { at, logged, steps: { [stepId]: entry } }.
  let progress = { at: "", logged: false, steps: {} };
  // View only: which side is at the bottom. Taken from the session, not stored.
  let flipped = false;
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
    const files = flipped ? "hgfedcba".split("") : "abcdefgh".split("");
    const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
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
        if (ri === 7) {            // file letter on the rank nearest the viewer
          const c = document.createElement("span");
          c.className = "coord file";
          c.textContent = f;
          el.appendChild(c);
        }
        if (fi === 0) {            // rank digit on the leftmost drawn file
          const c = document.createElement("span");
          c.className = "coord rank";
          c.textContent = String(r);
          el.appendChild(c);
        }
        el.addEventListener("click", function () { onSquare(sq); });
        boardEl.appendChild(el);
      });
    });
    const flipBtn = document.getElementById("boardFlip");
    if (flipBtn) flipBtn.setAttribute("aria-pressed", flipped ? "true" : "false");
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
      if (move) autoCheck();
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

  // A written branch shows only its first `given` ply; the rest is his to write.
  function givenOf(b) { return b.given == null ? 1 : b.given; }
  function branchLabel(b) {
    if (!b.write) return b.label;
    return numbered(cur().fen, (b.mustPlay || []).slice(0, givenOf(b))) + " …" + (b.ask ? " " + b.ask : "");
  }
  function writeBranch() {
    const b = (cur().branches || [])[activeBranch];
    return b && b.write && !branchLocked[activeBranch] && !locked[step] ? b : null;
  }

  function renderBranchWrite() {
    const host = document.getElementById("branchWrite");
    if (!host) return;
    const b = writeBranch();
    if (!b) { host.innerHTML = ""; return; }
    const n = (b.mustPlay || []).length;
    host.innerHTML = "<label>Your line after " + esc(numbered(cur().fen, b.mustPlay.slice(0, givenOf(b)))) +
      "<span>Both sides, to the last capture or check. On the board it is checked at " + n + " ply; stopping earlier, press Lock.</span>" +
      "<input name='line' type='text' autocomplete='off' placeholder='" + SPEAK + "'></label>" + takeButton();
    const take = document.getElementById("boardTake");
    if (take) take.addEventListener("click", function () { fillAnswer(boardLine()); });
  }

  function renderBranches() {
    const list = cur().branches;
    const host = document.getElementById("branchList");
    if (!host) return;
    if (!list || !list.length) {
      renderBranchWrite();
      host.innerHTML = "";
      host.classList.add("hidden");
      return;
    }
    host.classList.remove("hidden");
    host.innerHTML = list.map(function (b, i) {
      const cls = i === activeBranch ? "on" : (branchLocked[i] ? "done" : "");
      const mark = branchLocked[i] ? " ✓" : "";
      return "<button type='button' class='branch " + cls + "' data-i='" + i + "'>" + esc(branchLabel(b)) + mark + "</button>";
    }).join("");
    renderBranchWrite();
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

  function flipBoard() {
    flipped = !flipped;
    renderBoard();
  }

  // Reopen a locked step: answers and key go, the log row stays (one row per drill).
  function redoStep() {
    const entry = entryFor(stepId(step));
    entry.locked = false;
    entry.passed = false;
    entry.answers = {};
    entry.branches = [];
    locked[step] = false;
    saveProgress();
    loadStep(step);
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
      : cur().type === "solve" ? renderSolve(cur().solve || {})
      : (cur().branches || []).some(function (b) { return b.write; }) ? "<div id='branchWrite'></div>" : "";
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
    document.getElementById("boardRedo").classList.toggle("hidden", !locked[step]);
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
      "<input name='continue' type='text' placeholder='" + SPEAK + "'></label>" + takeButton();
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
    return "<label>Your line, from the first move<span>The " + (session && session.logAs ? "book's " : "") + "line is " + n + " ply. Calculate all of it first, then type it (Enter) or play it on the board — the board checks it at " + n + " ply. Stopping earlier? Press Lock.</span>" +
      "<input name='line' type='text' required placeholder='" + SPEAK + "'></label>" + takeButton();
  }

  // Grade a written line ply by ply against the main line and any accepted alternatives.
  // Plies past the end of a finished line are ignored.
  function gradeLines(fen, lines, have, noun) {
    if (!have.length) return { ok: false, msg: "Write the first move." };
    const g = new Chess(fen);
    let live = lines;
    for (let i = 0; ; i++) {
      const ply = i + 1;
      const done = live.find(function (l) { return l.length === i; });
      const longer = live.filter(function (l) { return l.length > i; });
      if (done && (!longer.length || i >= have.length)) return { ok: true, line: done };
      if (i >= have.length) {
        const n = Math.min.apply(null, longer.map(function (l) { return l.length; }));
        return { ok: false, at: i, miss: { result: "short", ply: i },
          msg: "You stopped at ply " + i + ". " + noun + " is " + n + " ply. What happens next?" };
      }
      const mv = looseMove(g, have[i]);
      if (!mv) return { ok: false, at: i, msg: "Ply " + ply + ": " + have[i] + " is not legal there, or it is ambiguous (write Rexe5, R8xf6). Set it up on the board and look again." };
      const next = longer.filter(function (l) { return norm(l[i]) === norm(mv.san); });
      if (!next.length) {
        if (done) return { ok: true, line: done };
        if (i === 0) {
          return { ok: false, at: 0, miss: { result: "wrong" },
            msg: "Not the first move. Before the obvious move, look for one in between: a check, a capture, a threat." };
        }
        return { ok: false, at: i, miss: { result: "short", ply: i },
          msg: "Ply " + ply + ": " + have[i] + " leaves the line. " + (i % 2 ? "Which reply is the most testing?" : "Look again from there.") };
      }
      live = next;
    }
  }

  function gradeSolve(s, form) {
    const sp = s.solve || {};
    const lines = [sp.line || []].concat(sp.alts || []);
    return gradeLines(s.fen, lines, tokens(form.elements.line && form.elements.line.value),
      session && session.logAs ? "The book's line" : "The line");
  }

  function gradeBranch(b, form) {
    return gradeLines(cur().fen, [b.mustPlay || []].concat(b.alts || []), branchWritten(b, form), "The line");
  }

  // What he wrote for a branch, with the given plies in front whether he typed them or not.
  function branchWritten(b, form) {
    const given = (b.mustPlay || []).slice(0, givenOf(b)).map(norm);
    const have = tokens(form.elements.line && form.elements.line.value);
    return startsWith(have, given) ? have : given.concat(have);
  }

  // Spoken or dictated moves to SAN, German or English: "Springer schlägt c3 Schach" → "Nxc3+".
  // German letters typed as SAN (Sf3, Lxc6+, Dxg7) too. SAN passes through; a word it does not
  // know stays as it is, so the grader can call it illegal instead of the line silently shrinking.
  const SPOKEN = {
    piece: { springer: "N", pferd: "N", spinner: "N", knight: "N", night: "N", knife: "N", nite: "N", "läufer": "B", laeufer: "B", bishop: "B", turm: "R", tom: "R", tor: "R", rook: "R",
      dame: "Q", queen: "Q", "könig": "K", koenig: "K", king: "K", bauer: "", pawn: "" },
    take: { "schlägt": 1, schlaegt: 1, nimmt: 1, mal: 1, takes: 1, captures: 1, x: 1 },
    suffix: { schach: "+", check: "+", "+": "+", matt: "#", schachmatt: "#", mate: "#", checkmate: "#", "#": "#" },
    file: { a: "a", ah: "a", b: "b", be: "b", bee: "b", c: "c", ce: "c", zeh: "c", see: "c", sea: "c", d: "d", de: "d", dee: "d",
      e: "e", ee: "e", f: "f", ef: "f", eff: "f", g: "g", ge: "g", gee: "g", h: "h", ha: "h", aitch: "h" },
    rank: { "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", eins: "1", one: "1", zwei: "2", zwo: "2",
      two: "2", drei: "3", three: "3", vier: "4", four: "4", "fünf": "5", fuenf: "5", five: "5", sechs: "6", six: "6",
      sieben: "7", seven: "7", acht: "8", eight: "8" },
    short: { kurze: 1, kurz: 1, kleine: 1, short: 1, kingside: 1 },
    long: { lange: 1, lang: 1, "große": 1, grosse: 1, long: 1, queenside: 1 },
    castle: { rochade: 1, rochiert: 1, castle: 1, castles: 1, castling: 1 },
    // Short words the chess model hears reliably (measured 2026-10-02: "no" 6/7 voices, "yes" 7/7;
    // "back" and "undo" often come back as squares, so they are kept but not the ones to rely on).
    undo: { "zurück": 1, zurueck: 1, zur: 1, back: 1, undo: 1, "rückgängig": 1, no: 1, nope: 1, wrong: 1, oops: 1, nein: 1, falsch: 1, nine: 1 },
    done: { done: 1, fertig: 1, lock: 1, ende: 1, finished: 1, submit: 1, abgeben: 1, yes: 1, ja: 1, yeah: 1, yep: 1, locken: 1, lochen: 1, abschließen: 1 },
    stop: { stop: 1, stopp: 1, halt: 1 },
    skip: { skip: 1, weiter: 1, next: 1, "nächster": 1, "nächste": 1, "nächstes": 1, naechster: 1, naechste: 1, naechstes: 1,
      los: 1, go: 1, "continue": 1, forward: 1, "vorwärts": 1, vorwaerts: 1 },
    prev: { previous: 1, vorher: 1, vorige: 1, voriger: 1, "vorheriger": 1 },
    redo: { redo: 1, nochmal: 1, again: 1, wiederholen: 1 },
    flip: { flip: 1, drehen: 1, umdrehen: 1 },
    reset: { reset: 1, "zurücksetzen": 1, zuruecksetzen: 1, vorne: 1, vorn: 1, clear: 1, "löschen": 1 },
    filler: { von: 1, auf: 1, nach: 1, zieht: 1, und: 1, dann: 1, zug: 1, to: 1, then: 1, and: 1, moves: 1, "weiß": 1, schwarz: 1, white: 1, black: 1 },
  };
  // Dictation needs no button: macOS dictation (fn twice) types into any answer box.
  const SPEAK = "Nxc3 Qh8+ … or dictate: Springer schlägt c3 · zurück · reset";
  const SAN_RE = /^(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](x[a-h])?[1-8](=?[QRBN])?)[+#]?$/;
  const GERMAN_PIECE = { S: "N", L: "B", T: "R", D: "Q", K: "K" };

  function spokenToSan(text) {
    // Words to symbols: {k: "san"|"piece"|"take"|"suf"|"file"|"rank"|"sq"|"castle"|"raw", v}.
    const syms = [];
    String(text || "").replace(/…/g, " ").split(/[\s,;:]+/).forEach(function (raw) {
      let t = raw.replace(/^\d+\.+/, "").replace(/[.!?]+$/, "");
      if (!t || /^\d{2,}$/.test(t)) return;                       // move numbers
      if (/^[a-h][1-8]$/.test(t)) { syms.push({ k: "sq", v: t }); return; }   // a square may belong to a spoken move
      const zero = t.replace(/0/g, "O");
      if (/^O-O(-O)?[+#]?$/.test(zero)) { syms.push({ k: "san", v: zero }); return; }
      if (SAN_RE.test(t)) { syms.push({ k: "san", v: t }); return; }
      const de = t.match(/^([SLTDK])([a-h]?[1-8]?x?[a-h][1-8][+#]?)$/);
      if (de) { syms.push({ k: "san", v: GERMAN_PIECE[de[1]] + de[2] }); return; }
      const deProm = t.match(/^([a-h](?:x[a-h])?[18])=?([DTLS])([+#]?)$/);
      if (deProm) { syms.push({ k: "san", v: deProm[1] + "=" + GERMAN_PIECE[deProm[2]] + deProm[3] }); return; }
      const w = t.toLowerCase();
      if (/^[a-h][1-8]$/.test(w)) syms.push({ k: "sq", v: w });
      else if (w in SPOKEN.piece) syms.push({ k: "piece", v: SPOKEN.piece[w] });
      else if (w in SPOKEN.take) syms.push({ k: "take" });
      else if (w in SPOKEN.suffix) syms.push({ k: "suf", v: SPOKEN.suffix[w] });
      else if (w in SPOKEN.file) syms.push({ k: "file", v: SPOKEN.file[w] });
      else if (w in SPOKEN.rank) syms.push({ k: "rank", v: SPOKEN.rank[w] });
      else if (w in SPOKEN.short) syms.push({ k: "side", v: "O-O" });
      else if (w in SPOKEN.long) syms.push({ k: "side", v: "O-O-O" });
      else if (w in SPOKEN.castle) syms.push({ k: "castle" });
      else if (w in SPOKEN.undo) syms.push({ k: "undo" });
      else if (w in SPOKEN.reset) syms.push({ k: "reset" });
      else if (!(w in SPOKEN.filler)) syms.push({ k: "raw", v: raw.replace(/^\d+\.+/, "") });
    });
    // "zeh" "drei" → c3; "kurze Rochade" / "Rochade lang" → castling.
    const merged = [];
    for (let i = 0; i < syms.length; i++) {
      const a = syms[i], b = syms[i + 1];
      if (a.k === "file" && b && b.k === "rank") { merged.push({ k: "sq", v: a.v + b.v }); i++; continue; }
      if (a.k === "castle" || a.k === "side") {
        const other = a.k === "castle" ? (b && b.k === "side" ? b : null) : (b && b.k === "castle" ? b : null);
        const side = a.k === "side" ? a.v : other ? other.v : "O-O";
        if (a.k === "side" && !other) continue;                   // a lone "long" is not a move
        merged.push({ k: "san", v: side });
        if (other) i++;
        continue;
      }
      merged.push(a);
    }
    const moves = [];
    let cur = null;
    function flush() {
      if (cur && cur.to) moves.push(cur.piece + cur.dis + (cur.cap ? "x" : "") + cur.to + (cur.promo ? "=" + cur.promo : "") + cur.suf);
      else if (cur && (cur.piece || cur.dis)) moves.push(cur.piece + cur.dis + (cur.cap ? "x" : ""));
      cur = null;
    }
    merged.forEach(function (m, i) {
      const next = merged[i + 1];
      // Commands: "zurück" takes the last move back, "reset" / "von vorne" starts the line again.
      if (m.k === "undo") { flush(); moves.pop(); return; }
      if (m.k === "reset") { cur = null; moves.length = 0; return; }
      if (m.k === "san" || m.k === "raw") { flush(); moves.push(m.v); return; }
      if (m.k === "suf") {
        if (cur) cur.suf = m.v;
        else if (moves.length) moves[moves.length - 1] += m.v;
        return;
      }
      if (m.k === "piece") {
        // "e8 Dame": a pawn on the last rank takes the piece named next, unless a square follows.
        const promotes = cur && cur.to && !cur.piece && /[18]$/.test(cur.to) && m.v && !(next && (next.k === "sq" || next.k === "file"));
        if (promotes) { cur.promo = m.v; return; }
        flush();
        cur = { piece: m.v, dis: "", cap: false, to: "", promo: "", suf: "" };
        return;
      }
      if (m.k === "take") {
        if (!cur) cur = { piece: "", dis: "", cap: false, to: "", promo: "", suf: "" };
        if (cur.to) { cur.dis = cur.to; cur.to = ""; }             // "Springer d7 schlägt e5"
        cur.cap = true;
        return;
      }
      if (m.k === "file" || m.k === "rank") {
        if (cur && cur.to) flush();
        if (!cur) cur = { piece: "", dis: "", cap: false, to: "", promo: "", suf: "" };
        cur.dis += m.v;
        return;
      }
      if (m.k === "sq") {
        if (cur && cur.to) flush();
        if (!cur) cur = { piece: "", dis: "", cap: false, to: "", promo: "", suf: "" };
        cur.to = m.v;
      }
    });
    flush();
    return moves.join(" ");
  }
  window.pathSpokenToSan = spokenToSan;

  // SAN from a person, not a program: a capture without x or a check without + is still the move,
  // as long as only one legal move fits.
  function looseMove(g, t) {
    const exact = g.move(t, { sloppy: true });
    if (exact) return exact;
    const bare = function (m) { return m.replace(/[x+#=]/g, ""); };
    const fits = g.moves().filter(function (m) { return bare(m) === bare(t); });
    if (fits.length === 1) return g.move(fits[0]);
    // Only the target square ("f7"): enough when one piece can go there. A promotion is one pawn
    // with four choices: the queen.
    const sq = String(t).replace(/[+#]$/, "");
    if (/^[a-h][1-8]$/.test(sq)) {
      const to = g.moves({ verbose: true }).filter(function (m) { return m.to === sq; });
      if (to.length === 1) return g.move(to[0].san);
      if (to.length && to.every(function (m) { return m.from === to[0].from && m.promotion; })) {
        return g.move(to.filter(function (m) { return m.promotion === "q"; })[0].san);
      }
    }
    return null;
  }

  function tokens(text) {
    return spokenToSan(text)
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
      const mv = looseMove(g, rest[i]);
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
    if (s.type === "solve") return stopPassed ? (passedLine || (s.solve && s.solve.line) || []) : [];
    if (s.branches && s.branches.length) {
      const b = s.branches[activeBranch];
      // A written branch keeps its line hidden until it is locked.
      return b.write && !branchLocked[activeBranch] ? [] : (b.mustPlay || []);
    }
    return s.mustPlay || [];
  }

  function historyMatches(need) {
    const h = game.history().map(norm);
    if (!need.length) return true;
    if (h.length < need.length) return false;
    return need.every(function (m, i) { return h[i] === norm(m); });
  }

  // Lock the active branch and keep it across reloads; true while other branches are still open.
  function lockBranch() {
    const s = cur();
    branchLocked[activeBranch] = true;
    entryFor(stepId(step)).branches = s.branches
      .filter(function (b, i) { return branchLocked[i]; })
      .map(function (b) { return b.id; });
    saveProgress();
    const key = document.getElementById("boardKey");
    key.innerHTML = s.branches[activeBranch].key || "";
    key.classList.add("show");
    const nextOpen = branchLocked.indexOf(false);
    if (nextOpen === -1) {
      renderBranches();
      return false;
    }
    // Jump to the next unplayed line; the key of the one just locked stays visible.
    activeBranch = nextOpen;
    game = new Chess(s.fen);
    selected = null;
    renderBranches();
    renderBoard();
    const left = branchLocked.filter(function (x) { return !x; }).length;
    document.getElementById("boardErr").textContent =
      "Locked. Next: " + branchLabel(s.branches[nextOpen]) + " (" + left + " left)";
    return true;
  }

  // The board follows what is typed or dictated into an answer box, move by move.
  let followTimer = null;
  function followAnswer() {
    clearTimeout(followTimer);
    followTimer = setTimeout(function () {
      if (!game || !takesLine()) return;
      const form = document.getElementById("boardForm");
      const written = writtenLine(cur(), form);
      const g = new Chess(cur().fen);
      let stuck = -1;
      for (let i = 0; i < written.length; i++) {
        if (!looseMove(g, written[i])) { stuck = i; break; }
      }
      game = g;
      future = [];
      futureGame = game;
      selected = null;
      renderBoard();
      const err = document.getElementById("boardErr");
      // The last word may still be arriving; only a stuck move with more after it is named.
      if (stuck !== -1 && stuck < written.length - 1) {
        err.textContent = "The board stops before " + written[stuck] + ": not legal there, or not understood. Say \"zurück\" or correct it.";
      } else {
        err.textContent = "";
        if (stuck === -1) autoCheck();
      }
    }, 250);
  }

  // Voice: hold 🎤 (or the v key), say one move, let go. scripts/voice_server.py turns the audio into
  // text on this machine; the text goes through the same spoken-move reader as a typed answer.
  const VOICE_URL = window.PATH_VOICE_URL || "http://127.0.0.1:8766";
  const VOICE_LANG_KEY = "zwischenzug_voice_lang";
  const voice = { ready: false, both: false, stream: null, rec: null, chunks: [], started: 0 };

  function voiceLang() {
    try { return localStorage.getItem(VOICE_LANG_KEY) === "de" ? "de" : "en"; } catch (e) { return "en"; }
  }

  function setVoiceReady(ok) {
    voice.ready = ok;
    const btn = document.getElementById("boardMic");
    if (!btn) return;
    btn.setAttribute("aria-disabled", ok ? "false" : "true");
    const lb = document.getElementById("boardListen");
    if (lb) {
      lb.setAttribute("aria-disabled", ok ? "false" : "true");
      lb.title = ok ? "Hands-free: listen for moves and commands (next, previous, redo, flip, done) until you say stop (l). Stays on after a reload." : "Voice is off. Start it with: python3 scripts/voice_server.py";
    }
    btn.title = ok ? "Hold and say one move (or hold v). Commands: back, reset"
      : "Voice is off. Start it with: python3 scripts/voice_server.py";
  }

  function voiceCheck() {
    if (typeof fetch !== "function") return;
    fetch(VOICE_URL + "/health").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        voice.both = !!(j && j.both);   // a server that hears free + legal in one reply says so
        setVoiceReady(!!(j && j.ok));
        // 🎧 stays on across reloads and sessions until he says stop or presses it off.
        if (voice.ready && listenWanted() && !listen.on) listenStart();
      }, function () { setVoiceReady(false); });
  }

  function heard(msg) {
    const el = document.getElementById("voiceHeard");
    if (el) el.textContent = msg;
  }

  function voiceStart() {
    if (voice.rec) return;
    if (!voice.ready) {
      heard("Voice is off. In a terminal: python3 scripts/voice_server.py — then press 🎤 again.");
      voiceCheck();
      return;
    }
    const open = voice.stream ? Promise.resolve(voice.stream) : navigator.mediaDevices.getUserMedia({ audio: true });
    open.then(function (stream) {
      voice.stream = stream;
      voice.chunks = [];
      voice.rec = new MediaRecorder(stream);
      voice.rec.ondataavailable = function (e) { if (e.data && e.data.size) voice.chunks.push(e.data); };
      voice.rec.onstop = voiceSend;
      voice.started = Date.now();
      voice.rec.start();
      document.getElementById("boardMic").classList.add("on");
      heard("Listening…");
    }, function () { heard("No microphone: allow it for this page in Chrome's address bar."); });
  }

  function voiceStop() {
    if (voice.rec && voice.rec.state === "recording") voice.rec.stop();
    document.getElementById("boardMic").classList.remove("on");
  }

  function voiceSend() {
    const rec = voice.rec;
    voice.rec = null;
    if (Date.now() - voice.started < 300) { heard("Hold 🎤 while you speak."); return; }
    utterance(new Blob(voice.chunks, { type: rec.mimeType }));
  }

  // Active listening: cut the microphone stream into utterances by loudness, no button needed.
  // A frame is speech when it is clearly above the room's noise floor; an utterance ends after
  // SILENCE_MS of quiet, keeps PREROLL_MS before its start so the first consonant survives.
  // Hysteresis: speech starts clearly above the floor (×3.5) but only ends below ×2, so a soft
  // ending ("…three") is not cut, and the cut can come sooner. MIN_MS lets a short "no" through.
  const LISTEN = { PREROLL_MS: 300, SILENCE_MS: 500, MIN_MS: 180, MAX_MS: 4000, START_FRAMES: 2 };
  function makeSegmenter(rate, onSegment) {
    let floor = 0.004, speaking = false, loud = 0, quietMs = 0, frames = [], pre = [], preMs = 0, spokenMs = 0;
    return function push(frame) {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      const rms = Math.sqrt(sum / frame.length);
      const ms = frame.length / rate * 1000;
      const isSpeech = rms > (speaking ? Math.max(0.008, floor * 2) : Math.max(0.012, floor * 3.5));
      if (!speaking) {
        if (!isSpeech) floor = floor * 0.95 + rms * 0.05;
        pre.push(frame); preMs += ms;
        while (preMs > LISTEN.PREROLL_MS && pre.length > 1) preMs -= pre.shift().length / rate * 1000;
        loud = isSpeech ? loud + 1 : 0;
        if (loud >= LISTEN.START_FRAMES) {
          speaking = true; frames = pre; pre = []; preMs = 0; quietMs = 0; spokenMs = loud * ms;
        }
        return;
      }
      frames.push(frame);
      spokenMs += ms;
      quietMs = isSpeech ? 0 : quietMs + ms;
      if (quietMs >= LISTEN.SILENCE_MS || spokenMs >= LISTEN.MAX_MS) {
        speaking = false; loud = 0;
        if (spokenMs - quietMs >= LISTEN.MIN_MS) onSegment(frames);
        frames = [];
      }
    };
  }
  window.pathMakeSegmenter = makeSegmenter;

  // 16 kHz mono WAV, the model's own rate: a third of the upload from a 48 kHz mic, and the
  // server needs no ffmpeg. Each output sample averages its span of input (a box low-pass).
  function to16k(frames, rate) {
    const all = new Float32Array(frames.reduce(function (a, f) { return a + f.length; }, 0));
    let at = 0;
    frames.forEach(function (f) { all.set(f, at); at += f.length; });
    if (rate <= 16000) return { data: all, rate: rate };
    const step = rate / 16000, out = new Float32Array(Math.floor(all.length / step));
    for (let i = 0; i < out.length; i++) {
      const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
      let sum = 0;
      for (let j = a; j < b; j++) sum += all[j];
      out[i] = sum / (b - a);
    }
    return { data: out, rate: 16000 };
  }
  window.pathTo16k = to16k;

  function wavBlob(input, inputRate) {
    const pcm = to16k(input, inputRate), rate = pcm.rate, frames = [pcm.data];
    const n = pcm.data.length;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = function (o, t) { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    let o = 44;
    frames.forEach(function (f) {
      for (let i = 0; i < f.length; i++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, f[i])) * 0x7fff, true);
    });
    return new Blob([buf], { type: "audio/wav" });
  }

  const listen = { on: false, ctx: null, stream: null, node: null, wake: null, queue: Promise.resolve() };
  const LISTEN_KEY = "zwischenzug_voice_listen";
  const LISTEN_HINT = "Listening. Say a move (a square alone is enough when one piece can go there) — or no / nein (take back), yes / ja (Lock), next / weiter, previous, again, flip, stop.";
  function rememberListen(on) { try { localStorage.setItem(LISTEN_KEY, on ? "1" : "0"); } catch (e) { /* ignore */ } }
  function listenWanted() { try { return localStorage.getItem(LISTEN_KEY) === "1"; } catch (e) { return false; } }

  function transcribeBlob(blob, moves, both) {
    const q = "?lang=" + voiceLang() + (moves && moves.length ? "&moves=" + encodeURIComponent(moves.join(",")) + (both ? "&both=1" : "") : "");
    return fetch(VOICE_URL + "/transcribe" + q, { method: "POST", body: blob, headers: { "Content-Type": blob.type } })
      .then(function (r) { return r.json(); });
  }

  // Where the next spoken move is played: always the position the board shows. On a written step
  // that is a point in the answer line — at its end the move extends it, earlier it replaces the rest.
  function positionNow() {
    if (!takesLine()) return new Chess(game.fen());
    const g = new Chess(cur().fen);
    boardPlayed().every(function (m) { return !!looseMove(g, m); });
    return g;
  }

  // What the step itself puts at the start of a written line: the candidate, a branch's given plies.
  function lineBase() {
    const s = cur(), wb = writeBranch();
    if (wb) return (wb.mustPlay || []).slice(0, givenOf(wb));
    return s.type === "stopPly" ? [(s.stopPly || {}).candidate] : [];
  }

  // The board's moves from the step position, never shorter than what the step gives.
  function boardPlayed() {
    const h = game ? game.history() : [];
    const base = lineBase();
    return h.length < base.length && startsWith(base.map(norm), h) ? base.slice() : h;
  }

  // Write a whole line (from the step position) into the answer boxes, as plain SAN.
  function writeLine(moves) {
    const form = document.getElementById("boardForm"), wb = writeBranch();
    if (wb) form.elements.line.value = moves.slice(givenOf(wb)).join(" ");
    else if (cur().type === "solve") form.elements.line.value = moves.join(" ");
    else {
      form.elements.scare.value = moves[1] || "";
      form.elements["continue"].value = moves.slice(2).join(" ");
    }
  }

  // A spoken move or command on a written step, at the board's position. Saying the move that is
  // already next just steps along; a different one replaces the rest of the line, and the replaced
  // line is kept under Saved lines as a side line, so nothing he wrote is lost.
  function voiceIntoLine(command, moves) {
    const played = boardPlayed(), base = lineBase();
    const full = sanOf(writtenLine(cur(), document.getElementById("boardForm")));
    const ahead = startsWith(full, played) ? full.slice(played.length) : [];
    if (!command && moves.length && startsWith(ahead, moves)) {
      rewindTo(full, played.length + moves.length);      // one step along; the rest stays ahead
      return;
    }
    let line;
    if (command === "undo") line = played.slice(0, Math.max(base.length, played.length - 1));
    else if (command === "reset") line = base.slice();
    else line = played.concat(moves);
    if (!command && ahead.length) keepReplaced(full);
    writeLine(line);
    // The board shows the new line's end at once; followAnswer re-checks it from the box.
    const g = new Chess(cur().fen);
    line.every(function (m) { return !!looseMove(g, m); });
    game = g; future = []; futureGame = game; selected = null;
    renderBoard();
    followAnswer();
  }

  // A written line as real SAN from the step position, as far as it is legal.
  function sanOf(moves) {
    const out = [], g = new Chess(cur().fen);
    moves.every(function (m) { const mv = looseMove(g, m); if (mv) out.push(mv.san); return !!mv; });
    return out;
  }

  function keepReplaced(sans) {
    const lines = varGet();
    if (!sans.length || lines.some(function (l) { return l.moves.join(" ") === sans.join(" "); })) return;
    lines.push({ moves: sans, note: "replaced by voice", ts: Date.now() });
    varSet(lines);
    renderVariations();
  }

  function legalIn(g, san) {
    const moves = san.split(" ").filter(Boolean);
    return moves.length > 0 && moves.every(function (m) { return !!looseMove(g, m); });
  }

  function commandOf(text) {
    const words = String(text).toLowerCase().replace(/[.,!?]/g, " ").trim().split(/\s+/);
    const only = function (set) { return words.length <= 2 && words.some(function (w) { return w in set; }); };
    return only(SPOKEN.undo) ? "undo" : only(SPOKEN.reset) ? "reset" : only(SPOKEN.done) ? "done"
      : only(SPOKEN.stop) ? "stop" : only(SPOKEN.skip) ? "skip" : only(SPOKEN.prev) ? "prev"
      : only(SPOKEN.redo) ? "redo" : only(SPOKEN.flip) ? "flip" : null;
  }

  const CHESSY = /[a-h]\s*\.?\s*[1-8]|\b[a-h]\b|knight|bishop|rook|queen|king|castle|springer|läufer|turm|dame|könig|rochade/i;

  // The server hears each recording twice at once: free, and held to the legal moves by a grammar.
  // The free hearing comes first; a move-like answer that is not legal here falls back to the held one.
  // Silence and noise never use it, so no move is forced out of them. An older server without
  // "both" gets the held pass as a second request, as before — it must not get the moves up front,
  // or it would answer with the held hearing alone.
  // How sure the model must be (its lowest token probability) before a hearing counts. Measured
  // 2026-10-05: clear moves ~1.0, "nein" 0.89; clicks, hum, "äh", ordinary sentences 0.05–0.3,
  // "hmm" / "ja also ich glaube" ~0.57. Commands act harder (Lock, next), so they need more.
  const SURE = { move: 0.6, command: 0.8 };
  window.PATH_VOICE_SURE = SURE;

  function recognise(blob, g, ungated) {
    const legal = g.moves();
    return transcribeBlob(blob, voice.both ? legal : null, true).then(function (j) {
      const text = j.text || "";
      // A sound the model was not sure about is no move and no command — and it never reaches the
      // grammar pass, which would turn it into a legal move.
      if (!ungated && typeof j.conf === "number" && text && j.conf < (commandOf(text) ? SURE.command : SURE.move)) {
        return { text: "", heard: text, ignored: true, conf: j.conf };
      }
      if (commandOf(text) || !CHESSY.test(text) || legalIn(new Chess(g.fen()), spokenToSan(text))) return { text: text, heard: text, conf: j.conf };
      // The grammar holds one move; it wins only when it gets further than the free hearing
      // (a sequence whose third move was misheard keeps its first two).
      const first = legalPrefix(g, spokenToSan(text)).moves.length;
      const choose = function (again) {
        return legalPrefix(g, spokenToSan(again)).moves.length > first ? { text: again, heard: text, conf: j.conf } : { text: text, heard: text, conf: j.conf };
      };
      if (typeof j.grammar === "string") return choose(j.grammar);
      if (!legal.length) return { text: text, heard: text };
      return transcribeBlob(blob, legal).then(function (j2) { return choose(j2.text || ""); },
        function () { return { text: text, heard: text }; });
    });
  }

  // Samples for training: a spoken move he did not take back, or — after "back" — the move he
  // said instead, paired with the recording that was misheard. Only when he opted in.
  const SAMPLE_KEY = "zwischenzug_voice_keep";
  const samples = { pending: null, misheard: null, timer: null };
  function keepSamples() { try { return localStorage.getItem(SAMPLE_KEY) === "1"; } catch (e) { return false; } }
  function saveSample(blob, label, heardText, source, extra) {
    const x = extra || {};
    const q = "?lang=" + voiceLang() + "&label=" + encodeURIComponent(label) + "&heard=" + encodeURIComponent(heardText || "") + "&source=" + source +
      (x.fen ? "&fen=" + encodeURIComponent(x.fen) : "") + (typeof x.conf === "number" ? "&conf=" + x.conf : "");
    return fetch(VOICE_URL + "/sample" + q, { method: "POST", body: blob, headers: { "Content-Type": blob.type } })
      .then(function (r) { return r.json(); }).then(function (j) { renderSampleStats(j.stats); return j; }, function () { return null; });
  }
  function flushPending() {
    clearTimeout(samples.timer);
    if (samples.pending) saveSample(samples.pending.blob, samples.pending.san, samples.pending.heard, "spoken");
    samples.pending = null;
  }
  function noteSample(blob, result, applied) {
    if (!keepSamples() || drill.on) return;
    const cmd = commandOf(result.text);
    if (cmd === "undo") {
      clearTimeout(samples.timer);
      if (samples.pending) samples.misheard = samples.pending;
      samples.pending = null;
      return;
    }
    if (!applied || applied.split(" ").length !== 1) return;
    if (samples.misheard) {
      saveSample(samples.misheard.blob, applied, samples.misheard.heard, "correction");
      samples.misheard = null;
    }
    flushPending();
    samples.pending = { blob: blob, san: applied, heard: result.heard };
    samples.timer = setTimeout(flushPending, 5000);
  }

  // Every recording, from 🎤 or 🎧, goes through here, one at a time and in order,
  // so "back" never overtakes the move it takes back.
  function utterance(blob) {
    heard("…");
    listen.queue = listen.queue.then(function () {
      if (drill.on) return drillHear(blob);
      return recognise(blob, positionNow()).then(function (result) {
        if (!String(result.text || "").trim() && !result.ignored) { heard("· nothing heard"); return; }
        if (result.ignored) {                      // quiet: no tone, nothing played, just a note under the board
          heard("· ignored a sound (“" + result.heard + "”, sure " + Math.round(result.conf * 100) + " %)");
          return;
        }
        const res = voiceApply(result.text);
        if (res.rejected && !res.san && keepSamples() && !drill.on) {
          flushPending();
          samples.misheard = { blob: blob, heard: result.heard };
          return;
        }
        noteSample(blob, result, res.san);
      });
    }).catch(function () {
      // One failed request (a network blip on the phone) must not end 🎧: stop only if the server is really gone.
      heard("Did not catch that. Say it again.");
      if (typeof fetch !== "function") return;
      return fetch(VOICE_URL + "/health").then(function (r) { if (!r.ok) throw new Error(); }).catch(function () {
        setVoiceReady(false); heard("Voice server stopped."); listenStop();
      });
    });
  }

  // Training mode ("Train the voice model"): his own voice, everything the board listens for.
  // A round mixes moves (SAN, in German letters when DE is on), squares said alone, his command
  // words, and "silence or a sound" — so the model learns what is NOT a move too. Every recording
  // is kept with its label and position; the score is how well the model hears him today.
  const drill = { on: false, target: null, fen: "", n: 0, of: 50, right: 0 };   // 50 a round: 200–300 in a few rounds
  const DRILL_WORDS = {
    en: ["no", "yes", "next", "back", "lock", "again", "flip", "previous", "reset", "go"],
    de: ["nein", "ja", "weiter", "nächste", "zurück", "fertig", "locken", "nochmal", "drehen", "vorher", "los"],
  };
  const DE_PIECE = { N: "S", B: "L", R: "T", Q: "D", K: "K" };
  function drillPositions() {
    const out = [];
    steps().forEach(function (s) {
      const lines = [s.mustPlay || []].concat((s.branches || []).map(function (b) { return b.mustPlay || []; }),
        s.solve ? [s.solve.line] : []);
      lines.forEach(function (line) {
        const g = new Chess(s.fen);
        out.push(g.fen());
        line.forEach(function (m) { if (looseMove(g, m)) out.push(g.fen()); });
      });
    });
    return out.filter(function (f) { return new Chess(f).moves().length; });
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function drillNext() {
    const pool = drillPositions();
    if (!pool.length || drill.n >= drill.of) return drillStop();
    drill.fen = pick(pool);
    const de = voiceLang() === "de";
    const moves = new Chess(drill.fen).moves({ verbose: true });
    const lonely = moves.filter(function (m) { return moves.filter(function (x) { return x.to === m.to; }).length === 1; });
    const roll = Math.random();
    if (roll < 0.25) {
      const w = pick(DRILL_WORDS[voiceLang()]);
      drill.target = { label: "cmd:" + w, show: "“" + w + "”" };
    } else if (roll < 0.35) {
      drill.target = { label: "noise", show: de ? "🤫 Stille — oder ein Geräusch: räuspern, klopfen, „äh“, ein Satz"
        : "🤫 Silence — or a sound: cough, knock, “um”, a sentence" };
    } else if (roll < 0.5 && lonely.length) {
      const m = pick(lonely);
      drill.target = { label: "sq:" + m.to, show: m.to + (de ? "  (nur das Feld)" : "  (the square alone)") };
    } else {
      const san = pick(moves).san;
      drill.target = { label: san, show: de ? san.replace(/^[NBRQK]/, function (p) { return DE_PIECE[p]; }) : san };
    }
    document.getElementById("drillSay").textContent = drill.target.show;
    document.getElementById("drillCount").textContent = (drill.n + 1) + " / " + drill.of + " · recognised " + drill.right;
  }
  function drillStart() {
    drill.on = true; drill.n = 0; drill.right = 0;
    document.getElementById("drillPanel").classList.remove("hidden");
    document.getElementById("drillStart").textContent = "Stop drill";
    drillNext();
    heard("Training: hold 🎤 or turn on 🎧, say what is shown — for 🤫 stay quiet or make a sound. \"skip\" skips one.");
  }
  function drillStop() {
    drill.on = false;
    document.getElementById("drillStart").textContent = "Start voice drill";
    document.getElementById("drillSay").textContent = "";
    heard(drill.n ? "Drill done: " + drill.right + " of " + drill.n + " recognised." : "");
  }
  // Did the model hear what was asked? For 🤫: right when it heard no move and no command.
  function drillJudge(label, text, conf) {
    const g = new Chess(drill.fen);
    const sure = function (need) { return typeof conf !== "number" || conf >= need; };
    if (label === "noise") return !text || /^[\[(]/.test(text) || !sure(SURE.move) || (!commandOf(text) && !CHESSY.test(text));
    if (label.indexOf("cmd:") === 0) return sure(SURE.command) && commandOf(text) === commandOf(label.slice(4));
    const got = spokenToSan(text).split(" ")[0] || "";
    const mv = got && sure(SURE.move) ? looseMove(g, got) : null;
    if (label.indexOf("sq:") === 0) return !!mv && mv.to === label.slice(3);
    return !!mv && norm(mv.san) === norm(label);
  }
  function drillHear(blob) {
    return recognise(blob, new Chess(drill.fen), true).then(function (result) {
      const label = drill.target.label;
      const cmd = commandOf(result.text);
      // "skip" / "stop" steer the drill — unless that word is the one being trained.
      if (label.indexOf("cmd:") !== 0) {
        if (cmd === "stop") return drillStop();
        if (cmd === "skip") return drillNext();
      }
      const ok = drillJudge(label, result.text, result.conf);
      drill.n++; if (ok) drill.right++;
      const sure = typeof result.conf === "number" ? " · sure " + Math.round(result.conf * 100) + " %" : "";
      heard((ok ? "✓ " : "✗ ") + "“" + (result.heard || "—") + "”" + sure + (ok ? "" : " (wanted " + drill.target.show + ")"));
      return saveSample(blob, label, result.heard, "drill", { fen: drill.fen, conf: result.conf }).then(drillNext);
    });
  }

  function renderSampleStats(stats) {
    const el = document.getElementById("drillStats");
    if (!el) return;
    if (stats && stats.count != null) { el.textContent = "Saved on this Mac (" + voiceLang().toUpperCase() + "): " + stats.count + " recordings"; return; }
    fetch(VOICE_URL + "/samples").then(function (r) { return r.json(); }).then(function (all) {
      const mine = all[voiceLang()];
      el.textContent = "Saved on this Mac (" + voiceLang().toUpperCase() + "): " + (mine ? mine.count : 0) + " recordings";
    }, function () { el.textContent = ""; });
  }

  function listenStart() {
    if (listen.on) return;
    if (!voice.ready) {
      heard("Voice is off. In a terminal: python3 scripts/voice_server.py — then press 🎧 again.");
      voiceCheck();
      return;
    }
    listen.on = true;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) {
        if (!listen.on) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const node = ctx.createScriptProcessor(2048, 1, 1);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        const push = makeSegmenter(ctx.sampleRate, function (frames) {
          if (listen.on) utterance(wavBlob(frames, ctx.sampleRate));
        });
        node.onaudioprocess = function (e) { push(new Float32Array(e.inputBuffer.getChannelData(0))); };
        src.connect(node); node.connect(mute); mute.connect(ctx.destination);
        Object.assign(listen, { ctx: ctx, stream: stream, node: node });
        document.getElementById("boardListen").classList.add("on");
        document.getElementById("boardListen").setAttribute("aria-pressed", "true");
        rememberListen(true);
        if (ctx.state === "suspended") {
          // Opened at page load: Chrome holds audio until the first click or key on the page.
          heard("🎧 is back on — click anywhere or press a key once to open the microphone.");
          listen.wake = function () {
            unwake();
            if (ctx.state === "suspended") ctx.resume().then(function () { if (listen.on) heard(LISTEN_HINT); }, function () { /* closed meanwhile */ });
          };
          ["pointerdown", "keydown"].forEach(function (t) { document.addEventListener(t, listen.wake, true); });
        } else heard(LISTEN_HINT);
      }, function () { listen.on = false; heard("No microphone: allow it for this page in Chrome's address bar."); });
  }

  function unwake() {
    if (listen.wake) ["pointerdown", "keydown"].forEach(function (t) { document.removeEventListener(t, listen.wake, true); });
    listen.wake = null;
  }

  function listenStop() {
    listen.on = false;
    unwake();
    if (listen.node) listen.node.disconnect();
    if (listen.stream) listen.stream.getTracks().forEach(function (t) { t.stop(); });
    if (listen.ctx) listen.ctx.close();
    Object.assign(listen, { ctx: null, stream: null, node: null });
    const btn = document.getElementById("boardListen");
    if (btn) { btn.classList.remove("on"); btn.setAttribute("aria-pressed", "false"); }
  }

  // One utterance: a move (or a few), or a command. Into the answer box when the step takes a
  // written line, so the board follows it and grades it; otherwise straight onto the board.
  function voiceApply(text) {
    const said = String(text || "").trim();
    if (!said || /^[\[(].*[\])]$/.test(said)) { heard("Did not catch a move. Say it again."); return {}; }
    const words = said.toLowerCase().replace(/[.,!?]/g, " ").trim().split(/\s+/);
    const only = function (set) { return words.length <= 2 && words.some(function (w) { return w in set; }); };
    const command = only(SPOKEN.undo) ? "undo" : only(SPOKEN.reset) ? "reset" : null;
    // "done" is the spoken Lock: stopping the line stays his decision, hands-free or not.
    if (only(SPOKEN.done)) {
      // What Lock says (next variation, a wrong ply, open questions) is shown under the board too,
      // where he is looking — the form's message line is far below it.
      const err = document.getElementById("boardErr");
      err.textContent = "";
      lockStep(true);
      const said2 = err.textContent || (locked[step] ? "locked" : "");
      cue(locked[step] || /^Locked/.test(said2));
      heard("“" + said + "” → Lock" + (said2 ? ": " + said2 : ""));
      return { command: "done" };
    }
    if (only(SPOKEN.stop)) { listenStop(); rememberListen(false); heard("Stopped listening."); return { command: "stop" }; }
    const nav = commandOf(said);
    if (nav === "skip" || nav === "prev" || nav === "redo" || nav === "flip") {
      heard("Heard “" + said + "” → " + spokenNav(nav));
      return { command: nav };
    }
    // A move is checked before it goes anywhere: what is not legal here never enters the line,
    // so a misheard move costs nothing — a low tone, and he says it again.
    const taken = command ? { moves: [], bad: null, why: "" } : legalPrefix(positionNow(), spokenToSan(said));
    if (!command && !taken.moves.length) {
      cue(false);
      heard("✗ “" + said + "” → " + taken.why + " Say it again.");
      return { rejected: true };
    }
    const san = taken.moves.join(" ");
    const rest = taken.bad ? " · did not get " + taken.bad + " (" + taken.why.replace(/\.$/, "") + "), say it again" : "";
    if (takesLine()) voiceIntoLine(command, taken.moves);
    else if (command === "undo") navigate("back");
    else if (command === "reset") { game = new Chess(cur().fen); selected = null; renderBoard(); }
    else {
      taken.moves.forEach(function (m) { keepFuture(game.move(m)); });
      renderBoard();
      autoCheck();
    }
    cue(!taken.bad);
    heard("✓ “" + said + "” → " + (command || san) + rest);
    return { san: command ? "" : san, command: command, rejected: !!taken.bad };
  }

  // The moves of a spoken line that are legal one after another, in real SAN; the first one that
  // is not, and why — ambiguous (two pieces can go there) is named, so he can say which.
  function legalPrefix(g0, san) {
    const g = new Chess(g0.fen());
    const out = { moves: [], bad: null, why: "" };
    const words = String(san || "").split(" ").filter(Boolean);
    if (!words.length) { out.why = "not a move."; return out; }
    for (let i = 0; i < words.length; i++) {
      const mv = looseMove(g, words[i]);
      if (mv) { out.moves.push(mv.san); continue; }
      out.bad = words[i];
      const to = (words[i].match(/[a-h][1-8]/g) || []).pop();
      const piece = (words[i].match(/^[KQRBN]/) || ["P"])[0].toLowerCase();
      const onlySquare = /^[a-h][1-8][+#]?$/.test(words[i]);    // "f7": any piece that can go there
      const fits = to ? g.moves({ verbose: true }).filter(function (m) { return m.to === to && (onlySquare || m.piece === piece); }) : [];
      out.why = fits.length > 1 ? "which one: " + fits.map(function (m) { return m.san; }).join(" or ") + "?"
        : SAN_RE.test(words[i]) ? words[i] + " is not legal here." : "not a move.";
      break;
    }
    return out;
  }

  window.pathLegalPrefix = function (fen, san) { return legalPrefix(new Chess(fen), san); };

  // Short tones so he need not look: a tick when a move went in, a low double tone when it did not.
  // Echo cancellation keeps them out of the microphone; they are shorter than the shortest utterance anyway.
  let cueCtx = null;
  // A line solved: the board says so where he is looking. Clean (right on the first try) gets confetti,
  // a rising three-note chime and the streak of clean solves in a row (kept on this device).
  const STREAK_KEY = "zwischenzug_streak";
  function celebrate(clean) {
    let streak = 0;
    try {
      streak = clean ? (Number(localStorage.getItem(STREAK_KEY)) || 0) + 1 : 0;
      localStorage.setItem(STREAK_KEY, String(streak));
    } catch (e) { /* private mode: no streak, still the effect */ }
    const board = document.getElementById("chessBoard");
    if (!board || !board.getBoundingClientRect) return;
    const r = board.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "win-layer";
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    layer.innerHTML = "<div class='win-check'>✓</div>" + (streak >= 2 ? "<div class='win-streak'>🔥 " + streak + " in a row</div>" : "");
    if (clean) {
      const colors = ["#ffd75e", "#2eb460", "#ffffff", "#f2a33a", "#7fd6a0"];
      for (let i = 0; i < 42; i++) {
        const bit = document.createElement("i");
        const a = Math.random() * Math.PI * 2, d = r.width * (0.35 + Math.random() * 0.45);
        bit.className = "win-bit";
        bit.style.background = colors[i % colors.length];
        bit.style.setProperty("--dx", Math.cos(a) * d + "px");
        bit.style.setProperty("--dy", Math.sin(a) * d - r.width * 0.12 + "px");
        bit.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
        bit.style.animationDelay = Math.random() * 0.08 + "s";
        layer.appendChild(bit);
      }
    }
    document.body.appendChild(layer);
    board.classList.remove("win-glow");
    void board.offsetWidth;                                // restart the glow if it is still running
    board.classList.add("win-glow");
    setTimeout(function () { layer.remove(); board.classList.remove("win-glow"); }, 1700);
    chime(clean);
  }
  window.pathCelebrate = celebrate;

  function chime(clean) {
    try {
      cueCtx = cueCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (cueCtx.state === "suspended") cueCtx.resume();
      (clean ? [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]] : [[659, 0], [784, 0.1]]).forEach(function (n) {
        const o = cueCtx.createOscillator(), v = cueCtx.createGain(), t = cueCtx.currentTime + n[1];
        o.type = "triangle";
        o.frequency.value = n[0];
        v.gain.setValueAtTime(0.0001, t);
        v.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
        v.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(v); v.connect(cueCtx.destination);
        o.start(t); o.stop(t + 0.4);
      });
    } catch (e) { /* no audio */ }
  }

  function cue(ok) {
    try {
      cueCtx = cueCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (cueCtx.state === "suspended") cueCtx.resume();
      (ok ? [[1320, 0]] : [[330, 0], [247, 0.13]]).forEach(function (n) {
        const o = cueCtx.createOscillator(), v = cueCtx.createGain(), t = cueCtx.currentTime + n[1];
        o.frequency.value = n[0];
        v.gain.setValueAtTime(0.0001, t);
        v.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
        v.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.07 : 0.11));
        o.connect(v); v.connect(cueCtx.destination);
        o.start(t); o.stop(t + 0.13);
      });
    } catch (e) { /* no audio: the text line still says it */ }
  }
  window.pathVoiceApply = voiceApply;

  // Spoken navigation, so a whole session runs without the mouse: next / previous step, redo, flip.
  // "next" on the last step opens the next unfinished session of the same group (drill after drill).
  function spokenNav(nav) {
    if (nav === "flip") { flipBoard(); return "board turned"; }
    if (nav === "redo") {
      if (!locked[step]) return "nothing to redo, this step is open";
      redoStep();
      return "step reopened";
    }
    if (nav === "prev") {
      if (step === 0) return "already the first step";
      captureAnswers(); saveProgress(); loadStep(step - 1);
      return "step " + (step + 1) + ": " + cur().name;
    }
    if (step < steps().length - 1) {
      captureAnswers(); saveProgress(); loadStep(step + 1);
      return "step " + (step + 1) + ": " + cur().name;
    }
    const nextId = nextOpenSession();
    if (!nextId) return "last step, and nothing open after this session";
    captureAnswers(); saveProgress();
    loadSession(nextId);
    return (session.title || nextId);
  }

  function sessionDone(id) {
    const all = sessions()[id].steps || [];
    const p = typeof window.pathProgress === "object" ? window.pathProgress.get(id) : { steps: {} };
    return all.length > 0 && all.every(function (st, i) {
      const e = p.steps[st.id || ("step" + i)];
      return !!(e && e.locked);
    });
  }

  // Drills in a group go in id order (6-01, 6-02 …); games newest first, like the picker.
  function nextOpenSession() {
    const group = session && session.group;
    const ids = group
      ? Object.keys(sessions()).filter(function (id) { return sessions()[id].group === group; }).sort()
      : orderedIds().filter(function (id) { return !sessions()[id].group; });
    const at = ids.indexOf(sessionId);
    const order = ids.slice(at + 1).concat(ids.slice(0, Math.max(0, at)));
    return order.find(function (id) { return !sessionDone(id); }) || null;
  }
  window.pathVoiceUtterance = function (blob) { utterance(blob || new Blob(["x"], { type: "audio/wav" })); return listen.queue; };

  // The board notices a finished line by itself. Lock stays for "I stop here" and for the questions.
  function autoCheck() {
    if (locked[step] || !game) return;
    const s = cur();
    const played = game.history();
    if (takesLine()) {
      let lines;
      if (s.type === "stopPly") {
        const sp = s.stopPly || {};
        lines = [[sp.candidate, sp.scare].concat(sp.continue || [])];
      } else if (s.type === "solve") {
        lines = [(s.solve || {}).line || []].concat((s.solve || {}).alts || []);
      } else {
        const b = writeBranch();
        lines = [b.mustPlay || []].concat(b.alts || []);
      }
      const exact = lines.some(function (l) { return sameLine(l, played); });
      const longest = Math.max.apply(null, lines.map(function (l) { return l.length; }));
      if ((exact || played.length >= longest) && fillAnswer(played)) lockStep();
      return;
    }
    const need = mustPlayNow();
    if (need.length && historyMatches(need)) lockStep();
  }

  // fromVoice: he is looking at the board, so no field gets the focus (no scroll, no phone keyboard).
  function lockStep(fromVoice) {
    clearTimeout(followTimer);                  // a pending follow must not wipe the grade's message
    const form = document.getElementById("boardForm");
    const s = cur();
    const err = document.getElementById("boardErr");
    const wb = writeBranch();
    const written = ((s.type === "stopPly" || s.type === "solve") && !stopPassed) || !!wb;
    let won = false;                            // a graded line passed in this Lock: celebrate once, below
    const celebrateOnce = function () { if (won) celebrate(!firstMiss); won = false; };
    if (written) {
      const graded = wb ? gradeBranch(wb, form) : s.type === "solve" ? gradeSolve(s, form) : gradeStopPly(s, form);
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
        err.textContent = graded.msg;
        return;
      }
      let line = graded.line;
      won = true;
      if (!wb) {
        stopPassed = true;
        passedLine = graded.line || null;
        line = mustPlayNow();
        document.getElementById("boardKey").classList.remove("show");
        document.getElementById("boardKey").innerHTML = "";
        renderVariations();
      }
      // Nothing to replay by hand: the line that passed goes on the board.
      if (!historyMatches(line)) rewindTo(line, line.length);
    }
    const need = mustPlayNow();
    if (!historyMatches(need)) {
      celebrateOnce();
      err.textContent = "On the board play: " + need.join(" ");
      return;
    }
    if (s.branches && s.branches.length && !branchLocked[activeBranch]) {
      won = true;                               // a variation played or written to its end
      if (lockBranch()) { celebrateOnce(); return; }
    }
    // The questions come last, so a finished line is never held up by an empty box.
    const missing = Array.from(form.querySelectorAll("[required]")).filter(function (el) {
      return !String(el.value || "").trim();
    });
    if (missing.length) {
      celebrateOnce();
      err.textContent = written || need.length || (s.branches || []).length
        ? "Line done. Answer the questions, then press Enter or Lock."
        : "Fill every field.";
      if (!fromVoice) missing[0].focus({ preventScroll: true });
      return;
    }
    locked[step] = true;
    celebrateOnce();
    captureAnswers();
    const entry = entryFor(stepId(step));
    entry.locked = true;
    entry.passed = stopPassed;
    entry.branches = (cur().branches || []).filter(function (b, i) { return branchLocked[i]; })
      .map(function (b) { return b.id; });
    saveProgress();
    const key = document.getElementById("boardKey");
    key.innerHTML = (s.branches || []).map(function (b) { return b.key || ""; }).join("") + (s.key || "");
    key.classList.add("show");
    // A host page (hosted.js) may add an engine check of the locked line — only ever after Lock.
    // Listeners (training.js) hear which step locked and whether it was right on the first try.
    const lockInfo = { sessionId: session && session.id, stepId: stepId(step), clean: !firstMiss,
      fen: s.fen, line: game.history(), key: key, listening: listen.on, lang: voiceLang() };
    if (typeof window.PATH_AFTER_LOCK === "function") window.PATH_AFTER_LOCK(lockInfo);
    document.dispatchEvent(new CustomEvent("path:locked", { detail: lockInfo }));
    document.getElementById("boardLock").disabled = true;
    document.getElementById("boardRedo").classList.remove("hidden");
    document.getElementById("boardNext").disabled = step >= steps().length - 1;
    document.getElementById("boardErr").textContent = "";
    renderBoard();
    renderVariations();
    const logAs = session.logAs || {};
    if (step === steps().length - 1 && logAs.kind === "aagaard" && typeof window.pathLogAagaard === "function" && !progress.logged) {
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
      progress.logged = true;
      saveProgress();
    } else if (step === steps().length - 1 && typeof window.pathLogGame === "function") {
      const noteEl = form.note;
      window.pathLogGame({
        date: new Date().toISOString().slice(0, 10),
        event: session.event || session.id,
        result: session.result || "",
        tag: (form.tag && form.tag.value) || "calculation",
        category: session.category || "",
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
    passedLine = null;
    stepStarted = Date.now();
    const entry = entryFor(stepId(n));
    stopPassed = !!entry.passed;
    branchLocked = (cur().branches || []).map(function (b) {
      return entry.branches.indexOf(b.id) !== -1;
    });
    // Resume on the first line still open.
    activeBranch = Math.max(0, branchLocked.indexOf(false));
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
    // Optional `group` puts sessions under an optgroup; ungrouped ones are "Games", split by category.
    const groups = [];
    ids.forEach(function (id) {
      const c = categoryOf(sessions()[id]);
      const name = sessions()[id].group || (c ? "Games · " + c.label : "Games");
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

  function renderCategory() {
    const el = document.getElementById("boardCategory");
    if (!el) return;
    const c = categoryOf(session);
    el.classList.toggle("hidden", !c);
    el.innerHTML = c ? "<b>" + esc(c.label) + "</b> · " + esc(c.followUp) : "";
  }

  function loadSession(id) {
    sessionId = id;
    session = id ? sessions()[id] : null;
    // Orientation belongs to the session: deriving it per step would spin the board
    // between a step where Black is to move and the next where White is.
    flipped = !!session && startOf(session.startFen || (session.steps && session.steps[0] && session.steps[0].fen) || "").black;
    progress = (typeof window.pathProgress === "object" && id)
      ? window.pathProgress.get(id)
      : { at: "", logged: false, steps: {} };
    locked = steps().map(function (s, i) {
      const e = progress.steps[stepId(i)];
      return !!(e && e.locked);
    });
    renderPicker();
    renderCategory();
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
    if (writeBranch()) return true;
    return (t === "solve" || t === "stopPly") && !stopPassed && !locked[step];
  }

  // What the answer boxes say, as plies from the step position.
  function writtenLine(s, form) {
    const wb = writeBranch();
    if (wb) return branchWritten(wb, form);
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
    const wb = writeBranch();
    if (wb) {
      const given = (wb.mustPlay || []).slice(0, givenOf(wb));
      if (!startsWith(moves.map(norm), given)) {
        err.textContent = "Start the board line with " + given.join(" ") + ".";
        return false;
      }
      box = form.elements.line;
      box.value = numbered(s.fen, moves.slice(given.length), given.length);
    } else if (s.type === "solve") {
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
    box.focus({ preventScroll: true });
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
      if (e.key === "f") { e.preventDefault(); flipBoard(); return; }
      if (e.key === "v") { e.preventDefault(); if (!e.repeat) voiceStart(); return; }
      if (e.key === "l") { e.preventDefault(); if (listen.on) { listenStop(); rememberListen(false); heard("Stopped listening."); } else listenStart(); return; }
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
    document.getElementById("boardRedo").addEventListener("click", redoStep);
    document.getElementById("boardFlip").addEventListener("click", flipBoard);
    const mic = document.getElementById("boardMic");
    if (mic) {
      mic.addEventListener("pointerdown", function (e) { e.preventDefault(); voiceStart(); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (t) { mic.addEventListener(t, voiceStop); });
      const langBtn = document.getElementById("boardVoiceLang");
      langBtn.textContent = voiceLang().toUpperCase();
      langBtn.addEventListener("click", function () {
        const next = voiceLang() === "en" ? "de" : "en";
        try { localStorage.setItem(VOICE_LANG_KEY, next); } catch (e) { /* ignore */ }
        langBtn.textContent = next.toUpperCase();
      });
      document.addEventListener("keyup", function (e) { if (e.key === "v") voiceStop(); });
      const drillBtn = document.getElementById("drillStart");
      if (drillBtn) {
        drillBtn.addEventListener("click", function () { if (drill.on) drillStop(); else drillStart(); });
        const keep = document.getElementById("drillKeep");
        keep.checked = keepSamples();
        keep.addEventListener("change", function () { try { localStorage.setItem(SAMPLE_KEY, keep.checked ? "1" : "0"); } catch (e) { /* ignore */ } });
        document.getElementById("voiceDrill").addEventListener("toggle", function () { renderSampleStats(); });
      }
      const listenBtn = document.getElementById("boardListen");
      if (listenBtn) listenBtn.addEventListener("click", function () { if (listen.on) { listenStop(); rememberListen(false); heard("Stopped listening."); } else listenStart(); });
      voiceCheck();
    }
    // Enter in an answer box locks; without this a one-field form submits and reloads the page.
    document.getElementById("boardForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!locked[step]) lockStep();
    });
    document.getElementById("boardForm").addEventListener("input", function (e) {
      const name = e.target && e.target.name;
      if (name === "line" || name === "scare" || name === "continue") followAnswer();
    });
    // A form with several text boxes has no implicit submit, so Enter is caught here too.
    document.getElementById("boardForm").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.isComposing || !e.target || e.target.tagName !== "INPUT") return;
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
