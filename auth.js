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

    return {
      ...data,
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
    const redirectTo = window.location.protocol.startsWith("http")
      ? `${window.location.origin}/reset-password.html`
      : "http://localhost:8000/reset-password.html";
    const { error } = await client.auth.resetPasswordForEmail(
      normalizeEmail(email),
      { redirectTo },
    );
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function updateEmail(email) {
    const { data, error } = await client.auth.updateUser({ email });
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  function subscribeToAuthChanges(callback) {
    return client.auth.onAuthStateChange(callback);
  }

  window.authApi = {
    getSession,
    signIn,
    signUp,
    signOut,
    updateEmail,
    updatePassword,
    requestPasswordReset,
    normalizeEmail,
    validatePassword,
    subscribeToAuthChanges,
  };
})();
