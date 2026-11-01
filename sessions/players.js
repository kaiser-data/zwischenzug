// Invited players on the hosted page. A signed-in guest sees Training plus the games written for
// them (`"player": "<id>"` in sessions/<id>.json); the owner and the local file:// page see everything.
// Public repo: no email addresses here, only sha256 of the lowercased address (googlemail = gmail),
// made with `python3 scripts/invite.py --hash <email>`.
(function () {
  window.PATH_PLAYERS = {
    nico: { name: "Nico", level: 1350, emails: [] },
    ferho: { name: "Ferho", level: 1600, emails: ["e15288627ee7b72b6d39a208db6e9f2649291e6b3a20a6a36638fd65f681563e"] },
    fabian: { name: "Fabian", level: 2200, emails: ["a840c60708168d29679f5f6c26169f7aefc0a99f067fcd382ca72a4fb0029e2d"] }
  };

  function canonical(email) {
    email = String(email || "").trim().toLowerCase();
    return email.endsWith("@googlemail.com") ? email.slice(0, -"@googlemail.com".length) + "@gmail.com" : email;
  }

  // Resolves to the player id for this email, or "" (https / localhost only: crypto.subtle needs a secure page).
  window.pathPlayerOf = function (email) {
    if (!window.crypto || !crypto.subtle || !email) return Promise.resolve("");
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(email))).then(function (buf) {
      const hex = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      const players = window.PATH_PLAYERS;
      return Object.keys(players).find(function (id) { return players[id].emails.indexOf(hex) >= 0; }) || "";
    });
  };
})();
