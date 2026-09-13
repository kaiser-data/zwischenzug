// Per-player identity and self-assessment, separated from persistence (store.js)
// and from anything that renders it. Pure data + derived values, no I/O.
(function () {
  const PLACEHOLDERS = {
    displayName: "Your name",
    focus: "What are you working on?",
    leak: "Where does your calculation stop?",
    "ladder.reality": "How realistic is the next title for you?",
    "crush.intro": "What tournament volume have you committed to?",
    "crush.closing": "What is your best evidence that slow chess is your weapon?"
  };

  const TITLES = [
    { code: "CM", rating: 2200 },
    { code: "FM", rating: 2300 },
    { code: "IM", rating: 2400 },
    { code: "GM", rating: 2500 }
  ];

  function blank() {
    return {
      displayName: "",
      fideId: "",
      federation: "",
      lichess: "",
      ratingStandard: null,
      ratingBlitz: null,
      focus: "",
      leak: "",
      blitzCap: 3,
      weekTarget: 600,
      notes: {}
    };
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  // Same type-matching discipline as store.js's mergeShaped: a stored value
  // replaces a default only when its type matches the default's. Unknown
  // keys (not present in the blank shape) pass through untouched.
  function typeMatches(defaultValue, value) {
    if (defaultValue === null) {
      // ratingStandard / ratingBlitz: null default accepts a number.
      return typeof value === "number";
    }
    if (isPlainObject(defaultValue)) {
      return isPlainObject(value);
    }
    return typeof value === typeof defaultValue;
  }

  function merge(stored) {
    const state = blank();
    if (!isPlainObject(stored)) { return state; }
    Object.keys(stored).forEach(function (key) {
      const value = stored[key];
      if (!Object.prototype.hasOwnProperty.call(state, key)) {
        state[key] = value;
        return;
      }
      const defaultValue = state[key];
      if (typeMatches(defaultValue, value)) {
        state[key] = value;
      }
      // else: wrong shape, keep the default already in state.
    });
    return state;
  }

  // "+129" style gap below the threshold, "reached" at or above it,
  // "—" (em dash) when there is no rating to compare.
  function ladderGap(profile, titleRating) {
    const rating = profile && profile.ratingStandard;
    if (typeof rating !== "number") { return "—"; }
    const gap = titleRating - rating;
    if (gap <= 0) { return "reached"; }
    return "+" + gap;
  }

  // USCF/FIDE-style K-factor: 20 below 2400, 10 at 2400 and above,
  // null when there is no rating to key off of.
  function kFactor(profile) {
    const rating = profile && profile.ratingStandard;
    if (typeof rating !== "number") { return null; }
    return rating >= 2400 ? 10 : 20;
  }

  window.PathProfile = {
    blank: blank,
    PLACEHOLDERS: PLACEHOLDERS,
    TITLES: TITLES,
    ladderGap: ladderGap,
    kFactor: kFactor,
    merge: merge
  };
})();
