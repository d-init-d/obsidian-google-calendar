import type { CalendarEvent, CalendarViewMode, WeekdayIndex } from "../types";
import { WEEKDAY_LABELS } from "../types";
import { getMonthVisibleRange, getDaysInRange, isSameDay, isSameMonth, startOfDay } from "../utils/dateRange";

export interface MonthViewCallbacks {
  onEventClick?: (event: CalendarEvent, date: Date) => void;
  onEventDoubleClick?: (event: CalendarEvent, date: Date) => void;
  onDateClick?: (date: Date) => void;
  onDateDoubleClick?: (date: Date) => void;
  onCreateEvent?: (date: Date) => void;
  onMoreClick?: (date: Date, events: CalendarEvent[]) => void;
}

export interface MonthViewOptions {
  anchorDate: Date;
  events: CalendarEvent[];
  weekStartsOn: WeekdayIndex;
  showWeekends: boolean;
  surface: "sidebar" | "full";
  isLoading?: boolean;
  error?: string | null;
  callbacks?: MonthViewCallbacks;
  maxEventsPerDay?: number;
}

interface DayCellData {
  date: Date;
  isToday: boolean;
  isOutOfMonth: boolean;
  isWeekend: boolean;
  events: CalendarEvent[];
  overflowCount: number;
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

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return "";
  const start = event.start;
  const hours = start.getHours();
  const minutes = start.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

function buildMonthGridHtml(cells: DayCellData[], weekdays: WeekdayIndex[], options: MonthViewOptions): string {
  const { surface, maxEventsPerDay = 3, callbacks } = options;

  const weekdayHeaders = weekdays
    .map((day) => `<div class="ogc-month-grid__weekday">${WEEKDAY_LABELS[day]}</div>`)
    .join("");

  const dayCells = cells.map((cell) => {
    const dateKey = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
    const outOfMonthClass = cell.isOutOfMonth ? "ogc-day-cell--outside" : "";
    const todayClass = cell.isToday ? "ogc-day-cell--today" : "";
    const weekendClass = cell.isWeekend ? "ogc-day-cell--weekend" : "";

    const visibleEvents = cell.events.slice(0, maxEventsPerDay);
    const overflow = cell.events.length - maxEventsPerDay;

    const eventChips = visibleEvents.map((event) => {
      const color = getEventColor(event);
      const timeStr = formatEventTime(event);
      const timeHtml = timeStr ? `<span class="ogc-event-chip__time">${timeStr}</span>` : "";
      return `<div class="ogc-event-chip" 
        data-event-id="${event.id}" 
        data-date-key="${dateKey}"
        style="background-color: ${color}; color: #fff;"
      >${timeHtml}<span class="ogc-event-chip__title">${event.title}</span></div>`;
    }).join("");

    const moreIndicator = overflow > 0
      ? `<div class="ogc-day-cell__more" data-date-key="${dateKey}" data-overflow="${overflow}">+${overflow} more</div>`
      : "";

    return `<div class="ogc-day-cell ${outOfMonthClass} ${todayClass} ${weekendClass}" data-date-key="${dateKey}">
      <div class="ogc-day-cell__header">
        <span class="ogc-day-cell__date">${cell.date.getDate()}</span>
      </div>
      <div class="ogc-day-cell__events">${eventChips}</div>
      ${moreIndicator}
    </div>`;
  }).join("");

  const shellClass = surface === "sidebar" ? "ogc-sidebar" : "ogc-tab-grid ogc-tab-grid--month";

  return `<div class="ogc-month-view ${shellClass}">
    <div class="ogc-month-grid__header">${weekdayHeaders}</div>
    <div class="ogc-month-grid__body">${dayCells}</div>
  </div>`;
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

function getWeekdaysForRange(weekStartsOn: WeekdayIndex, showWeekends: boolean): WeekdayIndex[] {
  const days: WeekdayIndex[] = [];
  for (let i = 0; i < 7; i++) {
    const day = ((weekStartsOn + i) % 7) as WeekdayIndex;
    if (showWeekends || (day !== 0 && day !== 6)) {
      days.push(day);
    }
  }
  return days;
}

export function renderMonthView(container: HTMLElement, options: MonthViewOptions): void {
  const { isLoading, error } = options;

  if (isLoading) {
    container.empty();
    container.innerHTML = buildPlaceholderHtml("Loading calendar...", "loading");
    return;
  }

  if (error) {
    container.empty();
    container.innerHTML = buildPlaceholderHtml(error, "error");
    return;
  }

  container.empty();

  const anchor = options.anchorDate;
  const range = getMonthVisibleRange(anchor, options.weekStartsOn, options.showWeekends);
  const days = getDaysInRange(range);
  const weekdays = getWeekdaysForRange(options.weekStartsOn, options.showWeekends);
  const today = startOfDay(new Date());

  const eventMap = new Map<string, CalendarEvent[]>();
  for (const event of options.events) {
    const key = `${event.start.getFullYear()}-${event.start.getMonth()}-${event.start.getDate()}`;
    const existing = eventMap.get(key);
    if (existing) {
      existing.push(event);
    } else {
      eventMap.set(key, [event]);
    }
  }

  const cells: DayCellData[] = days.map((date) => {
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const dayEvents = eventMap.get(dateKey) || [];
    return {
      date,
      isToday: isSameDay(date, today),
      isOutOfMonth: !isSameMonth(date, anchor),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      events: dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime()),
      overflowCount: Math.max(0, dayEvents.length - (options.maxEventsPerDay ?? 3)),
    };
  });

  container.innerHTML = buildMonthGridHtml(cells, weekdays, options);

  const eventChips = container.querySelectorAll<HTMLElement>(".ogc-event-chip[data-event-id]");
  eventChips.forEach((chip) => {
    const eventId = chip.dataset["eventId"];
    const dateKey = chip.dataset["dateKey"];
    if (!eventId || !dateKey) return;

    const event = options.events.find((e) => e.id === eventId);
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m, d);

    chip.addEventListener("click", () => {
      if (event && options.callbacks?.onEventClick) {
        options.callbacks.onEventClick(event, date);
      }
    });

    chip.addEventListener("dblclick", () => {
      if (event && options.callbacks?.onEventDoubleClick) {
        options.callbacks.onEventDoubleClick(event, date);
      }
    });
  });

  const dayCells = container.querySelectorAll<HTMLElement>(".ogc-day-cell[data-date-key]");
  dayCells.forEach((cell) => {
    const dateKey = cell.dataset["dateKey"];
    if (!dateKey) return;

    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m, d);

    cell.addEventListener("click", () => {
      if (options.callbacks?.onDateClick) {
        options.callbacks.onDateClick(date);
      }
    });

    cell.addEventListener("dblclick", () => {
      if (options.callbacks?.onDateDoubleClick) {
        options.callbacks.onDateDoubleClick(date);
      } else if (options.callbacks?.onCreateEvent) {
        options.callbacks.onCreateEvent(date);
      }
    });
  });

  const moreIndicators = container.querySelectorAll<HTMLElement>(".ogc-day-cell__more[data-date-key]");
  moreIndicators.forEach((indicator) => {
    const dateKey = indicator.dataset["dateKey"];
    const overflow = parseInt(indicator.dataset["overflow"] || "0", 10);
    if (!dateKey || !overflow) return;

    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m, d);
    const dayEvents = eventMap.get(dateKey) || [];

    indicator.addEventListener("click", () => {
      if (options.callbacks?.onMoreClick) {
        options.callbacks.onMoreClick(date, dayEvents);
      }
    });
  });
}