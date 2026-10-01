(() => {
  const client = window.supabaseClient;
  const authApi = window.authApi;
  if (!client || !authApi) return;

  const REQUEST_COLUMNS =
    "id, customer_user_id, customer_name, customer_email, subject, category, status, assigned_support_user_id, created_at, updated_at, resolved_at, resolved_by_name, resolved_by_email";
  const MESSAGE_COLUMNS =
    "id, support_request_id, sender_type, sender_name, sender_email, body, created_at";
  const state = {
    session: null,
    requests: [],
    selectedId: null,
    activeFilter: "all",
    isLoadingQueue: false,
    isLoadingDetail: false,
    isActionPending: false,
  };
  const $ = (selector) => document.querySelector(selector);
  const accessStatus = $("#supportAccessStatus"),
    notice = $("#supportNotice"),
    queueList = $("#supportQueueList"),
    detail = $("#supportDetail"),
    noSelection = $("#supportNoSelection"),
    search = $("#supportSearch"),
    refreshQueue = $("#refreshQueue"),
    claimRow = $("#supportClaimRow"),
    claimButton = $("#claimRequest"),
    replyForm = $("#supportReplyForm"),
    reply = $("#supportReply"),
    sendReply = $("#sendReply"),
    replyCount = $("#supportReplyCount"),
    resolveButton = $("#resolveRequest"),
    resolveDialog = $("#resolveDialog"),
    confirmResolve = $("#confirmResolve");
  const redirect = (path) => window.location.replace(path);
  const setNotice = (message = "", type = "") => {
    notice.textContent = message;
    notice.hidden = !message;
    notice.className = `support-notice${type ? ` is-${type}` : ""}`;
  };
  const setActionMessage = (message = "", type = "") => {
    const element = $("#supportActionMessage");
    element.textContent = message;
    element.className = `support-action-message${type ? ` is-${type}` : ""}`;
  };
  const formatDate = (value) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";
  const titleCase = (value) =>
    String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const selectedRequest = () =>
    state.requests.find((item) => item.id === state.selectedId) || null;
  const isMine = (request) =>
    request.assigned_support_user_id === state.session?.user?.id;
  const setBusy = (busy) => {
    state.isActionPending = busy;
    claimButton.disabled = busy;
    sendReply.disabled = busy;
    resolveButton.disabled = busy;
    refreshQueue.disabled = busy || state.isLoadingQueue;
    reply.disabled = busy;
  };

  function statusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `support-status support-status--${status}`;
    badge.textContent = titleCase(status);
    return badge;
  }
  function metaItem(label, value) {
    const wrapper = document.createElement("div"),
      term = document.createElement("dt"),
      description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value || "—";
    wrapper.append(term, description);
    return wrapper;
  }

  function filteredRequests() {
    const query = search.value.trim().toLocaleLowerCase();
    return state.requests.filter((request) => {
      const matchesFilter =
        state.activeFilter === "all" ||
        (state.activeFilter === "open" && request.status === "open") ||
        (state.activeFilter === "mine" && isMine(request)) ||
        (state.activeFilter === "resolved" && request.status === "resolved");
      const haystack = [
        request.subject,
        request.category,
        request.customer_name,
        request.customer_email,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });
  }

  function renderQueue() {
    queueList.replaceChildren();
    queueList.setAttribute("aria-busy", String(state.isLoadingQueue));
    if (state.isLoadingQueue) {
      const skeleton = document.createElement("div");
      skeleton.className = "support-queue-skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      skeleton.replaceChildren(
        ...Array.from({ length: 3 }, () => document.createElement("span")),
      );
      queueList.append(skeleton);
      return;
    }
    const requests = filteredRequests();
    if (!requests.length) {
      const empty = document.createElement("p");
      empty.className = "support-empty-queue";
      empty.textContent = state.requests.length
        ? "No requests match this filter."
        : "There are no Support requests yet.";
      queueList.append(empty);
      return;
    }
    for (const request of requests) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "support-queue-item";
      item.classList.toggle("is-selected", request.id === state.selectedId);
      item.setAttribute(
        "aria-pressed",
        String(request.id === state.selectedId),
      );
      const top = document.createElement("span"),
        subject = document.createElement("strong");
      subject.textContent = request.subject;
      top.className = "support-queue-item__top";
      top.append(subject, statusBadge(request.status));
      const identity = document.createElement("span");
      identity.className = "support-queue-item__identity";
      identity.textContent = `${request.customer_name} · ${request.customer_email}`;
      const bottom = document.createElement("span"),
        updated = document.createElement("small"),
        assignment = document.createElement("small");
      bottom.className = "support-queue-item__bottom";
      updated.textContent = formatDate(request.updated_at);
      assignment.className = "support-assignment";
      assignment.textContent = isMine(request)
        ? "Assigned to me"
        : request.assigned_support_user_id
          ? "Assigned"
          : "Unassigned";
      bottom.append(updated, assignment);
      item.append(top, identity, bottom);
      item.addEventListener("click", () => selectRequest(request.id));
      queueList.append(item);
    }
  }

  function renderRequestHeader(request) {
    $("#supportDetailCategory").textContent = titleCase(request.category);
    $("#supportConversationTitle").textContent = request.subject;
    $("#supportDetailMeta").textContent =
      `Created ${formatDate(request.created_at)} · Last activity ${formatDate(request.updated_at)}`;
    const status = $("#supportDetailStatus");
    status.replaceChildren(statusBadge(request.status));
    status.className = "";
    const metadata = $("#supportRequestMeta");
    metadata.replaceChildren(
      metaItem("Customer", request.customer_name),
      metaItem("Email", request.customer_email),
      metaItem(
        "Assignment",
        isMine(request)
          ? "Assigned to you"
          : request.assigned_support_user_id
            ? "Assigned to another Support employee"
            : "Unassigned",
      ),
      metaItem("Created", formatDate(request.created_at)),
      metaItem("Last activity", formatDate(request.updated_at)),
      metaItem(
        "Resolution",
        request.status === "resolved"
          ? `Resolved by ${request.resolved_by_name || "Support"} on ${formatDate(request.resolved_at)}`
          : "Not resolved",
      ),
    );
    const canClaim =
      request.status !== "resolved" && !request.assigned_support_user_id;
    claimRow.hidden = !canClaim;
    replyForm.hidden = false;
    resolveButton.hidden = request.status === "resolved";
  }

  function renderMessages(messages) {
    const list = $("#supportMessageList");
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "support-empty-queue";
      empty.textContent = "No messages are available for this request.";
      list.append(empty);
      return;
    }
    for (const message of messages) {
      const card = document.createElement("article");
      card.className = "support-message";
      card.classList.toggle(
        "support-message--support",
        message.sender_type === "support",
      );
      const header = document.createElement("div"),
        sender = document.createElement("strong"),
        timestamp = document.createElement("time"),
        body = document.createElement("p");
      header.className = "support-message__header";
      sender.textContent = `${message.sender_type === "support" ? "Support" : "Customer"}: ${message.sender_name}`;
      timestamp.dateTime = message.created_at;
      timestamp.textContent = formatDate(message.created_at);
      body.className = "support-message__body";
      body.textContent = message.body;
      header.append(sender, timestamp);
      card.append(header, body);
      list.append(card);
    }
    list.scrollTop = list.scrollHeight;
  }

  async function loadMessages(requestId) {
    const list = $("#supportMessageList");
    list.replaceChildren();
    list.setAttribute("aria-busy", "true");
    const loading = document.createElement("p");
    loading.className = "support-empty-queue";
    loading.textContent = "Loading conversation…";
    list.append(loading);
    const { data, error } = await client
      .from("support_messages")
      .select(MESSAGE_COLUMNS)
      .eq("support_request_id", requestId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    if (state.selectedId === requestId) renderMessages(data || []);
  }

  async function selectRequest(requestId) {
    if (state.selectedId === requestId || state.isLoadingDetail) return;
    state.selectedId = requestId;
    state.isLoadingDetail = true;
    setActionMessage();
    noSelection.hidden = true;
    detail.hidden = false;
    renderQueue();
    const request = selectedRequest();
    if (!request) return;
    renderRequestHeader(request);
    try {
      await loadMessages(requestId);
    } catch (error) {
      console.error("Unable to load Support messages", error);
      setActionMessage(
        "The conversation could not be loaded. Please refresh and try again.",
        "error",
      );
    } finally {
      state.isLoadingDetail = false;
    }
  }

  async function loadQueue({ preserveSelection = true } = {}) {
    state.isLoadingQueue = true;
    renderQueue();
    try {
      const { data, error } = await client
        .from("support_requests")
        .select(REQUEST_COLUMNS)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      state.requests = data || [];
      if (!preserveSelection || !selectedRequest())
        state.selectedId = state.requests[0]?.id || null;
      renderQueue();
      if (state.selectedId) {
        noSelection.hidden = true;
        detail.hidden = false;
        renderRequestHeader(selectedRequest());
        await loadMessages(state.selectedId);
      } else {
        detail.hidden = true;
        noSelection.hidden = false;
      }
    } catch (error) {
      console.error("Unable to load Support requests", error);
      setNotice(
        "Support requests could not be loaded. Please try again.",
        "error",
      );
      queueList.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "support-empty-queue";
      empty.textContent = "Unable to load requests.";
      queueList.append(empty);
    } finally {
      state.isLoadingQueue = false;
      renderQueue();
      refreshQueue.disabled = state.isActionPending;
    }
  }

  async function refreshSelected() {
    await loadQueue();
  }
  async function runAction(button, action, successMessage) {
    const request = selectedRequest();
    if (!request || state.isActionPending) return;
    setBusy(true);
    setActionMessage();
    const label = button.textContent;
    button.textContent = "Working…";
    try {
      const { error } = await action(request.id);
      if (error) throw error;
      setActionMessage(successMessage, "success");
      await refreshSelected();
      return true;
    } catch (error) {
      console.error("Support action failed", error);
      const message =
        error?.code === "23505"
          ? "This request has already been claimed by another Support employee."
          : error?.code === "42501"
            ? "Your Support access is no longer active."
            : "That action could not be completed. Please try again.";
      setActionMessage(message, "error");
    } finally {
      button.textContent = label;
      setBusy(false);
    }
  }

  async function gate() {
    try {
      state.session = await authApi.getSession();
      if (!state.session?.user) return redirect("login.html");
      const { data, error } = await client.rpc(
        "is_current_user_support_employee",
      );
      if (error) throw error;
      if (data !== true) return redirect("index.html");
      document.body.classList.remove("support-gated");
      accessStatus.textContent = "Active Support employee";
      await loadQueue({ preserveSelection: false });
    } catch (error) {
      console.error("Support access check failed", error);
      redirect("index.html");
    }
  }

  $("#supportLogout").addEventListener("click", async () => {
    try {
      await authApi.requestSignOut({ redirectTo: "index.html" });
    } catch (error) {
      console.error("Support logout failed", error);
    }
  });
  refreshQueue.addEventListener("click", () => loadQueue());
  search.addEventListener("input", renderQueue);
  document.querySelectorAll("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      state.activeFilter = button.dataset.filter;
      document
        .querySelectorAll("[data-filter]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
      renderQueue();
    }),
  );
  claimButton.addEventListener("click", () =>
    runAction(
      claimButton,
      (id) => client.rpc("claim_support_request", { p_support_request_id: id }),
      "Request claimed.",
    ),
  );
  reply.addEventListener("input", () => {
    replyCount.textContent = `${reply.value.length} / 10,000`;
  });
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = reply.value.trim();
    if (!body || body.length > 10000 || state.isActionPending) return;
    const sent = await runAction(
      sendReply,
      (id) =>
        client.rpc("reply_to_support_request", {
          p_support_request_id: id,
          p_body: body,
        }),
      "Reply sent.",
    );
    if (sent) {
      reply.value = "";
      replyCount.textContent = "0 / 10,000";
    }
  });
  resolveButton.addEventListener("click", () => {
    if (selectedRequest() && !state.isActionPending) resolveDialog.showModal();
  });
  resolveDialog.addEventListener("close", () => {
    if (resolveDialog.returnValue === "confirm")
      runAction(
        confirmResolve,
        (id) =>
          client.rpc("resolve_support_request", { p_support_request_id: id }),
        "Request resolved.",
      );
  });
  authApi.subscribeToAuthChanges((_event, session) => {
    if (!session?.user) redirect("login.html");
  });
  gate();
})();
