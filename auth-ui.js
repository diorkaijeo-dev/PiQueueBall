(function () {
  "use strict";

  const offlineMode = localStorage.getItem("piqueueball.offline.v1") === "true";

  window.addEventListener("piqueueball:supabase-error", (event) => {
    if (offlineMode) return;
    const status = document.getElementById("queue-status") || document.getElementById("profile-status")
      || document.getElementById("score-status") || document.getElementById("tracker-status")
      || document.getElementById("friends-status");
    if (status) status.textContent = event.detail;
  });
  if (window.piqueueballSupabaseError && !offlineMode) {
    const status = document.getElementById("queue-status") || document.getElementById("profile-status")
      || document.getElementById("score-status") || document.getElementById("tracker-status")
      || document.getElementById("friends-status");
    if (status) status.textContent = window.piqueueballSupabaseError;
  }
  if (window.piqueueballAuthError && !offlineMode) {
    const status = document.getElementById("queue-status") || document.getElementById("profile-status")
      || document.getElementById("score-status") || document.getElementById("tracker-status")
      || document.getElementById("friends-status");
    if (status) status.textContent = window.piqueueballAuthError;
  }

  window.piqueueAuth.ready.then((session) => {
    if (!session) {
      const userLabel = document.getElementById("account-email");
      if (offlineMode && userLabel) {
        userLabel.textContent = "Offline play · saved on this device";
        const onlineLink = document.createElement("a");
        onlineLink.className = "offline-link";
        onlineLink.href = "index.html";
        onlineLink.textContent = "Sign in online";
        userLabel.parentElement.insertBefore(onlineLink, document.getElementById("sign-out"));
      }
      const signOutButton = document.getElementById("sign-out");
      if (signOutButton) signOutButton.hidden = true;
      return;
    }
    const user = session.user;
    const userLabel = document.getElementById("account-email");
    if (userLabel) {
      userLabel.textContent = user.user_metadata && user.user_metadata.display_name || "Loading profile…";
      window.piqueueSupabase.from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            userLabel.textContent = "Signed in";
            const status = document.getElementById("queue-status") || document.getElementById("profile-status")
              || document.getElementById("score-status") || document.getElementById("tracker-status")
              || document.getElementById("friends-status");
            if (status) status.textContent = error.message || "Unable to load your account nickname.";
            return;
          }
          userLabel.textContent = data.display_name;
        })
        .catch((error) => {
          userLabel.textContent = "Signed in";
          const status = document.getElementById("queue-status") || document.getElementById("profile-status")
            || document.getElementById("score-status") || document.getElementById("tracker-status")
            || document.getElementById("friends-status");
          if (status) status.textContent = error.message || "Unable to load your account nickname.";
        });
    }
    const signOutButton = document.getElementById("sign-out");
    if (signOutButton) {
      signOutButton.addEventListener("click", async () => {
        signOutButton.disabled = true;
        try {
          await window.piqueueAuth.signOut();
        } catch (error) {
          signOutButton.disabled = false;
          const status = document.getElementById("queue-status") || document.getElementById("profile-status")
            || document.getElementById("score-status") || document.getElementById("tracker-status")
            || document.getElementById("friends-status");
          if (status) status.textContent = error.message || "Unable to sign out.";
        }
      });
    }
  });
}());
