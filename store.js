// Persistence behind one interface, so the page never talks to a backend directly.
// Reads stay synchronous off an in-memory cache; only hydrate and commit are async.
// LocalStore is today's behaviour: one JSON blob in localStorage, works from file://.
(function () {
  const KEY = "chess_path_to_v1";

  function blank() {
    return { sessions: [], games: [], blitz: {}, checks: {}, aagaard: [], variations: {}, progress: {} };
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  // Merge `loaded` onto `state` in place: a key only overwrites the blank default
  // when it has the same shape (array vs. plain object) as that default. A null,
  // a wrong-typed value, or a primitive falls back to the default. Unknown keys
  // (not present in the blank shape) are copied through untouched.
  function mergeShaped(state, loaded) {
    const defaults = blank();
    Object.assign(state, defaults);
    if (!isPlainObject(loaded)) { return state; }
    Object.keys(loaded).forEach(function (key) {
      const value = loaded[key];
      if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
        state[key] = value;
        return;
      }
      const defaultValue = defaults[key];
      if (Array.isArray(defaultValue) && Array.isArray(value)) {
        state[key] = value;
      } else if (isPlainObject(defaultValue) && isPlainObject(value)) {
        state[key] = value;
      }
      // else: wrong shape, keep the default already assigned above.
    });
    return state;
  }

  // Calls a backend method that may throw synchronously or return a rejecting
  // promise. Either way this resolves with `fallback` instead of throwing or
  // leaving an unhandled rejection.
  function safely(fn, fallback) {
    let result;
    try {
      result = Promise.resolve(fn());
    } catch (e) {
      result = Promise.resolve(fallback);
    }
    return result.then(undefined, function () { return fallback; });
  }

  function localBackend(key) {
    return {
      name: "local",
      read: function () {
        try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
      },
      write: function (state) {
        // A full quota or a private window must not break the page; the cache stays correct.
        try { localStorage.setItem(key, JSON.stringify(state)); return true; } catch (e) { return false; }
      }
    };
  }

  // Two copies of the same state, e.g. phone and Mac: arrays are joined without duplicates,
  // objects are merged key by key, and where both have a plain value `mine` wins.
  function mergeStates(theirs, mine) {
    if (Array.isArray(theirs) && Array.isArray(mine)) {
      const seen = {};
      return theirs.concat(mine).filter(function (item) {
        const k = JSON.stringify(item);
        if (seen[k]) { return false; }
        seen[k] = true;
        return true;
      });
    }
    if (isPlainObject(theirs) && isPlainObject(mine)) {
      const out = Object.assign({}, theirs);
      Object.keys(mine).forEach(function (k) {
        out[k] = Object.prototype.hasOwnProperty.call(theirs, k) ? mergeStates(theirs[k], mine[k]) : mine[k];
      });
      return out;
    }
    return mine === undefined ? theirs : mine;
  }

  // Hosted: localStorage first (works offline, nothing waits on the network), then the
  // server copy at `url` (GET/PUT {state, base}). A 409 means another device wrote in
  // between: merge its state with ours and send once more.
  function remoteBackend(key, url) {
    const local = localBackend(key);
    let updated = null;
    let sending = Promise.resolve();
    let queued = null;

    function put(state) {
      return fetch(url, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: state, base: updated }) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    }

    function push(state) {
      return put(state).then(function (res) {
        if (res.status === 409) {
          const merged = mergeStates(res.body.state || {}, state);
          updated = res.body.updated;
          local.write(merged);
          return put(merged).then(function (again) {
            if (again.status === 200) { updated = again.body.updated; }
            return again.status === 200;
          });
        }
        if (res.status === 200) { updated = res.body.updated; }
        return res.status === 200;
      }, function () { return false; });
    }

    return {
      name: "remote",
      read: function () {
        const mine = local.read();
        return fetch(url, { credentials: "same-origin" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (row) {
            if (!row) { return mine; }
            updated = row.updated;
            if (!row.state) { return mine; }
            const merged = mergeStates(row.state, mine);
            local.write(merged);
            return merged;
          }, function () { return mine; });
      },
      write: function (state) {
        const ok = local.write(state);
        // One request at a time; a burst of commits sends only the newest state.
        const first = queued === null;
        queued = JSON.parse(JSON.stringify(state));
        if (first) {
          sending = sending.then(function () {
            const next = queued;
            queued = null;
            return push(next);
          });
        }
        return ok;
      },
      synced: function () { return sending; }
    };
  }

  // `backend` is { name, read() -> state|Promise<state>, write(state) -> bool|Promise<bool> }.
  function create(backend) {
    let state = blank();
    let pending = null;
    let hydrated = false;
    return {
      backend: backend.name,
      // The same object for the life of the store: index.html keeps a local alias of it.
      get state() { return state; },
      hydrate: function () {
        return safely(function () { return backend.read(); }, {}).then(function (loaded) {
          mergeShaped(state, loaded);
          hydrated = true;
          return state;
        });
      },
      commit: function () {
        if (!hydrated) { return Promise.resolve(false); }
        pending = safely(function () { return backend.write(state); }, false).then(function (ok) {
          pending = null;
          return ok !== false;
        });
        return pending;
      },
      settled: function () { return pending || Promise.resolve(true); },
      synced: function () { return backend.synced ? backend.synced() : Promise.resolve(true); }
    };
  }

  window.PathStore = {
    KEY: KEY,
    blank: blank,
    create: create,
    merge: mergeStates,
    local: function (key) { return create(localBackend(key || KEY)); },
    remote: function (key, url) { return create(remoteBackend(key || KEY, url || "/api/progress")); }
  };
})();
