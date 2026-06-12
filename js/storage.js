/* ============================================================
   storage.js — persistence layer
   A small wrapper around localStorage so the rest of the app
   never touches localStorage directly. If this app ever moved
   to a real database, this is the only file that would change.
   ============================================================ */

const Storage = (() => {
  const KEY = "request-tracker:requests";
  const SEQ_KEY = "request-tracker:sequence";

  /** Read all saved requests. Returns [] if nothing is saved or data is corrupt. */
  function loadRequests() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("Could not read saved requests, starting fresh.", err);
      return [];
    }
  }

  /** Persist the full list of requests. */
  function saveRequests(requests) {
    try {
      localStorage.setItem(KEY, JSON.stringify(requests));
    } catch (err) {
      console.warn("Could not save requests (storage may be full or blocked).", err);
    }
  }

  /** Get the next sequential number used to build IDs like REQ-0007. */
  function nextSequence() {
    const current = parseInt(localStorage.getItem(SEQ_KEY), 10) || 0;
    const next = current + 1;
    localStorage.setItem(SEQ_KEY, String(next));
    return next;
  }

  return { loadRequests, saveRequests, nextSequence };
})();
