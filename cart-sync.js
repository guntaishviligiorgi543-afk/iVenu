(() => {
  const client = window.supabaseClient;

  if (!client || !window.authApi) return;

  async function syncTicket(ticketTypeId, quantity) {
    if (!ticketTypeId) return;

    const session = await window.authApi.getSession();
    if (!session?.user) return;

    if (quantity > 0) {
      const { data: ticket, error: ticketError } = await client
        .from("ticket_types")
        .select("available_quantity")
        .eq("id", ticketTypeId)
        .maybeSingle();
      if (ticketError) throw ticketError;
      if (!ticket) throw new Error("Ticket type is no longer available.");
      if (quantity > Number(ticket.available_quantity)) {
        throw new Error("The requested quantity is no longer available.");
      }
    }

    const query = client
      .from("cart_items")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("ticket_type_id", ticketTypeId)
      .is("event_seat_id", null);
    const { data: rows, error } = await query.order("created_at");
    if (error) throw error;
    const data = rows?.[0] || null;

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

      const duplicateIds = (rows || []).slice(1).map((row) => row.id);
      if (duplicateIds.length) {
        const { error: duplicateError } = await client
          .from("cart_items")
          .delete()
          .in("id", duplicateIds)
          .eq("user_id", session.user.id);
        if (duplicateError) throw duplicateError;
      }
      return;
    }

    const { error: insertError } = await client.from("cart_items").insert({
      user_id: session.user.id,
      ticket_type_id: ticketTypeId,
      quantity,
    });
    if (insertError) throw insertError;
  }

  async function getOwnCart() {
    const session = await window.authApi.getSession();
    if (!session?.user) return [];

    const { data, error } = await client
      .from("cart_items")
      .select("id, ticket_type_id, event_seat_id, quantity, created_at, updated_at")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  window.cartSync = { syncTicket, getOwnCart };
})();
