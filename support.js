(() => {
  const client = window.supabaseClient;
  const authApi = window.authApi;

  if (!client || !authApi) return;

  const REQUEST_COLUMNS =
    "id, customer_user_id, customer_name, customer_email, subject, category, status, assigned_support_user_id, created_at, updated_at, resolved_at, resolved_by_name, resolved_by_email, customer_deleted_at";

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
    unread: new Map(),
  };

  const $ = (selector) => document.querySelector(selector);

  const accessStatus = $("#supportAccessStatus");
  const notice = $("#supportNotice");
  const queueList = $("#supportQueueList");
  const detail = $("#supportDetail");
  const noSelection = $("#supportNoSelection");
  const search = $("#supportSearch");
  const refreshQueue = $("#refreshQueue");

  const claimRow = $("#supportClaimRow");
  const claimButton = $("#claimRequest");

  const replyForm = $("#supportReplyForm");
  const reply = $("#supportReply");
  const sendReply = $("#sendReply");
  const replyCount = $("#supportReplyCount");

  const resolveButton = $("#resolveRequest");
  const resolveDialog = $("#resolveDialog");
  const confirmResolve = $("#confirmResolve");

  const mobileBack = $("#supportMobileBack");

  const supportPage = document.body;

  /* =========================================================
     MOBILE VIEW
     ========================================================= */

  function syncMobileConversationView() {
    const isMobile = window.matchMedia("(max-width: 760px)").matches;

    supportPage.classList.toggle(
      "mobile-conversation-open",
      isMobile && Boolean(state.selectedId),
    );
  }

  mobileBack?.addEventListener("click", () => {
    supportPage.classList.remove("mobile-conversation-open");
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 761px)").matches) {
      supportPage.classList.remove("mobile-conversation-open");
    }
  });

  /* =========================================================
     HELPERS
     ========================================================= */

  const redirect = (path) => {
    window.location.replace(path);
  };

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

  const formatDate = (value) => {
    if (!value) return "—";

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  };

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

  /* =========================================================
     STATUS
     ========================================================= */

  function statusBadge(status, deleted) {
    const badge = document.createElement("span");

    badge.className = `support-status support-status--${status}`;

    badge.textContent = deleted ? "Deleted by customer" : titleCase(status);

    return badge;
  }

  /* =========================================================
     META ITEM
     ========================================================= */

  function metaItem(label, value) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");

    term.textContent = label;
    description.textContent = value || "—";

    wrapper.append(term, description);

    return wrapper;
  }

  /* =========================================================
     FILTER REQUESTS
     ========================================================= */

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

  /* =========================================================
     QUEUE
     ========================================================= */

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

      /* TOP */

      const top = document.createElement("span");

      const subject = document.createElement("strong");

      top.className = "support-queue-item__top";

      subject.textContent = request.subject;

      top.append(subject, statusBadge(request.status, request.customer_deleted_at));

      const unreadCount = state.unread.get(request.id) || 0;
      if (unreadCount > 0) {
        const unread = document.createElement("span");
        unread.className = "support-unread-indicator";
        unread.textContent = "New";
        unread.setAttribute(
          "aria-label",
          `${unreadCount} new customer message${unreadCount === 1 ? "" : "s"}`,
        );
        top.append(unread);
      }

      /* IDENTITY */

      const identity = document.createElement("span");

      identity.className = "support-queue-item__identity";

      identity.textContent = `${request.customer_name} · ${request.customer_email}`;

      /* BOTTOM */

      const bottom = document.createElement("span");

      const updated = document.createElement("small");

      const assignment = document.createElement("small");

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

  /* =========================================================
     REQUEST HEADER
     ========================================================= */

  function renderRequestHeader(request) {
    $("#supportDetailCategory").textContent = titleCase(request.category);

    $("#supportConversationTitle").textContent = request.subject;

    $("#supportDetailMeta").textContent = `Created ${formatDate(
      request.created_at,
    )}`;

    const status = $("#supportDetailStatus");

    status.replaceChildren(statusBadge(request.status));
    if (request.status === "waiting_for_user") {
      status.firstElementChild.textContent = "Waiting for customer";
    }

    status.className = "support-status";

    const metadata = $("#supportRequestMeta");
    const customer = metaItem("Customer", request.customer_name);
    if (request.customer_email) {
      const email = document.createElement("a");
      email.className = "support-request-meta__email";
      email.href = `mailto:${request.customer_email}`;
      email.textContent = request.customer_email;
      customer.querySelector("dd").append(email);
    }

    metadata.replaceChildren(
      customer,

      metaItem(
        "Assignment",
        isMine(request)
          ? "Assigned to you"
          : request.assigned_support_user_id
            ? "Assigned to another Support employee"
            : "Unassigned",
      ),

      metaItem("Last activity", formatDate(request.updated_at)),
    );
    if (request.status === "resolved" &&
        (request.resolved_at || request.resolved_by_name)) {
      const resolution = metaItem(
        "Resolution",
        `Resolved${request.resolved_by_name ? ` by ${request.resolved_by_name}` : ""}${
          request.resolved_at ? ` on ${formatDate(request.resolved_at)}` : ""
        }`,
      );
      resolution.className = "support-request-meta__resolution";
      metadata.append(resolution);
    }

    const canClaim =
      !request.customer_deleted_at &&
      request.status !== "resolved" &&
      !request.assigned_support_user_id;

    claimRow.hidden = !canClaim;

    replyForm.hidden =
      request.status === "resolved" || Boolean(request.customer_deleted_at);

    resolveButton.hidden =
      request.status === "resolved" || Boolean(request.customer_deleted_at);
  }

  /* =========================================================
     MESSAGES
     ========================================================= */

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

      const header = document.createElement("div");

      const sender = document.createElement("strong");

      const timestamp = document.createElement("time");

      const body = document.createElement("p");

      header.className = "support-message__header";

      sender.textContent = `${
        message.sender_type === "support" ? "Support" : "Customer"
      }: ${message.sender_name}`;

      timestamp.dateTime = message.created_at;

      timestamp.textContent = formatDate(message.created_at);

      body.className = "support-message__body";

      /*
       * IMPORTANT:
       * textContent is intentional.
       * Do NOT change this to innerHTML.
       */
      body.textContent = message.body;

      header.append(sender, timestamp);

      card.append(header, body);

      list.append(card);
    }

    list.scrollTop = list.scrollHeight;
  }

  /* =========================================================
     LOAD MESSAGES
     ========================================================= */

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

    if (state.selectedId === requestId) {
      renderMessages(data || []);
    }
  }

  async function loadUnreadState() {
    const { data, error } = await client.rpc("get_support_unread_state");
    if (error) throw error;
    state.unread = new Map(
      (data || []).map((item) => [
        item.request_id,
        Number(item.unread_count || 0),
      ]),
    );
  }

  async function markRequestRead(requestId) {
    try {
      await client.rpc("mark_support_request_read", {
        p_support_request_id: requestId,
      });
      state.unread.set(requestId, 0);
      renderQueue();
    } catch (error) {
      console.error("Unable to mark Support request as read", error);
    }
  }

  /* =========================================================
     SELECT REQUEST
     ========================================================= */

  async function selectRequest(requestId) {
    /*
     * Important for mobile:
     * clicking the already-selected request
     * must still open the conversation.
     */
    if (state.selectedId === requestId && !state.isLoadingDetail) {
      syncMobileConversationView();
      return;
    }

    if (state.isLoadingDetail) return;

    state.selectedId = requestId;

    syncMobileConversationView();

    state.isLoadingDetail = true;

    setActionMessage();

    noSelection.hidden = true;
    detail.hidden = false;

    renderQueue();

    const request = selectedRequest();

    if (!request) {
      state.isLoadingDetail = false;
      return;
    }

    renderRequestHeader(request);

    try {
      await loadMessages(requestId);
      await markRequestRead(requestId);
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

  /* =========================================================
     LOAD QUEUE
     ========================================================= */

  async function loadQueue({ preserveSelection = true } = {}) {
    state.isLoadingQueue = true;

    renderQueue();

    try {
      const { data, error } = await client
        .from("support_requests")
        .select(REQUEST_COLUMNS)
        .is("customer_deleted_at", null)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      state.requests = data || [];

      try {
        await loadUnreadState();
      } catch (error) {
        console.error("Unable to load Support unread state", error);
        state.unread = new Map();
      }

      if (!preserveSelection || !selectedRequest()) {
        state.selectedId = null;
      }

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

      /*
       * Desktop:
       * preserve the selected conversation when refreshing.
       *
       * Mobile:
       * inbox stays visible until the employee
       * explicitly taps a request.
       */
      if (window.matchMedia("(min-width: 761px)").matches) {
        syncMobileConversationView();
      } else {
        supportPage.classList.remove("mobile-conversation-open");
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

  /* =========================================================
     ACTION HANDLER
     ========================================================= */

  async function runAction(button, action, successMessage) {
    const request = selectedRequest();

    if (!request || state.isActionPending) {
      return;
    }

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

      return false;
    } finally {
      button.textContent = label;

      setBusy(false);
    }
  }

  /* =========================================================
     ACCESS GATE
     ========================================================= */

  async function gate() {
    try {
      state.session = await authApi.getSession();

      if (!state.session?.user) {
        return redirect("login.html");
      }

      const { data, error } = await client.rpc(
        "is_current_user_support_employee",
      );

      if (error) throw error;

      if (data !== true) {
        return redirect("index.html");
      }

      document.body.classList.remove("support-gated");

      accessStatus.textContent = "Active Support employee";

      await loadQueue({
        preserveSelection: false,
      });
    } catch (error) {
      console.error("Support access check failed", error);

      redirect("index.html");
    }
  }

  /* =========================================================
     LOGOUT
     ========================================================= */

  $("#supportLogout").addEventListener("click", async () => {
    try {
      await authApi.requestSignOut({
        redirectTo: "index.html",
      });
    } catch (error) {
      console.error("Support logout failed", error);
    }
  });

  /* =========================================================
     REFRESH
     ========================================================= */

  refreshQueue.addEventListener("click", () => loadQueue());

  /* =========================================================
     SEARCH
     ========================================================= */

  search.addEventListener("input", renderQueue);

  /* =========================================================
     FILTERS
     ========================================================= */

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeFilter = button.dataset.filter;

      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });

      renderQueue();
    });
  });

  /* =========================================================
     CLAIM
     ========================================================= */

  claimButton.addEventListener("click", () =>
    runAction(
      claimButton,

      (id) =>
        client.rpc("claim_support_request", {
          p_support_request_id: id,
        }),

      "Request claimed.",
    ),
  );

  /* =========================================================
     REPLY COUNTER
     ========================================================= */

  reply.addEventListener("input", () => {
    replyCount.textContent = `${reply.value.length} / 10,000`;
  });

  /* =========================================================
     SEND REPLY
     ========================================================= */

  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const body = reply.value.trim();

    if (!body || body.length > 10000 || state.isActionPending) {
      return;
    }

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

  /* =========================================================
     RESOLVE
     ========================================================= */

  resolveButton.addEventListener("click", () => {
    if (selectedRequest() && !state.isActionPending) {
      resolveDialog.showModal();
    }
  });

  resolveDialog.addEventListener("close", () => {
    if (resolveDialog.returnValue === "confirm") {
      runAction(
        confirmResolve,

        (id) =>
          client.rpc("resolve_support_request", {
            p_support_request_id: id,
          }),

        "Request resolved.",
      );
    }
  });

  /* =========================================================
     AUTH STATE
     ========================================================= */

  authApi.subscribeToAuthChanges((_event, session) => {
    if (!session?.user) {
      redirect("login.html");
    }
  });

  /* =========================================================
     START
     ========================================================= */

  gate();
})();
