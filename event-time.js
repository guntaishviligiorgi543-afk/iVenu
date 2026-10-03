(() => {
  const EVENT_TIME_ZONE = "Asia/Tbilisi";

  function getEventCutoff(event) {
    if (!event?.event_date || !event?.event_time) return null;
    const dateMatch = String(event.event_date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = String(event.event_time).match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!dateMatch || !timeMatch) return null;

    const wallClockMs = Date.UTC(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      Number(timeMatch[1]),
      Number(timeMatch[2]),
      Number(timeMatch[3] || 0),
    );
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: EVENT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(wallClockMs));
    const values = Object.fromEntries(
      parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]),
    );
    const timeZoneWallClockMs = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    );
    return new Date(wallClockMs - (timeZoneWallClockMs - wallClockMs));
  }

  function isEventEnded(event, now = new Date()) {
    if (event?.status === "cancelled") return false;
    if (event?.status === "completed") return true;
    if (event?.status !== "active") return false;
    const cutoff = getEventCutoff(event);
    return Boolean(cutoff && cutoff.getTime() <= now.getTime());
  }

  window.iVenueEventTime = Object.freeze({
    getEventCutoff,
    isEventEnded,
    timeZone: EVENT_TIME_ZONE,
  });
})();
