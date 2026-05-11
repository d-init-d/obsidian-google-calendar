import type { CalendarEvent, CalendarViewMode } from "../types";
import { MONTH_LABELS, WEEKDAY_LABELS } from "../types";
import {
  addDays,
  addMonths,
  getMonthVisibleRange,
  getDaysInRange,
  isSameDay,
  isSameMonth,
  startOfDay,
} from "../utils/dateRange";

export type SidebarStatus = "loading" | "empty" | "error" | "disconnected" | "needs-auth" | "ok";

export interface SidebarCallbacks {
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onSync?: () => void;
  onExpand?: () => void;
}

export interface SidebarOptions {
  title: string;
  status: SidebarStatus;
  errorMessage?: string | null;
  anchorDate: Date;
  weekStartsOn?: 0 | 1;
  selectedDate: Date | null;
  events: CalendarEvent[];
  callbacks?: SidebarCallbacks;
}

interface MiniMonthDay {
  date: Date;
  isToday: boolean;
  isOutOfMonth: boolean;
  isSelected: boolean;
  hasEvents: boolean;
  eventCount: number;
}

function buildMiniMonthHtml(days: MiniMonthDay[], anchorMonth: Date, onPrev: () => void, onNext: () => void): string {
  const monthLabel = `${MONTH_LABELS[anchorMonth.getMonth()]} ${anchorMonth.getFullYear()}`;

  const weekdayHeaders = WEEKDAY_LABELS.map((label) => `<div class="ogc-mini-month__weekday">${label}</div>`).join("");

  const dayCells = days.map((day) => {
    const classes = [
      "ogc-mini-month__day",
      day.isToday ? "ogc-mini-month__day--today" : "",
      day.isOutOfMonth ? "ogc-mini-month__day--outside" : "",
      day.isSelected ? "ogc-mini-month__day--selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const dateKey = day.date.toISOString();
    const dot = day.hasEvents ? `<span class="ogc-mini-month__dot" aria-hidden="true"></span>` : "";
    return `<div class="${classes}" data-date-key="${dateKey}">${day.date.getDate()}${dot}</div>`;
  }).join("");

  return `
    <div class="ogc-mini-month">
      <div class="ogc-mini-month__header">
        <button class="ogc-btn ogc-btn--icon ogc-mini-month__nav" data-action="prev" title="Previous month">‹</button>
        <span class="ogc-mini-month__title">${monthLabel}</span>
        <button class="ogc-btn ogc-btn--icon ogc-mini-month__nav" data-action="next" title="Next month">›</button>
      </div>
      <div class="ogc-mini-month__grid">
        <div class="ogc-mini-month__weekdays">${weekdayHeaders}</div>
        <div class="ogc-mini-month__days">${dayCells}</div>
      </div>
    </div>
  `;
}

function buildAgendaHtml(events: CalendarEvent[], today: Date, callbacks?: SidebarCallbacks): string {
  const groups = groupEventsForSidebar(events, today);

  if (groups.length === 0) {
    return `<div class="ogc-sidebar__empty">No upcoming events</div>`;
  }

  const groupHtml = groups
    .map((group) => {
      const dateLabel = formatSidebarDateHeader(group.date, group.isToday);
      const eventItems = group.events
        .map((event) => {
          const timeStr = event.allDay ? "All day" : formatTime(event.start);
          const title = event.title || "(No title)";
          return `<div class="ogc-sidebar-event" data-event-id="${event.id}">
            <span class="ogc-sidebar-event__time">${timeStr}</span>
            <span class="ogc-sidebar-event__title">${title}</span>
          </div>`;
        })
        .join("");

      return `<div class="ogc-sidebar-agenda-group" data-date-key="${group.dateKey}">
        <div class="ogc-sidebar-agenda-group__header">${dateLabel}</div>
        <div class="ogc-sidebar-agenda-group__events">${eventItems}</div>
      </div>`;
    })
    .join("");

  return `<div class="ogc-sidebar-agenda">${groupHtml}</div>`;
}

function buildStatusHtml(status: SidebarStatus, errorMessage?: string | null): string {
  switch (status) {
    case "loading":
      return `<div class="ogc-status ogc-status--loading">
        <div class="ogc-loading-spinner"></div>
        <span>Loading...</span>
      </div>`;
    case "disconnected":
      return `<div class="ogc-status ogc-status--disconnected">
        <span class="ogc-status__icon">🔗</span>
        <span>Not connected</span>
      </div>`;
    case "needs-auth":
      return `<div class="ogc-status ogc-status--auth">
        <span class="ogc-status__icon">🔒</span>
        <span>Re-authentication required</span>
      </div>`;
    case "error":
      return `<div class="ogc-status ogc-status--error">
        <span class="ogc-status__icon">⚠️</span>
        <span>${errorMessage || "An error occurred"}</span>
      </div>`;
    case "empty":
      return `<div class="ogc-status ogc-status--empty">
        <span>No events</span>
      </div>`;
    default:
      return "";
  }
}

interface AgendaGroup {
  date: Date;
  dateKey: string;
  isToday: boolean;
  events: CalendarEvent[];
}

function groupEventsForSidebar(events: CalendarEvent[], today: Date): AgendaGroup[] {
  const groups: Map<string, AgendaGroup> = new Map();
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const event of sorted) {
    const key = `${event.start.getFullYear()}-${String(event.start.getMonth() + 1).padStart(2, "0")}-${String(event.start.getDate()).padStart(2, "0")}`;
    const existing = groups.get(key);
    if (existing) {
      existing.events.push(event);
    } else {
      const date = startOfDay(event.start);
      groups.set(key, {
        date,
        dateKey: key,
        isToday: isSameDay(date, today),
        events: [event],
      });
    }
  }

  return Array.from(groups.values());
}

function formatSidebarDateHeader(date: Date, isToday: boolean): string {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const monthDay = date.getDate();
  const todayLabel = isToday ? " (Today)" : "";
  return `${weekday}, ${monthDay}${todayLabel}`;
}

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

function buildMiniMonthDays(
  anchorDate: Date,
  selectedDate: Date | null,
  events: CalendarEvent[],
  weekStartsOn: 0 | 1 = 0,
): MiniMonthDay[] {
  const range = getMonthVisibleRange(anchorDate, weekStartsOn, true);
  const days = getDaysInRange(range);
  const today = startOfDay(new Date());

  const eventCountByDate = new Map<string, number>();
  for (const event of events) {
    const key = `${event.start.getFullYear()}-${event.start.getMonth()}-${event.start.getDate()}`;
    eventCountByDate.set(key, (eventCountByDate.get(key) ?? 0) + 1);
  }

  return days.map((date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const eventCount = eventCountByDate.get(key) ?? 0;
    return {
      date,
      isToday: isSameDay(date, today),
      isOutOfMonth: !isSameMonth(date, anchorDate),
      isSelected: selectedDate !== null && isSameDay(date, selectedDate),
      hasEvents: eventCount > 0,
      eventCount,
    };
  });
}

export function renderSidebar(container: HTMLElement, options: SidebarOptions): void {
  const { status, anchorDate, selectedDate, events, callbacks } = options;

  container.empty();

  const statusHtml = buildStatusHtml(status, options.errorMessage);
  if (statusHtml) {
    container.innerHTML = statusHtml;
    return;
  }

  const shell = document.createElement("div");
  shell.className = "ogc-sidebar-shell";
  container.appendChild(shell);

  const header = document.createElement("div");
  header.className = "ogc-sidebar-header";
  header.innerHTML = `
    <span class="ogc-sidebar-header__title">${options.title}</span>
    <div class="ogc-sidebar-header__actions">
      <button class="ogc-btn ogc-btn--icon ogc-sidebar-header__sync" data-action="sync" title="Sync">↻</button>
      <button class="ogc-btn ogc-btn--icon ogc-sidebar-header__expand" data-action="expand" title="Expand">⤢</button>
    </div>
  `;
  shell.appendChild(header);

  const miniMonthDays = buildMiniMonthDays(anchorDate, selectedDate, events, options.weekStartsOn ?? 0);
  const miniMonthSection = document.createElement("div");
  miniMonthSection.className = "ogc-sidebar-mini-month";
  miniMonthSection.innerHTML = buildMiniMonthHtml(
    miniMonthDays,
    anchorDate,
    () => {
      const newDate = addMonths(anchorDate, -1);
      if (callbacks?.onDateClick) {
        callbacks.onDateClick(newDate);
      }
    },
    () => {
      const newDate = addMonths(anchorDate, 1);
      if (callbacks?.onDateClick) {
        callbacks.onDateClick(newDate);
      }
    },
  );
  shell.appendChild(miniMonthSection);

  const todayBtn = document.createElement("button");
  todayBtn.className = "ogc-btn ogc-btn--secondary ogc-btn--sm ogc-sidebar-today-btn";
  todayBtn.setAttribute("data-action", "today");
  todayBtn.setText("Today");
  miniMonthSection.querySelector(".ogc-mini-month__header")?.appendChild(todayBtn);

  const agendaSection = document.createElement("div");
  agendaSection.className = "ogc-sidebar-agenda-container";
  agendaSection.innerHTML = buildAgendaHtml(events, startOfDay(new Date()), callbacks);
  shell.appendChild(agendaSection);

  header.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
    const action = btn.dataset["action"];
    if (action === "sync" && callbacks?.onSync) {
      btn.addEventListener("click", callbacks.onSync);
    } else if (action === "expand" && callbacks?.onExpand) {
      btn.addEventListener("click", callbacks.onExpand);
    }
  });

  const miniNavBtns = miniMonthSection.querySelectorAll<HTMLButtonElement>(".ogc-mini-month__nav");
  miniNavBtns.forEach((btn) => {
    const action = btn.dataset["action"];
    if (action === "prev") {
      btn.addEventListener("click", () => {
        const newDate = addMonths(anchorDate, -1);
        if (callbacks?.onDateClick) {
          callbacks.onDateClick(newDate);
        }
      });
    } else if (action === "next") {
      btn.addEventListener("click", () => {
        const newDate = addMonths(anchorDate, 1);
        if (callbacks?.onDateClick) {
          callbacks.onDateClick(newDate);
        }
      });
    }
  });

  const todayBtnMiniMonth = miniMonthSection.querySelector<HTMLButtonElement>(".ogc-sidebar-today-btn");
  if (todayBtnMiniMonth) {
    todayBtnMiniMonth.addEventListener("click", () => {
      if (callbacks?.onDateClick) {
        callbacks.onDateClick(new Date());
      }
    });
  }

  const dayCells = miniMonthSection.querySelectorAll<HTMLElement>(".ogc-mini-month__day[data-date-key]");
  dayCells.forEach((cell) => {
    const dateKey = cell.dataset["dateKey"];
    if (!dateKey) return;

    const [, y, m, d] = dateKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? [];
    if (!y) return;
    const date = new Date(Number(y), Number(m) - 1, Number(d));

    cell.addEventListener("click", () => {
      if (callbacks?.onDateClick) {
        callbacks.onDateClick(date);
      }
    });
  });

  const eventItems = agendaSection.querySelectorAll<HTMLElement>(".ogc-sidebar-event[data-event-id]");
  eventItems.forEach((item) => {
    const eventId = item.dataset["eventId"];
    if (!eventId) return;

    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    item.addEventListener("click", () => {
      if (callbacks?.onEventClick) {
        callbacks.onEventClick(event);
      }
    });
  });
}
