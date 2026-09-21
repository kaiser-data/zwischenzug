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
      settled: function () { return pending || Promise.resolve(true); }
    };
  }

  window.PathStore = {
    KEY: KEY,
    blank: blank,
    create: create,
    local: function (key) { return create(localBackend(key || KEY)); }
  };
})();
