import type { CalendarEvent, CalendarViewMode } from "../types";
import { isSameDay, startOfDay } from "../utils/dateRange";

export interface AgendaViewCallbacks {
  onEventClick?: (event: CalendarEvent) => void;
  onEventDoubleClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCreateEvent?: (date: Date) => void;
}

export interface AgendaViewOptions {
  anchorDate: Date;
  events: CalendarEvent[];
  surface: "sidebar" | "full";
  isLoading?: boolean;
  error?: string | null;
  callbacks?: AgendaViewCallbacks;
}

interface AgendaGroup {
  date: Date;
  dateLabel: string;
  isToday: boolean;
  events: CalendarEvent[];
}

const CALENDAR_COLORS = [
  "#4285f4", "#34a853", "#fbbc04", "#ea4335",
  "#673ab7", "#009688", "#ff5722", "#795548",
];

function getEventColor(event: CalendarEvent): string {
  if (event.backgroundColor) return event.backgroundColor;
  if (event.colorId) {
    const idx = parseInt(event.colorId, 10) % CALENDAR_COLORS.length;
    return CALENDAR_COLORS[idx];
  }
  return CALENDAR_COLORS[0];
}

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

function formatDateHeader(date: Date, isToday: boolean): string {
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const year = date.getFullYear();
  const todayLabel = isToday ? " <span class=\"ogc-agenda-today-label\">Today</span>" : "";
  return `${weekday}, ${monthDay} ${year}${todayLabel}`;
}

function buildAgendaGroupHtml(group: AgendaGroup): string {
  const dateLabel = formatDateHeader(group.date, group.isToday);

  const eventItems = group.events.map((event) => {
    const color = getEventColor(event);
    const timeStr = event.allDay ? "All day" : formatTime(event.start);
    const title = event.title || "(No title)";
    const location = event.location
      ? `<span class="ogc-agenda-event__location">${event.location}</span>`
      : "";

    return `<div class="ogc-agenda-event" data-event-id="${event.id}">
      <div class="ogc-agenda-event__time" style="color: ${color};">${timeStr}</div>
      <div class="ogc-agenda-event__content">
        <div class="ogc-agenda-event__title" style="border-left: 3px solid ${color};">${title}</div>
        ${location}
      </div>
    </div>`;
  }).join("");

  return `<div class="ogc-agenda-group" data-date-key="${formatDateKey(group.date)}">
    <div class="ogc-agenda-group__header">${dateLabel}</div>
    <div class="ogc-agenda-group__events">${eventItems}</div>
  </div>`;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildPlaceholderHtml(message: string, type: "loading" | "error" | "empty"): string {
  if (type === "loading") {
    return `<div class="ogc-loading-state">
      <div class="ogc-loading-spinner"></div>
      <span class="ogc-loading-text">${message}</span>
    </div>`;
  }
  if (type === "error") {
    return `<div class="ogc-error-state">
      <span class="ogc-error-icon">!</span>
      <span class="ogc-error-text">${message}</span>
    </div>`;
  }
  return `<div class="ogc-empty-state">
    <span class="ogc-empty-state__text">${message}</span>
  </div>`;
}

function groupEventsByDate(events: CalendarEvent[]): AgendaGroup[] {
  const groups: Map<string, AgendaGroup> = new Map();

  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const event of sorted) {
    const key = formatDateKey(event.start);
    const existing = groups.get(key);

    if (existing) {
      existing.events.push(event);
    } else {
      const date = startOfDay(event.start);
      const today = startOfDay(new Date());
      groups.set(key, {
        date,
        dateLabel: formatDateHeader(date, isSameDay(date, today)),
        isToday: isSameDay(date, today),
        events: [event],
      });
    }
  }

  return Array.from(groups.values());
}

export function renderAgendaView(container: HTMLElement, options: AgendaViewOptions): void {
  const { isLoading, error } = options;

  if (isLoading) {
    container.empty();
    container.innerHTML = buildPlaceholderHtml("Loading events...", "loading");
    return;
  }

  if (error) {
    container.empty();
    container.innerHTML = buildPlaceholderHtml(error, "error");
    return;
  }

  container.empty();

  const groups = groupEventsByDate(options.events);

  if (groups.length === 0) {
    container.innerHTML = buildPlaceholderHtml("No upcoming events", "empty");
    return;
  }

  const shellClass = options.surface === "sidebar" ? "ogc-sidebar" : "ogc-tab-grid";

  const groupsHtml = groups.map(buildAgendaGroupHtml).join("");

  container.innerHTML = `<div class="ogc-agenda-view ${shellClass}">${groupsHtml}</div>`;

  const eventItems = container.querySelectorAll<HTMLElement>(".ogc-agenda-event[data-event-id]");
  eventItems.forEach((item) => {
    const eventId = item.dataset["eventId"];
    if (!eventId) return;

    const event = options.events.find((e) => e.id === eventId);
    if (!event) return;

    item.addEventListener("click", () => {
      if (options.callbacks?.onEventClick) {
        options.callbacks.onEventClick(event);
      }
    });

    item.addEventListener("dblclick", () => {
      if (options.callbacks?.onEventDoubleClick) {
        options.callbacks.onEventDoubleClick(event);
      }
    });
  });

  const groupHeaders = container.querySelectorAll<HTMLElement>(".ogc-agenda-group__header");
  groupHeaders.forEach((header) => {
    const group = header.closest<HTMLElement>(".ogc-agenda-group");
    if (!group) return;

    const dateKey = group.dataset["dateKey"];
    if (!dateKey) return;

    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);

    header.addEventListener("click", () => {
      if (options.callbacks?.onDateClick) {
        options.callbacks.onDateClick(date);
      }
    });

    header.addEventListener("dblclick", () => {
      if (options.callbacks?.onCreateEvent) {
        options.callbacks.onCreateEvent(date);
      }
    });
  });
}