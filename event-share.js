(() => {
  const dialogMarkup = `<div class="event-share-dialog__overlay" data-share-close></div><section class="event-share-dialog__content" role="dialog" aria-modal="true" aria-labelledby="eventShareDialogTitle"><button class="event-share-dialog__close" type="button" data-share-close aria-label="Close share dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button><h2 id="eventShareDialogTitle">Share this event</h2><div class="event-share-dialog__actions"><button type="button" data-share-platform="instagram" aria-label="Copy event link for Instagram" title="Copy link for Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7m5 3.5A4.5 4.5 0 1 1 7.5 12A4.5 4.5 0 0 1 12 7.5m0 2A2.5 2.5 0 1 0 14.5 12A2.5 2.5 0 0 0 12 9.5M17.25 6.5a1.25 1.25 0 1 1-1.25-1.25 1.25 1.25 0 0 1 1.25 1.25" /></svg></button><button type="button" data-share-platform="facebook" aria-label="Share on Facebook" title="Share on Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 22v-8h2.75l.5-3h-3.25V9.1c0-.87.29-1.46 1.58-1.46H17V4.96c-.34-.05-1.14-.15-2.17-.15-2.15 0-3.63 1.31-3.63 3.73V11H8v3h3.2v8z" /></svg></button><button type="button" data-share-platform="x" aria-label="Share on X" title="Share on X"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-7.27L5.7 22H2.6l7.24-8.28L2.2 2h6.4l4.42 6.6zm-1.09 18h1.72L7.66 3.9H5.81z" /></svg></button><button type="button" data-share-platform="youtube" aria-label="Copy event link for YouTube" title="Copy link for YouTube"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.5a2.8 2.8 0 0 0-.77-1.27 3 3 0 0 0-1.33-.74C19.52 4 12 4 12 4s-7.52 0-9.4.49a3.1 3.1 0 0 0-1.34.75A3.4 3.4 0 0 0 .49 6.51 29 29 0 0 0 0 12c-.01 1.84.15 3.68.49 5.49.14.48.4.92.77 1.27.37.36.83.61 1.34.74C4.48 20 12 20 12 20s7.52 0 9.4-.49c.51-.13.97-.38 1.33-.74s.63-.79.77-1.27A28.5 28.5 0 0 0 24 12a26.5 26.5 0 0 0-.5-5.5M9.6 15.42V8.58L15.86 12z" /></svg></button></div><p class="event-share-dialog__feedback" id="eventShareFeedback" aria-live="polite"></p></section>`;
  let dialog;
  let sharedEvent;
  let trigger;
  function getDialog() {
    if (dialog) return dialog;
    dialog = document.querySelector("#eventShareDialog");
    if (!dialog) {
      dialog = document.createElement("div");
      dialog.className = "event-share-dialog";
      dialog.id = "eventShareDialog";
      dialog.hidden = true;
      dialog.innerHTML = dialogMarkup;
      document.body.append(dialog);
    }
    dialog.addEventListener("click", handleDialogClick);
    document.addEventListener("keydown", handleEscape);
    return dialog;
  }
  function setFeedback(message = "") { getDialog().querySelector("#eventShareFeedback").textContent = message; }
  function eventUrl(eventId) { const url = new URL("getTickets.html", window.location.href); url.searchParams.set("id", eventId); return url.href; }
  function close() {
    const currentDialog = getDialog();
    if (currentDialog.hidden) return;
    currentDialog.hidden = true;
    document.body.classList.remove("event-share-dialog-open");
    setFeedback();
    sharedEvent = null;
    trigger?.focus();
    trigger = null;
  }
  function handleEscape(event) { if (event.key === "Escape" && dialog && !dialog.hidden) close(); }
  function openShareWindow(url) { const popup = window.open(url, "_blank", "noopener,noreferrer"); if (popup) popup.opener = null; }
  async function copyUrl() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(sharedEvent.url);
      else {
        const input = document.createElement("textarea");
        input.value = sharedEvent.url; input.readOnly = true; input.style.cssText = "position:fixed;opacity:0";
        document.body.append(input); input.select(); const copied = document.execCommand("copy"); input.remove();
        if (!copied) throw new Error("Clipboard copy was unavailable.");
      }
      setFeedback("Link copied");
    } catch (error) { console.error("Event link could not be copied.", error); setFeedback("Unable to copy the link. Please copy it from the address bar."); }
  }
  function record(platform) { window.supabaseData?.recordEventShare(sharedEvent.id, platform).catch((error) => console.error("Event share could not be recorded.", error)); }
  async function handleDialogClick(event) {
    if (event.target.closest("[data-share-close]")) { close(); return; }
    const platform = event.target.closest("[data-share-platform]")?.dataset.sharePlatform;
    if (!platform || !sharedEvent) return;
    if (platform === "facebook") { const target = new URL("https://www.facebook.com/sharer/sharer.php"); target.searchParams.set("u", sharedEvent.url); openShareWindow(target.href); }
    else if (platform === "x") { const target = new URL("https://twitter.com/intent/tweet"); target.searchParams.set("text", `${sharedEvent.title} — iVenue`); target.searchParams.set("url", sharedEvent.url); openShareWindow(target.href); }
    else await copyUrl();
    record(platform);
  }
  window.iVenueEventShare = {
    open(event, sourceTrigger) {
      if (!event?.id) return;
      const currentDialog = getDialog();
      sharedEvent = { id: event.id, title: event.title || event.performer || "Upcoming event", url: eventUrl(event.id) };
      trigger = sourceTrigger || null;
      setFeedback(); currentDialog.hidden = false; document.body.classList.add("event-share-dialog-open");
      currentDialog.querySelector("[data-share-close]")?.focus();
    },
    close,
  };
})();
