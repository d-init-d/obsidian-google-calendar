import type { CalendarEvent, EventLayout, CalendarSurface, CalendarViewMode } from "../types";
import { getWeekVisibleRange, getDaysInRange, isSameDay, isWeekend } from "../utils/dateRange";
import { formatDate, formatTime } from "../utils/dateFormat";
import {
  layoutWeekEvents,
  layoutEventsInColumn,
  splitEventsByAllDay,
  getAllDayRowHeight,
  type GridConfig,
  DEFAULT_GRID_CONFIG,
} from "../utils/eventLayout";

export interface WeekViewOptions {
  anchorDate: Date;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  surface: CalendarSurface;
  events: CalendarEvent[];
  hourHeight: number;
  dayStartHour: number;
  dayEndHour: number;
  onEventClick?: (event: CalendarEvent, element: HTMLElement) => void;
  onEventContextMenu?: (event: CalendarEvent, element: HTMLElement, date: Date) => void;
  onDateClick?: (date: Date, element: HTMLElement) => void;
  onDateContextMenu?: (date: Date, element: HTMLElement) => void;
  onCurrentTimeIndicatorClick?: () => void;
}

export interface RenderedWeekView {
  container: HTMLElement;
  updateEvents: (events: CalendarEvent[]) => void;
  scrollToHour: (hour: number) => void;
  destroy: () => void;
}

function buildWeekGridHtml(options: WeekViewOptions): string {
  const {
    anchorDate,
    weekStartsOn,
    showWeekends,
    surface,
    events,
    hourHeight,
    dayStartHour,
    dayEndHour,
  } = options;

  const range = getWeekVisibleRange(anchorDate, weekStartsOn, showWeekends);
  const days = getDaysInRange(range);
  const visibleDays = showWeekends ? days : days.filter((d) => !isWeekend(d));
  const dayCount = visibleDays.length;
  const colWidth = 100 / dayCount;

  const hours: string[] = [];
  for (let h = dayStartHour; h <= dayEndHour; h++) {
    const hourDate = new Date(anchorDate);
    hourDate.setHours(h, 0, 0, 0);
    hours.push(formatTime(hourDate, { use12Hour: true }));
  }

  const totalHours = dayEndHour - dayStartHour;
  const gridHeight = totalHours * hourHeight;

  const weekdayRow = visibleDays
    .map((day) => {
      const isToday = isSameDay(day, new Date());
      const dayName = formatDate(day, "ddd", {});
      const dayNum = formatDate(day, "D", {});
      return `
        <div class="ogc-week-header__day ${isToday ? "ogc-week-header__day--today" : ""}" data-date="${day.toISOString()}">
          <span class="ogc-week-header__day-name">${dayName}</span>
          <span class="ogc-week-header__day-num">${dayNum}</span>
        </div>
      `;
    })
    .join("");

  const allDayRowHeight = getAllDayRowHeight(
    events.filter((e) => e.allDay).length,
    24,
  );

  const hourGridCols = visibleDays
    .map((day) => {
      const isToday = isSameDay(day, new Date());
      const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      return `
        <div class="ogc-week-col ${isToday ? "ogc-week-col--today" : ""}" data-date="${dateKey}">
          <div class="ogc-week-col__all-day" style="height: ${allDayRowHeight}px;" data-date="${dateKey}"></div>
          <div class="ogc-week-col__grid" style="height: ${gridHeight}px;" data-date="${dateKey}">
            ${hours
              .map(
                (_, i) => `
              <div class="ogc-week-grid-slot" data-hour="${dayStartHour + i}" data-date="${dateKey}"></div>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");

  const now = new Date();
  const isCurrentWeekVisible = visibleDays.some((d) => isSameDay(d, now));
  const currentTimeHtml =
    isCurrentWeekVisible && now.getHours() >= dayStartHour && now.getHours() <= dayEndHour
      ? `<div class="ogc-current-time" id="ogc-current-time" title="Current time"></div>`
      : "";

  const scrollableContent = `
    <div class="ogc-week-grid-scroll">
      <div class="ogc-week-body">
        <div class="ogc-week-sidebar">
          <div class="ogc-week-sidebar__all-day">All-day</div>
          <div class="ogc-week-sidebar__hours">
            ${hours
              .map(
                (h, i) => `
              <div class="ogc-week-sidebar__hour" style="height: ${hourHeight}px;">
                <span class="ogc-week-sidebar__hour-label">${h}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
        <div class="ogc-week-days">
          ${hourGridCols}
        </div>
        ${currentTimeHtml}
      </div>
    </div>
  `;

  return `
    <div class="ogc-week-view">
      <div class="ogc-week-header">
        <div class="ogc-week-header__sidebar"></div>
        <div class="ogc-week-header__days">
          ${weekdayRow}
        </div>
      </div>
      <div class="ogc-week-body-wrapper">
        ${scrollableContent}
      </div>
    </div>
  `;
}

function positionEventsInGrid(
  container: HTMLElement,
  events: CalendarEvent[],
  dayStartHour: number,
  dayEndHour: number,
  hourHeight: number,
  dayCount: number,
  onEventClick?: (event: CalendarEvent, element: HTMLElement) => void,
): void {
  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay);

  const dayColumns = container.querySelectorAll<HTMLElement>(".ogc-week-col");
  const allDayRows = container.querySelectorAll<HTMLElement>(".ogc-week-col__all-day");

  const config: GridConfig = {
    ...DEFAULT_GRID_CONFIG,
    columns: dayCount,
    hourHeight,
    dayStartHour,
    dayEndHour,
    slotMinutes: 30,
  };

  const layouts = layoutEventsInColumn(timedEvents, 0, config);

  dayColumns.forEach((col, colIndex) => {
    const dateAttr = col.dataset["date"];
    const dayEvents = timedEvents.filter((e) => {
      const eDate = `${e.start.getFullYear()}-${String(e.start.getMonth() + 1).padStart(2, "0")}-${String(e.start.getDate()).padStart(2, "0")}`;
      return eDate === dateAttr;
    });
    const dayLayouts = layoutEventsInColumn(dayEvents, colIndex, config);

    const grid = col.querySelector<HTMLElement>(".ogc-week-col__grid");
    if (!grid) return;

    dayLayouts.forEach((layout) => {
      const eventEl = document.createElement("div");
      eventEl.className = "ogc-week-event";
      eventEl.dataset["eventId"] = layout.event.id;

      const top = ((layout.event.start.getHours() - dayStartHour) + layout.event.start.getMinutes() / 60) * hourHeight;
      const height = Math.max(
        hourHeight / 2,
        ((layout.event.end.getTime() - layout.event.start.getTime()) / (1000 * 60 * 60)) * hourHeight,
      );

      eventEl.style.top = `${top}px`;
      eventEl.style.height = `${height}px`;
      eventEl.style.left = `${layout.left * 100}%`;
      eventEl.style.width = `${layout.width * 100}%`;

      eventEl.innerHTML = `
        <div class="ogc-week-event__title">${layout.event.title}</div>
        <div class="ogc-week-event__time">${formatTime(layout.event.start, { use12Hour: true })}</div>
      `;

      if (layout.event.backgroundColor) {
        eventEl.style.backgroundColor = layout.event.backgroundColor;
      }

      if (onEventClick) {
        eventEl.addEventListener("click", () => onEventClick(layout.event, eventEl));
      }

      grid.appendChild(eventEl);
    });
  });

  const allDayConfig: GridConfig = {
    ...DEFAULT_GRID_CONFIG,
    columns: dayCount,
    hourHeight,
    dayStartHour,
    dayEndHour,
    slotMinutes: 30,
    showAllDay: true,
  };

  allDayRows.forEach((row, colIndex) => {
    const dateAttr = row.dataset["date"];
    const dayAllDayEvents = allDayEvents.filter((e) => {
      const eDate = `${e.start.getFullYear()}-${String(e.start.getMonth() + 1).padStart(2, "0")}-${String(e.start.getDate()).padStart(2, "0")}`;
      return eDate === dateAttr;
    });

    const dayLayouts = layoutEventsInColumn(dayAllDayEvents, colIndex, allDayConfig);

    dayLayouts.forEach((layout) => {
      const eventEl = document.createElement("div");
      eventEl.className = "ogc-week-event ogc-week-event--all-day";
      eventEl.dataset["eventId"] = layout.event.id;

      eventEl.style.left = `${layout.left * 100}%`;
      eventEl.style.width = `${layout.width * 100}%`;
      eventEl.style.top = `${layout.top}px`;
      eventEl.style.height = "24px";

      eventEl.innerHTML = `<span class="ogc-week-event__title">${layout.event.title}</span>`;

      if (layout.event.backgroundColor) {
        eventEl.style.backgroundColor = layout.event.backgroundColor;
      }

      if (onEventClick) {
        eventEl.addEventListener("click", () => onEventClick(layout.event, eventEl));
      }

      row.appendChild(eventEl);
    });
  });
}

function updateCurrentTimeIndicator(container: HTMLElement, dayStartHour: number, dayEndHour: number, hourHeight: number): void {
  const indicator = container.querySelector<HTMLElement>("#ogc-current-time");
  if (!indicator) return;

  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;

  if (currentHour < dayStartHour || currentHour > dayEndHour) {
    indicator.style.display = "none";
    return;
  }

  const top = (currentHour - dayStartHour) * hourHeight;
  indicator.style.top = `${top}px`;
  indicator.style.display = "block";

  const timeLabel = formatTime(now, { use12Hour: true });
  indicator.innerHTML = `<span class="ogc-current-time__label">${timeLabel}</span>`;
}

function startTimeUpdate(container: HTMLElement, dayStartHour: number, dayEndHour: number, hourHeight: number): () => void {
  updateCurrentTimeIndicator(container, dayStartHour, dayEndHour, hourHeight);
  const intervalId = setInterval(() => {
    updateCurrentTimeIndicator(container, dayStartHour, dayEndHour, hourHeight);
  }, 60000);
  return () => clearInterval(intervalId);
}

export function renderWeekView(container: HTMLElement, options: WeekViewOptions): RenderedWeekView {
  container.innerHTML = buildWeekGridHtml(options);

  const weekView = container.querySelector<HTMLElement>(".ogc-week-view");
  if (!weekView) {
    return {
      container,
      updateEvents: () => {},
      scrollToHour: () => {},
      destroy: () => {},
    };
  }

  positionEventsInGrid(
    weekView,
    options.events,
    options.dayStartHour,
    options.dayEndHour,
    options.hourHeight,
    options.showWeekends
      ? (() => {
          const range = getWeekVisibleRange(options.anchorDate, options.weekStartsOn, true);
          return getDaysInRange(range).length;
        })()
      : 5,
    options.onEventClick,
  );

  const cleanupTime = startTimeUpdate(weekView, options.dayStartHour, options.dayEndHour, options.hourHeight);

  const today = new Date();
  const currentHour = today.getHours();
  if (currentHour >= options.dayStartHour && currentHour <= options.dayEndHour) {
    const scrollContainer = weekView.querySelector<HTMLElement>(".ogc-week-grid-scroll");
    if (scrollContainer) {
      const scrollTop = Math.max(0, (currentHour - options.dayStartHour - 1) * options.hourHeight);
      scrollContainer.scrollTop = scrollTop;
    }
  }

  return {
    container: weekView,
    updateEvents: (events: CalendarEvent[]) => {
      const allDayRows = weekView.querySelectorAll<HTMLElement>(".ogc-week-col__all-day");
      allDayRows.forEach((row) => {
        row.innerHTML = "";
      });
      const grids = weekView.querySelectorAll<HTMLElement>(".ogc-week-col__grid");
      grids.forEach((grid) => {
        grid.innerHTML = "";
      });

      positionEventsInGrid(
        weekView,
        events,
        options.dayStartHour,
        options.dayEndHour,
        options.hourHeight,
        options.showWeekends
          ? (() => {
              const range = getWeekVisibleRange(options.anchorDate, options.weekStartsOn, true);
              return getDaysInRange(range).length;
            })()
          : 5,
        options.onEventClick,
      );
    },
    scrollToHour: (hour: number) => {
      const scrollContainer = weekView.querySelector<HTMLElement>(".ogc-week-grid-scroll");
      if (scrollContainer) {
        const scrollTop = Math.max(0, (hour - options.dayStartHour) * options.hourHeight);
        scrollContainer.scrollTop = scrollTop;
      }
    },
    destroy: () => {
      cleanupTime();
    },
  };
}