(function () {
  "use strict";

  const publicPages = new Set(["index.html", "login.html", "signup.html"]);
  const OFFLINE_MODE_KEY = "piqueueball.offline.v1";
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const offlineRequested = new URLSearchParams(window.location.search).get("offline") === "1";
  if (offlineRequested) {
    localStorage.setItem(OFFLINE_MODE_KEY, "true");
  } else if (publicPages.has(currentPage) && navigator.onLine) {
    localStorage.removeItem(OFFLINE_MODE_KEY);
  } else if (!navigator.onLine) {
    localStorage.setItem(OFFLINE_MODE_KEY, "true");
  }
  const offlineMode = localStorage.getItem(OFFLINE_MODE_KEY) === "true";
  const ready = new Promise((resolve) => {
    function handleSessionError(error) {
      const message = error && error.message
        ? error.message
        : "Unable to validate your login session. Check your connection and try again.";
      window.piqueueballAuthError = message;
      window.dispatchEvent(new CustomEvent("piqueueball:auth-error", { detail: message }));
      if (!publicPages.has(currentPage)) window.location.replace("index.html");
      resolve(null);
    }

    function initialize() {
      if (offlineMode) {
        resolve(null);
        return;
      }
      if (!window.piqueueSupabase) {
        if (window.piqueueballSupabaseError && !publicPages.has(currentPage)) {
          window.location.replace("index.html");
        }
        resolve(null);
        return;
      }
      window.piqueueSupabase.auth.getSession().then(({ data, error }) => {
        if (error) {
          handleSessionError(error);
          return;
        }
        const session = data.session;
        if (session && publicPages.has(currentPage)) {
          window.location.replace("home.html");
        } else if (!session && !publicPages.has(currentPage)) {
          window.location.replace("index.html");
        }
        resolve(session);
      }).catch(handleSessionError);
    }
    if (offlineMode || window.piqueueSupabase || window.piqueueballSupabaseError) initialize();
    else window.addEventListener("piqueueball:supabase-ready", initialize, { once: true });
    window.addEventListener("piqueueball:supabase-error", () => resolve(null), { once: true });
  });

  window.piqueueAuth = {
    ready,
    client: () => window.piqueueSupabase,
    async signOut() {
      const { error } = await window.piqueueSupabase.auth.signOut();
      if (error) throw error;
      window.location.replace("index.html");
    }
  };
}());
