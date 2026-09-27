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
    undo: { "zurück": 1, zurueck: 1, zur: 1, back: 1, undo: 1, "rückgängig": 1 },
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
    return fits.length === 1 ? g.move(fits[0]) : null;
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
  const voice = { ready: false, stream: null, rec: null, chunks: [], started: 0 };

  function voiceLang() {
    try { return localStorage.getItem(VOICE_LANG_KEY) === "de" ? "de" : "en"; } catch (e) { return "en"; }
  }

  function setVoiceReady(ok) {
    voice.ready = ok;
    const btn = document.getElementById("boardMic");
    if (!btn) return;
    btn.setAttribute("aria-disabled", ok ? "false" : "true");
    btn.title = ok ? "Hold and say one move (or hold v). Commands: back, reset"
      : "Voice is off. Start it with: python3 scripts/voice_server.py";
  }

  function voiceCheck() {
    if (typeof fetch !== "function") return;
    fetch(VOICE_URL + "/health").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { setVoiceReady(!!(j && j.ok)); }, function () { setVoiceReady(false); });
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
    const blob = new Blob(voice.chunks, { type: rec.mimeType });
    heard("…");
    fetch(VOICE_URL + "/transcribe?lang=" + voiceLang(), { method: "POST", body: blob, headers: { "Content-Type": rec.mimeType } })
      .then(function (r) { return r.json(); })
      .then(function (j) { voiceApply(j.text || ""); }, function () { setVoiceReady(false); heard("Voice server stopped."); });
  }

  // One utterance: a move (or a few), or a command. Into the answer box when the step takes a
  // written line, so the board follows it and grades it; otherwise straight onto the board.
  function voiceApply(text) {
    const said = String(text || "").trim();
    if (!said || /^[\[(].*[\])]$/.test(said)) { heard("Did not catch a move. Hold 🎤 and say it again."); return ""; }
    const words = said.toLowerCase().replace(/[.,!?]/g, " ").trim().split(/\s+/);
    const command = words.length <= 2 && words.some(function (w) { return w in SPOKEN.undo; }) ? "undo"
      : words.length <= 2 && words.some(function (w) { return w in SPOKEN.reset; }) ? "reset" : null;
    const san = spokenToSan(said);
    if (takesLine()) {
      const form = document.getElementById("boardForm");
      const s = cur();
      let box = form.elements.line;
      if (s.type === "stopPly" && !writeBranch()) {
        box = String(form.elements.scare.value).trim() || command ? form.elements["continue"] : form.elements.scare;
        if (command && !String(box.value).trim()) box = form.elements.scare;
      }
      // Re-read the whole box so "back" / "reset" act on what is already written.
      box.value = spokenToSan(box.value + " " + said);
      followAnswer();
      heard("Heard “" + said + "” → " + (command || san || "?"));
      return box.value;
    }
    if (command === "undo") navigate("back");
    else if (command === "reset") { game = new Chess(cur().fen); selected = null; renderBoard(); }
    else {
      const bad = san.split(" ").filter(Boolean).find(function (m) {
        const move = looseMove(game, m);
        if (move) keepFuture(move);
        return !move;
      });
      renderBoard();
      if (bad) { heard("Heard “" + said + "” → " + bad + " is not legal here."); return san; }
      autoCheck();
    }
    heard("Heard “" + said + "” → " + (command || san));
    return san;
  }
  window.pathVoiceApply = voiceApply;

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

  function lockStep() {
    clearTimeout(followTimer);                  // a pending follow must not wipe the grade's message
    const form = document.getElementById("boardForm");
    const s = cur();
    const err = document.getElementById("boardErr");
    const wb = writeBranch();
    const written = ((s.type === "stopPly" || s.type === "solve") && !stopPassed) || !!wb;
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
      err.textContent = "On the board play: " + need.join(" ");
      return;
    }
    if (s.branches && s.branches.length && !branchLocked[activeBranch] && lockBranch()) return;
    // The questions come last, so a finished line is never held up by an empty box.
    const missing = Array.from(form.querySelectorAll("[required]")).filter(function (el) {
      return !String(el.value || "").trim();
    });
    if (missing.length) {
      err.textContent = written || need.length || (s.branches || []).length
        ? "Line done. Answer the questions, then press Enter or Lock."
        : "Fill every field.";
      missing[0].focus();
      return;
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
    key.innerHTML = (s.branches || []).map(function (b) { return b.key || ""; }).join("") + (s.key || "");
    key.classList.add("show");
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
      if (e.key === "f") { e.preventDefault(); flipBoard(); return; }
      if (e.key === "v") { e.preventDefault(); if (!e.repeat) voiceStart(); return; }
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
