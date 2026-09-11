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
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async function signUp({ firstName, lastName, email, phone, password }) {
    const { data, error } = await client.auth.signUp({
      email,
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
      profile: { first_name: firstName, last_name: lastName, email, phone },
    };
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
    subscribeToAuthChanges,
  };
})();
