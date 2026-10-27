(function () {
  "use strict";

  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const status = document.getElementById("auth-status");
  const resendButton = document.getElementById("resend-confirmation");
  let confirmationEmail = "";
  const confirmationRedirectUrl = () => new URL("login.html", window.location.href).toString();

  function showError(error) {
    status.textContent = error && error.message ? error.message : "Unable to complete that request. Please try again.";
  }

  window.addEventListener("piqueueball:supabase-error", (event) => {
    status.textContent = event.detail;
  });
  window.addEventListener("piqueueball:auth-error", (event) => {
    status.textContent = event.detail;
  });
  if (window.piqueueballSupabaseError) status.textContent = window.piqueueballSupabaseError;

  window.piqueueAuth.ready.then((session) => {
    if (session) return;
    if (loginForm) {
      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = loginForm.querySelector('button[type="submit"]');
        button.disabled = true;
        status.textContent = "Signing in…";
        try {
          const { error } = await window.piqueueSupabase.auth.signInWithPassword({
            email: document.getElementById("login-email").value.trim(),
            password: document.getElementById("login-password").value
          });
          if (error) throw error;
          window.location.replace("home.html");
        } catch (error) {
          showError(error);
          button.disabled = false;
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = signupForm.querySelector('button[type="submit"]');
        button.disabled = true;
        status.textContent = "Creating account…";
        try {
          const { data, error } = await window.piqueueSupabase.auth.signUp({
            email: document.getElementById("signup-email").value.trim(),
            password: document.getElementById("signup-password").value,
            options: {
              data: { display_name: document.getElementById("signup-name").value.trim() },
              emailRedirectTo: confirmationRedirectUrl()
            }
          });
          if (error) throw error;
          if (!data.session) {
            confirmationEmail = document.getElementById("signup-email").value.trim();
            status.textContent = "Account created. Check your email to confirm it, then sign in. If it does not arrive, resend it.";
            resendButton.hidden = false;
            button.disabled = false;
            return;
          }
          window.location.replace("home.html");
        } catch (error) {
          showError(error);
          button.disabled = false;
        }
      });
    }
  }).catch(showError);

  if (resendButton) {
    resendButton.addEventListener("click", async () => {
      if (!confirmationEmail) {
        status.textContent = "Create an account first to request a confirmation email.";
        return;
      }
      resendButton.disabled = true;
      status.textContent = "Sending confirmation email…";
      try {
        const { error } = await window.piqueueSupabase.auth.resend({
          type: "signup",
          email: confirmationEmail,
          options: { emailRedirectTo: confirmationRedirectUrl() }
        });
        if (error) throw error;
        status.textContent = "Confirmation email sent. Check your inbox and spam folder.";
      } catch (error) {
        showError(error);
      } finally {
        resendButton.disabled = false;
      }
    });
  }

  if (window.piqueueballAuthError) status.textContent = window.piqueueballAuthError;
}());
