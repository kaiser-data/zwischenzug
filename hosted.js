// Hosted mode (https, behind the Railway API on /api). On file:// this file does nothing:
// the local dossier keeps its local voice server and its localStorage, no login.
(function () {
  if (location.protocol !== "https:") return;

  window.PATH_VOICE_URL = "/api/voice";

  const css = document.createElement("style");
  css.textContent =
    ".zz-gate{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(20,18,14,.72);padding:16px}" +
    ".zz-card{background:var(--paper,#fbf8f1);color:var(--ink,#1d1b16);max-width:360px;width:100%;" +
    "border-radius:10px;padding:22px;font:16px/1.45 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.3)}" +
    ".zz-card h2{margin:0 0 6px;font-size:20px}.zz-card p{margin:0 0 14px;color:#5b564c;font-size:14px}" +
    ".zz-card input{width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:1px solid #c9c2b2;border-radius:8px}" +
    ".zz-card button{width:100%;margin-top:10px;font-size:16px;padding:12px;border-radius:8px;border:0;" +
    "background:#1d1b16;color:#fbf8f1;cursor:pointer}.zz-msg{margin-top:12px;font-size:14px;min-height:1em}" +
    ".zz-google{display:flex;justify-content:center;min-height:44px}.zz-me{font-size:12px;color:#7a7466;margin-top:6px}.zz-me a{color:inherit}" +
    ".zz-check{margin-top:10px;padding:10px 12px;border-left:3px solid #8a6d2b;background:rgba(138,109,43,.08)}" +
    ".zz-check b{display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#8a6d2b}";
  document.head.appendChild(css);

  function gate(note) {
    const box = document.createElement("div");
    box.className = "zz-gate";
    const google = window.PATH_GOOGLE_CLIENT_ID;
    box.innerHTML = '<form class="zz-card"><h2>Zwischenzug</h2>' + (google
      ? '<p>Invite only. Sign in with the Google account you were invited with.</p><div class="zz-google"></div>'
      : '<p>Invite only. Enter your email and open the link we send you.</p>' +
        '<input type="email" required autocomplete="email" placeholder="you@example.com">' +
        '<button type="submit">Send sign-in link</button>') + '<div class="zz-msg"></div></form>';
    const form = box.querySelector("form");
    const msg = box.querySelector(".zz-msg");
    msg.textContent = note || "";
    document.body.appendChild(box);
    if (google) { googleButton(box.querySelector(".zz-google"), msg, google); return; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const email = form.querySelector("input").value.trim();
      msg.textContent = "Sending…";
      fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); })
        .then(function () { msg.textContent = "If this email is invited, a link is on its way (valid 15 minutes). Check spam too."; })
        .catch(function () { msg.textContent = "Could not reach the server. Try again in a minute."; });
    });
  }

  // Google Identity Services: Google proves the address, the server checks it against the invite list.
  function googleButton(host, msg, clientId) {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onerror = function () { msg.textContent = "Could not load Google sign-in. Check the connection."; };
    script.onload = function () {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: function (res) {
          msg.textContent = "Checking the invite…";
          fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: res.credential }) })
            .then(function (r) {
              if (r.ok) { location.reload(); return; }
              msg.textContent = r.status === 403 ? "This Google account is not invited." : "Google sign-in failed. Try again.";
            })
            .catch(function () { msg.textContent = "Could not reach the server. Try again in a minute."; });
        }
      });
      google.accounts.id.renderButton(host, { theme: "filled_black", size: "large", text: "signin_with", width: 300 });
    };
    document.head.appendChild(script);
  }

  function signedIn(me) {
    const foot = document.querySelector(".sheet-foot") || document.body;
    const line = document.createElement("div");
    line.className = "zz-me";
    line.innerHTML = "Signed in as " + me.email.replace(/</g, "&lt;") + ' · <a href="#" id="zzOut">sign out</a>';
    foot.appendChild(line);
    document.getElementById("zzOut").addEventListener("click", function (e) {
      e.preventDefault();
      fetch("/api/auth/logout", { method: "POST" }).then(function () { location.href = "/"; });
    });
  }

  const params = new URLSearchParams(location.search);
  const note = params.get("login") === "expired" ? "That link was used or expired. Ask for a new one." : "";
  function start() {
    fetch("/api/auth/me").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { if (me) signedIn(me); else gate(note); })
      .catch(function () { gate("The server is not answering. Try again in a minute."); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  function say(text, lang) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text.replace(/…/g, " ").replace(/x/g, " takes "));
    u.lang = lang === "de" ? "de-DE" : "en-US";
    speechSynthesis.speak(u);
  }

  // After Lock only: the engine reads his line to the last capture. Sentences, never a number.
  window.PATH_AFTER_LOCK = function (info) {
    if (!info.line || !info.line.length) return;
    const box = document.createElement("div");
    box.className = "zz-check";
    box.innerHTML = "<b>Engine, after your Lock</b><span>Checking your line…</span>";
    info.key.appendChild(box);
    const out = box.querySelector("span");
    fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen: info.fen, line: info.line }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          out.textContent = res.status === 401 ? "Sign in again for the engine check. Your line is saved."
            : (typeof res.body.detail === "string" ? res.body.detail : "Engine check unavailable. Your line is saved.");
          return;
        }
        out.textContent = res.body.sentences.join(" ");
        if (info.listening) say(out.textContent, info.lang);
      })
      .catch(function () { out.textContent = "Engine check unavailable offline. Your line is saved."; });
  };
})();
