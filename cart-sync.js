(() => {
  const client = window.supabaseClient;

  if (!client || !window.authApi) return;

  async function syncTicket(ticketTypeId, quantity) {
    if (!ticketTypeId) return;

    const session = await window.authApi.getSession();
    if (!session?.user) return;

    const query = client
      .from("cart_items")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("ticket_type_id", ticketTypeId);
    const { data, error } = await query.maybeSingle();
    if (error && error.code !== "PGRST116") throw error;

    if (quantity <= 0) {
      if (data?.id) {
        const { error: deleteError } = await client
          .from("cart_items")
          .delete()
          .eq("id", data.id)
          .eq("user_id", session.user.id);
        if (deleteError) throw deleteError;
      }
      return;
    }

    if (data?.id) {
      const { error: updateError } = await client
        .from("cart_items")
        .update({ quantity, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("user_id", session.user.id);
      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await client.from("cart_items").insert({
      user_id: session.user.id,
      ticket_type_id: ticketTypeId,
      quantity,
    });
    if (insertError) throw insertError;
  }

  window.cartSync = { syncTicket };
})();
