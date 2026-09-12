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

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw error;
    return data;
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

  async function requestPasswordReset(email) {
    if (!window.location.protocol.startsWith("http")) {
      throw new Error(
        "Open the site through its local HTTP development URL before requesting a password reset.",
      );
    }

    const redirectTo = `${window.location.origin}/reset-password.html`;
    const { error } = await client.auth.resetPasswordForEmail(
      normalizeEmail(email),
      { redirectTo },
    );
    if (error) throw error;
  }

  async function signOut({ redirectTo = null } = {}) {
    const { error } = await client.auth.signOut();
    if (error) throw error;

    if (redirectTo) {
      window.location.href = redirectTo;
    }
  }

  async function updateEmail(email) {
    const { data, error } = await client.auth.updateUser({
      email: normalizeEmail(email),
    });
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    const { data, error } = await client.auth.updateUser({ password });
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
    signIn,
    signUp,
    signOut,
    updateEmail,
    updatePassword,
    verifyEmailOtp,
    resendSignupConfirmation,
    refreshSession,
    requestPasswordReset,
    normalizeEmail,
    validatePassword,
    subscribeToAuthChanges,
  };
})();
