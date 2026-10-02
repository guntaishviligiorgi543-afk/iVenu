(() => {
  const client = window.supabaseClient;
  const CURRENT_POLICY_VERSIONS = Object.freeze({
    terms_of_use: "2026-09-29",
    privacy_policy: "2026-09-29",
  });

  if (!client) {
    throw new Error("Supabase client is not configured.");
  }

  // Public pages mount their loading overlay before this script runs. Keep it
  // active through the first server-backed password-status check so an OAuth
  // user who still needs a password never sees the page before redirecting.
  const releaseInitialPasswordSetupGuard = window.pageLoading?.lock(
    "initial-password-setup-check",
  );
  const completeInitialPasswordSetupGuard = () =>
    releaseInitialPasswordSetupGuard?.();

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

  async function signInWithFacebook() {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "facebook",
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

  const isPolicyPage = () =>
    /(?:^|\/)(?:privacy-policy|terms-of-use|data-deletion|login|register|verify-email|forgot-password|reset-password|oauth-password-setup)\.html$/
      .test(window.location.pathname);

  const isOAuthPasswordSetupPage = () =>
    /(?:^|\/)oauth-password-setup\.html$/.test(window.location.pathname);

  const googleAuthState = (user) => {
    const identities = Array.isArray(user?.identities) ? user.identities : [];
    const identityProviders = identities
      .map((identity) => identity?.provider)
      .filter(Boolean);
    const appMetadataProviders = Array.isArray(user?.app_metadata?.providers)
      ? user.app_metadata.providers.filter(Boolean)
      : [];
    const appMetadataProvider = user?.app_metadata?.provider;
    const providers = new Set([
      ...identityProviders,
      ...appMetadataProviders,
      ...(appMetadataProvider ? [appMetadataProvider] : []),
    ]);
    return {
      isGoogleAccount: providers.has("google"),
      identityProviders,
      appMetadataProvider: appMetadataProvider || null,
      appMetadataProviders,
    };
  };

  async function isCurrentUserPasswordConfigured() {
    const { data, error } = await client.rpc(
      "is_current_user_password_configured",
    );
    if (error) throw error;
    return data === true;
  }

  async function requiresGooglePasswordSetup(user) {
    const authState = googleAuthState(user);
    if (!authState.isGoogleAccount) return false;
    return !(await isCurrentUserPasswordConfigured());
  };

  let oauthPasswordSetupRedirecting = false;

  async function enforceGooglePasswordSetup(session) {
    if (
      !session?.user ||
      isOAuthPasswordSetupPage() ||
      oauthPasswordSetupRedirecting
    )
      return false;

    try {
      const user = await getUser();
      const authState = googleAuthState(user);
      const requiresSetup =
        authState.isGoogleAccount &&
        !(await isCurrentUserPasswordConfigured());
      console.debug("[auth] Google password setup check", {
        pathname: window.location.pathname,
        appMetadataProvider: authState.appMetadataProvider,
        appMetadataProviders: authState.appMetadataProviders,
        identityProviders: authState.identityProviders,
        requiresSetup,
      });
      if (!requiresSetup) return false;
      oauthPasswordSetupRedirecting = true;
      window.location.replace("oauth-password-setup.html");
      return true;
    } catch (error) {
      console.error("Unable to determine whether password setup is required", error);
      return false;
    }
  }

  const policyRecordsAreCurrent = (records) => {
    const accepted = new Set(
      (records || []).map((record) =>
        `${record.policy_type}:${record.policy_version}`,
      ),
    );
    return Object.entries(CURRENT_POLICY_VERSIONS).every(
      ([type, version]) => accepted.has(`${type}:${version}`),
    );
  };

  async function hasAcceptedCurrentPolicies(userId) {
    const { data, error } = await client
      .from("user_policy_acceptances")
      .select("policy_type, policy_version")
      .eq("user_id", userId)
      .in("policy_type", Object.keys(CURRENT_POLICY_VERSIONS));
    if (error) throw error;
    return policyRecordsAreCurrent(data);
  }

  async function acceptCurrentPolicies() {
    const { data, error } = await client.rpc("accept_current_policy_versions");
    if (error) throw error;
    return policyRecordsAreCurrent(data);
  }

  window.authApi = {
    getSession,
    getUser,
    isAdmin,
    signIn,
    signInWithGoogle,
    signInWithFacebook,
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
    currentPolicyVersions: CURRENT_POLICY_VERSIONS,
    hasAcceptedCurrentPolicies,
    acceptCurrentPolicies,
    isCurrentUserPasswordConfigured,
    requiresGooglePasswordSetup,
  };
  let policyConsentUserId = null;
  let policyConsentCheckInFlight = false;
  let policyConsentDialog = null;

  const clearPolicyConsentDialog = () => {
    policyConsentDialog?.remove();
    policyConsentDialog = null;
    document.body.classList.remove("policy-consent-open");
  };

  const showPolicyConsentDialog = (session, initialMessage = "") => {
    if (policyConsentDialog) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="policy-consent" role="presentation"><section class="policy-consent__dialog" role="dialog" aria-modal="true" aria-labelledby="policyConsentTitle" aria-describedby="policyConsentDescription"><p class="policy-consent__eyebrow">Before you continue</p><h2 id="policyConsentTitle">Review iVenue policies</h2><p id="policyConsentDescription">Please review and accept the current Terms of Use and Privacy Policy to continue using your account.</p><label class="policy-consent__check"><input type="checkbox" data-policy-consent-check /><span>I agree to the <a href="terms-of-use.html">Terms of Use</a> and confirm that I have read the <a href="privacy-policy.html">Privacy Policy</a>.</span></label><p class="policy-consent__message" role="alert" aria-live="assertive" data-policy-consent-message></p><div class="policy-consent__actions"><button type="button" data-policy-consent-accept>Accept and continue</button><button type="button" data-policy-consent-logout>Log out</button></div></section></div>`,
    );
    policyConsentDialog = document.querySelector(".policy-consent");
    document.body.classList.add("policy-consent-open");
    const checkbox = policyConsentDialog.querySelector("[data-policy-consent-check]");
    const message = policyConsentDialog.querySelector("[data-policy-consent-message]");
    const accept = policyConsentDialog.querySelector("[data-policy-consent-accept]");
    const logout = policyConsentDialog.querySelector("[data-policy-consent-logout]");
    message.textContent = initialMessage;
    checkbox.focus();
    accept.addEventListener("click", async () => {
      if (!checkbox.checked) {
        message.textContent = "Please confirm your agreement before continuing.";
        checkbox.focus();
        return;
      }
      accept.disabled = true;
      logout.disabled = true;
      message.textContent = "Saving your acceptance...";
      try {
        if (!(await acceptCurrentPolicies())) {
          throw new Error("Your policy acceptance could not be confirmed.");
        }
        clearPolicyConsentDialog();
        policyConsentUserId = session.user.id;
        await remindIncompleteProfile(session);
      } catch (error) {
        console.error("Unable to record policy acceptance", error);
        message.textContent = "We could not save your acceptance. Please try again.";
        accept.disabled = false;
        logout.disabled = false;
      }
    });
    logout.addEventListener("click", async () => {
      accept.disabled = true;
      logout.disabled = true;
      try {
        await signOut({ redirectTo: "index.html" });
      } catch (error) {
        console.error("Unable to sign out", error);
        message.textContent = "We could not sign you out. Please try again.";
        accept.disabled = false;
        logout.disabled = false;
      }
    });
  };

  async function enforcePolicyAcceptance(session) {
    const userId = session?.user?.id;
    if (!userId || isPolicyPage()) return true;
    if (policyConsentDialog || policyConsentCheckInFlight || policyConsentUserId === userId)
      return false;
    policyConsentCheckInFlight = true;
    try {
      if (await hasAcceptedCurrentPolicies(userId)) {
        policyConsentUserId = userId;
        return true;
      }
      showPolicyConsentDialog(session);
      return false;
    } catch (error) {
      console.error("Unable to confirm policy acceptance", error);
      showPolicyConsentDialog(
        session,
        "We could not confirm your policy acceptance. Please try again.",
      );
      return false;
    } finally {
      policyConsentCheckInFlight = false;
    }
  }
  let profileReminderUserId = null;
  let profileReminderInFlight = false;
  const profileReminderDismissalWindowMs = 24 * 60 * 60 * 1000;

  const isProfileDashboardProfileSection = () =>
    /(?:^|\/)profile\.html$/.test(window.location.pathname) &&
    window.location.hash.toLowerCase() === "#profile";

  const hasProfileValue = (value) => String(value || "").trim().length > 0;

  const profileReminderDismissalKey = (userId) =>
    `ivenue.profileReminderDismissedAt.${userId}`;

  const profileReminderWasDismissedRecently = (userId) => {
    try {
      const dismissedAt = Number(
        window.localStorage.getItem(profileReminderDismissalKey(userId)),
      );
      const now = Date.now();
      return dismissedAt > 0 && dismissedAt <= now &&
        now - dismissedAt < profileReminderDismissalWindowMs;
    } catch {
      return false;
    }
  };

  const dismissProfileReminder = (userId) => {
    try {
      window.localStorage.setItem(
        profileReminderDismissalKey(userId),
        String(Date.now()),
      );
    } catch {
      // The reminder remains available if browser storage is unavailable.
    }
  };

  const clearProfileReminderDismissal = (userId) => {
    try {
      window.localStorage.removeItem(profileReminderDismissalKey(userId));
    } catch {
      // No action is needed if browser storage is unavailable.
    }
  };

  async function remindIncompleteProfile(session) {
    const userId = session?.user?.id;
    if (
      !userId ||
      profileReminderInFlight ||
      profileReminderUserId === userId ||
      profileReminderWasDismissedRecently(userId) ||
      isProfileDashboardProfileSection()
    )
      return;

    profileReminderInFlight = true;
    profileReminderUserId = userId;
    try {
      if (await isAdmin(session)) return;
      const { data: profile, error } = await client
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        console.error("Unable to check profile completeness", error);
        return;
      }
      const complete = [
        profile?.first_name,
        profile?.last_name,
        profile?.email,
      ].every(hasProfileValue);
      if (complete) {
        clearProfileReminderDismissal(userId);
        return;
      }
      if (window.confirm("Your profile is incomplete. Would you like to finish setting it up?")) {
        window.location.assign("profile.html#profile");
      } else {
        dismissProfileReminder(userId);
      }
    } finally {
      profileReminderInFlight = false;
    }
  }

  getSession()
    .then(async (session) => {
      if (await enforceGooglePasswordSetup(session)) return;
      completeInitialPasswordSetupGuard();
      if ((await enforcePolicyAcceptance(session)) && !isPolicyPage())
        await remindIncompleteProfile(session);
    })
    .catch((error) => {
      completeInitialPasswordSetupGuard();
      console.error("Unable to complete the initial authentication check", error);
    });
  subscribeToAuthChanges((event, session) => {
    if (event === "SIGNED_OUT") {
      clearReservationLogoutDialog();
      profileReminderUserId = null;
      policyConsentUserId = null;
      clearPolicyConsentDialog();
      return;
    }
    enforceGooglePasswordSetup(session)
      .then((redirected) => {
        if (redirected) return false;
        return enforcePolicyAcceptance(session);
      })
      .then((accepted) => accepted && !isPolicyPage() && remindIncompleteProfile(session))
      .catch((error) => console.error("Unable to check policy acceptance", error));
  });
})();
