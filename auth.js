(() => {
  const client = window.supabaseClient;

  if (!client) {
    throw new Error("Supabase client is not configured.");
  }

  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function getUser() {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async function isAdmin(session) {
    if (!session?.user) return false;
    const { data, error } = await client
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      return false;
    }
    return Boolean(data);
  }

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw error;
    return data;
  }

  async function signInWithGoogle() {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://ivenue.site/",
      },
    });
    if (error) throw error;
    return data;
  }

  async function verifyCurrentPassword(email, password) {
    const isolatedClient = window.supabase.createClient(
      window.supabaseConfig.url,
      window.supabaseConfig.publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    const { error } = await isolatedClient.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    await isolatedClient.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  async function signUp({ firstName, lastName, email, phone, password }) {
    const normalizedEmail = normalizeEmail(email);
    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      },
    });

    if (error) throw error;

    const duplicateEmail =
      Boolean(data?.user) &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0;

    return {
      ...data,
      duplicateEmail,
      profile: {
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        phone,
      },
    };
  }

  function normalizeEmail(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function validatePassword(password) {
    if (typeof password !== "string" || password.length < 8) {
      return "Password must be at least 8 characters.";
    }
    if (
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return "Password must include uppercase, lowercase, and a number.";
    }
    return "";
  }

  async function requestPasswordRecoveryOtp(email) {
    if (!window.location.protocol.startsWith("http")) {
      throw new Error(
        "Open the site through its local HTTP development URL before requesting a verification code.",
      );
    }

    const { error } = await client.auth.resetPasswordForEmail(
      normalizeEmail(email),
    );
    if (error) throw error;
  }

  async function verifyPasswordRecoveryOtp(email, token) {
    const { data, error } = await client.auth.verifyOtp({
      email: normalizeEmail(email),
      token: String(token || "").trim(),
      type: "recovery",
    });
    if (error) throw error;
    return data;
  }

  async function signOut({ redirectTo = null } = {}) {
    const { error } = await client.auth.signOut();
    if (error) throw error;

    if (redirectTo) {
      window.location.href = redirectTo;
    }
  }

  let logoutRequestInFlight = false;
  let reservationLogoutDialog = null;
  let reservationLogoutTimer = null;
  let reservationLogoutState = null;

  const formatReservationTime = (seconds) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const clearReservationLogoutDialog = () => {
    if (reservationLogoutTimer) clearInterval(reservationLogoutTimer);
    reservationLogoutTimer = null;
    reservationLogoutState = null;
    reservationLogoutDialog?.remove();
    reservationLogoutDialog = null;
    document.querySelector(".reservation-logout-dialog")?.remove();
    document.body.classList.remove("reservation-logout-dialog-open");
  };

  const showReservationLogoutDialog = (reservation, redirectTo) => {
    clearReservationLogoutDialog();
    reservationLogoutState = { reservation, redirectTo, signingOut: false };
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="reservation-logout-dialog" role="presentation"><section class="reservation-logout-dialog__content" role="dialog" aria-modal="true" aria-labelledby="reservationLogoutTitle" aria-describedby="reservationLogoutDescription"><button class="reservation-logout-dialog__close" type="button" aria-label="Close reservation warning" data-reservation-logout-close>&times;</button><p class="reservation-logout-dialog__eyebrow">Reservation notice</p><h2 id="reservationLogoutTitle">You have an active reservation</h2><p id="reservationLogoutDescription">Your selected tickets are currently reserved.</p><p class="reservation-logout-dialog__time">Time remaining: <strong data-reservation-logout-time>00:00</strong></p><p class="reservation-logout-dialog__warning" data-reservation-logout-status>Your selected tickets will be released automatically when the reservation time expires.</p><div class="reservation-logout-dialog__actions"><button type="button" data-reservation-finish>Finish Reservation</button><button type="button" data-reservation-logout>Log Out</button></div></section></div>`,
    );
    reservationLogoutDialog = document.querySelector(".reservation-logout-dialog");
    document.body.classList.add("reservation-logout-dialog-open");
    const time = reservationLogoutDialog.querySelector("[data-reservation-logout-time]");
    const status = reservationLogoutDialog.querySelector("[data-reservation-logout-status]");
    const close = reservationLogoutDialog.querySelector("[data-reservation-logout-close]");
    const finish = reservationLogoutDialog.querySelector("[data-reservation-finish]");
    const logout = reservationLogoutDialog.querySelector("[data-reservation-logout]");
    close.addEventListener("click", clearReservationLogoutDialog);
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((reservationLogoutState.reservation.expiry - Date.now()) / 1000),
      );
      time.textContent = formatReservationTime(remaining);
      if (remaining) return true;
      if (reservationLogoutTimer) clearInterval(reservationLogoutTimer);
      reservationLogoutTimer = null;
      finish.disabled = true;
      status.textContent = "Your reservation has expired. You can now log out.";
      return false;
    };
    if (tick()) reservationLogoutTimer = setInterval(tick, 1000);

    finish.addEventListener("click", async () => {
      if (reservationLogoutState?.signingOut || finish.disabled) return;
      finish.disabled = true;
      try {
        const current = await window.reservationCountdown?.getActiveReservation?.();
        if (!current) {
          if (reservationLogoutTimer) clearInterval(reservationLogoutTimer);
          reservationLogoutTimer = null;
          time.textContent = "00:00";
          status.textContent =
            "Your reservation is no longer active. You can now log out.";
          return;
        }
        clearReservationLogoutDialog();
        const url = new URL("getTickets.html", window.location.href);
        url.searchParams.set("id", current.eventId);
        window.location.assign(url.href);
      } catch (error) {
        console.error("Unable to verify reservation:", error);
        finish.disabled = false;
      }
    });

    logout.addEventListener("click", async () => {
      if (reservationLogoutState?.signingOut) return;
      reservationLogoutState.signingOut = true;
      finish.disabled = true;
      logout.disabled = true;
      try {
        await signOut({ redirectTo: reservationLogoutState.redirectTo });
      } catch (error) {
        console.error("Logout failed:", error);
        reservationLogoutState.signingOut = false;
        finish.disabled = false;
        logout.disabled = false;
      }
    });
  };

  async function requestSignOut({ redirectTo = null } = {}) {
    if (logoutRequestInFlight || reservationLogoutState?.signingOut) return false;
    logoutRequestInFlight = true;
    try {
      const reservation =
        await window.reservationCountdown?.getActiveReservation?.();
      if (reservation) {
        showReservationLogoutDialog(reservation, redirectTo);
        return false;
      }
      await signOut({ redirectTo });
      return true;
    } finally {
      logoutRequestInFlight = false;
    }
  }

  async function updateEmail(email) {
    const { data, error } = await client.auth.updateUser(
      {
        email: normalizeEmail(email),
      },
      {
        emailRedirectTo: `${window.location.origin}/profile.html`,
      },
    );
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) {
      throw (
        userError || new Error("A valid authenticated session is required.")
      );
    }

    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  async function updatePasswordWithCurrentPassword(password, currentPassword) {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) {
      throw (
        userError || new Error("A valid authenticated session is required.")
      );
    }
    const { data, error } = await client.auth.updateUser({
      password,
      current_password: currentPassword,
    });
    if (error) throw error;
    return data;
  }

  async function verifyEmailOtp(email, token) {
    const normalizedEmail = normalizeEmail(email);
    console.debug("[auth] verifyOtp request", {
      email: normalizedEmail,
      tokenLength: typeof token === "string" ? token.length : 0,
    });
    try {
      const response = await client.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "email",
      });
      console.debug("[auth] verifyOtp response", {
        hasSession: Boolean(response.data?.session),
        hasUser: Boolean(response.data?.user),
        emailConfirmedAt: response.data?.user?.email_confirmed_at || null,
        hasError: Boolean(response.error),
      });
      if (response.error) throw response.error;
      return response.data;
    } catch (error) {
      console.error("[auth] verifyOtp error", {
        email: normalizedEmail,
        tokenLength: typeof token === "string" ? token.length : 0,
        error,
      });
      throw error;
    }
  }

  async function requestEmailOtp(email) {
    const { error } = await client.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async function resendSignupConfirmation(email) {
    console.debug("[auth] resend signup confirmation", {
      email: normalizeEmail(email),
    });
    const { error } = await client.auth.resend({
      type: "signup",
      email: normalizeEmail(email),
    });
    if (error) throw error;
  }

  async function refreshSession() {
    const { data, error } = await client.auth.refreshSession();
    if (error) throw error;
    return data.session;
  }

  function subscribeToAuthChanges(callback) {
    return client.auth.onAuthStateChange(callback);
  }

  window.authApi = {
    getSession,
    getUser,
    isAdmin,
    signIn,
    signInWithGoogle,
    verifyCurrentPassword,
    signUp,
    requestSignOut,
    signOut,
    updateEmail,
    updatePassword,
    updatePasswordWithCurrentPassword,
    verifyEmailOtp,
    requestEmailOtp,
    resendSignupConfirmation,
    refreshSession,
    requestPasswordRecoveryOtp,
    verifyPasswordRecoveryOtp,
    normalizeEmail,
    validatePassword,
    subscribeToAuthChanges,
  };
  subscribeToAuthChanges((event) => {
    if (event === "SIGNED_OUT") clearReservationLogoutDialog();
  });
})();
