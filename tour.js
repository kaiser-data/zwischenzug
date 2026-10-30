// A short guided tour of the Board tab: one highlighted control at a time, with a sentence on what it does.
// Starts by itself once for a hosted invitee (hosted.js calls pathTour.maybeStart), with ?tour=1, or from
// the "Board tour" link. Stops whose control is missing or hidden on this screen are skipped.
(function () {
  const DONE = "zz_tour_done";
  const STOPS = [
    { title: "Welcome to the board",
      text: "A two-minute tour of the buttons. Tap <b>Next</b>, or <b>Skip</b> to start right away. The tour is under <b>Board tour</b> at the bottom of the page." },
    { el: "#sessionPickWrap", title: "What to work on",
      text: "<b>Your games</b>: your own games, turned into short lessons. <b>Training</b>: a few new positions every day from real Lichess games, near your rating." },
    { el: "#trainingLevel:not(.hidden)", title: "Your level",
      text: "Right on the first try: +40. A miss: −40, and the position comes back in two days. <b>Settings</b> changes how many a day, how hard, and the theme." },
    { el: "#boardSteps", title: "Steps",
      text: "Each lesson is a few steps. Tap any step to jump there. A finished step turns green." },
    { el: "#boardTitle", title: "The task",
      text: "Read it, then think <i>before</i> you touch a piece. Who is to move is in the title." },
    { el: "#branchList:not(.hidden)", title: "Tasks, one card at a time",
      text: "Each step is a few cards, like levels. <b>Find</b>: a move to find. <b>Your line</b>: write how it goes on. <b>Watch</b>: tap ▶ to follow a line. Solve a card and the next one unlocks; the dots show where you are, ‹ › go back. Stuck? <b>Hint</b>." },
    { el: "#chessBoard", title: "The board",
      text: "Tap a piece, then a square (or drag it). <b>◀ ▶</b> step back and forward through your moves. A wrong move is fine: step back and try again." },
    { el: "#boardForm input[type=text], #branchWrite input", title: "Write your line",
      text: "Type moves like on Lichess: <b>a4</b>, <b>Nxd3+</b>, <b>O-O</b>, both sides, until nothing more can be taken. The board shows each move as you type it. <b>Enter</b> checks it." },
    { el: "#boardLock", title: "Lock",
      text: "<b>Lock</b> means “this is my answer.” A finished line is checked by itself. After Lock you get the key, the idea in plain words, and the engine's verdict on your line." },
    { el: "#boardNext", title: "Next",
      text: "On to the next step. <b>↺ Redo</b> appears after Lock if you want to try a step again." },
    { el: "#boardListen:not([aria-disabled=true])", title: "Talk instead of typing",
      text: "Optional: tap 🎧 and say moves (“knight f5”, “queen takes d3”), “back” to undo, “done” to lock. EN/DE switches the language." },
    { title: "Ready",
      text: "Start with step 1 of your game. Calculate first, then write the line to the end. That is the whole trick." }
  ];

  let at = 0, box = null, ring = null, card = null, list = [];

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }
  function target(stop) {
    if (!stop.el) return null;
    const hits = Array.from(document.querySelectorAll(stop.el)).filter(visible);
    return hits[0] || null;
  }

  function build() {
    box = document.createElement("div");
    box.className = "tour";
    box.innerHTML = '<div class="tour-ring"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle">' +
      '<p class="tour-count"></p><h3 id="tourTitle"></h3><p class="tour-text"></p>' +
      '<div class="tour-row"><button type="button" class="tour-skip">Skip</button>' +
      '<span><button type="button" class="tour-back">Back</button> <button type="button" class="tour-next">Next</button></span></div></div>';
    document.body.appendChild(box);
    ring = box.querySelector(".tour-ring");
    card = box.querySelector(".tour-card");
    box.querySelector(".tour-skip").addEventListener("click", stop);
    box.querySelector(".tour-back").addEventListener("click", function () { if (at > 0) show(at - 1); });
    box.querySelector(".tour-next").addEventListener("click", function () { if (at < list.length - 1) show(at + 1); else stop(); });
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  }

  function onKey(e) {
    if (!box) return;
    if (e.key === "Escape") { e.preventDefault(); stop(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); box.querySelector(".tour-next").click(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); box.querySelector(".tour-back").click(); }
  }

  function show(i) {
    at = i;
    const s = list[i];
    box.querySelector(".tour-count").textContent = (i + 1) + " of " + list.length;
    box.querySelector("#tourTitle").textContent = s.title;
    box.querySelector(".tour-text").innerHTML = s.text;
    box.querySelector(".tour-back").disabled = i === 0;
    box.querySelector(".tour-next").textContent = i === list.length - 1 ? "Start" : "Next";
    const el = target(s);
    if (el) el.scrollIntoView({ block: "center" });
    place();
    box.querySelector(".tour-next").focus({ preventScroll: true });
  }

  // The ring sits on the control; the card goes above or below it, whichever side has more room.
  function place() {
    if (!box) return;
    const el = target(list[at]);
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    card.style.left = card.style.top = "";
    if (!el) {
      ring.style.display = "none";
      box.classList.add("tour-dim");
      card.style.left = Math.max(12, (vw - card.offsetWidth) / 2) + "px";
      card.style.top = Math.max(12, (vh - card.offsetHeight) / 2) + "px";
      return;
    }
    box.classList.remove("tour-dim");
    const r = el.getBoundingClientRect();
    const pad = 6;
    const top = Math.max(4, r.top - pad), bottom = Math.min(vh - 4, r.bottom + pad);
    ring.style.display = "block";
    ring.style.left = Math.max(4, r.left - pad) + "px";
    ring.style.top = top + "px";
    ring.style.width = Math.min(vw - 8, r.width + pad * 2) + "px";
    ring.style.height = Math.max(0, bottom - top) + "px";
    const h = card.offsetHeight, w = card.offsetWidth;
    const below = vh - bottom, above = top;
    let y = below >= h + 12 ? bottom + 10 : above >= h + 12 ? top - h - 10 : vh - h - 12;
    y = Math.max(12, Math.min(vh - h - 12, y));
    const x = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2));
    card.style.left = x + "px";
    card.style.top = y + "px";
  }

  function stop() {
    try { localStorage.setItem(DONE, "1"); } catch (e) {}
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    if (box) box.remove();
    box = null;
    const first = document.querySelector("#boardSteps button");
    if (first) first.focus({ preventScroll: true });
  }

  function start() {
    if (box) return;
    const board = document.querySelector('.tabs [data-tab="session"]');
    const panel = document.getElementById("panel-session");
    if (panel && panel.classList.contains("hidden") && board) board.click();
    list = STOPS.filter(function (s) { return !s.el || target(s); });
    build();
    show(0);
  }

  function seen() {
    try { return !!localStorage.getItem(DONE); } catch (e) { return true; }
  }

  window.pathTour = {
    start: start,
    // Once per device for an invitee, after the board has drawn its first step.
    maybeStart: function () {
      if (seen()) return;
      setTimeout(function () { if (!seen()) start(); }, 400);
    }
  };

  function bind() {
    const open = document.getElementById("tourOpen");
    if (open) open.addEventListener("click", start);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();

  if (new URLSearchParams(location.search).get("tour") === "1") {
    window.addEventListener("load", function () { setTimeout(start, 400); });
  }
})();
