import type { CalendarEvent, CalendarSurface } from "../types";
import { formatDate, formatTime } from "../utils/dateFormat";
import { getDayVisibleRange } from "../utils/dateRange";
import { layoutEventsInColumn, splitEventsByAllDay, getAllDayRowHeight, type GridConfig, DEFAULT_GRID_CONFIG } from "../utils/eventLayout";

export interface DayViewOptions {
  anchorDate: Date;
  surface: CalendarSurface;
  events: CalendarEvent[];
  hourHeight: number;
  dayStartHour: number;
  dayEndHour: number;
  onEventClick?: (event: CalendarEvent, element: HTMLElement) => void;
  onEventContextMenu?: (event: CalendarEvent, element: HTMLElement) => void;
  onDateClick?: (date: Date, element: HTMLElement) => void;
  onDateContextMenu?: (date: Date, element: HTMLElement) => void;
}

export interface RenderedDayView {
  container: HTMLElement;
  updateEvents: (events: CalendarEvent[]) => void;
  scrollToHour: (hour: number) => void;
  scrollToNow: () => void;
  destroy: () => void;
}

function buildDayGridHtml(options: DayViewOptions): string {
  const { anchorDate, surface, events, hourHeight, dayStartHour, dayEndHour } = options;

  const range = getDayVisibleRange(anchorDate);
  const day = anchorDate;

  const isToday = (() => {
    const now = new Date();
    return (
      now.getFullYear() === day.getFullYear() &&
      now.getMonth() === day.getMonth() &&
      now.getDate() === day.getDate()
    );
  })();

  const dayName = formatDate(day, "dddd", {});
  const dayNum = formatDate(day, "MMMM D, YYYY", {});

  const hours: string[] = [];
  for (let h = dayStartHour; h <= dayEndHour; h++) {
    const hourDate = new Date(anchorDate);
    hourDate.setHours(h, 0, 0, 0);
    hours.push(formatTime(hourDate, { use12Hour: true }));
  }

  const totalHours = dayEndHour - dayStartHour;
  const gridHeight = totalHours * hourHeight;

  const allDayRowHeight = getAllDayRowHeight(
    events.filter((e) => e.allDay).length,
    24,
  );

  const currentTimeHtml =
    isToday && new Date().getHours() >= dayStartHour && new Date().getHours() <= dayEndHour
      ? `<div class="ogc-current-time" id="ogc-current-time" title="Current time"></div>`
      : "";

  return `
    <div class="ogc-day-view">
      <div class="ogc-day-header">
        <div class="ogc-day-header__sidebar"></div>
        <div class="ogc-day-header__content">
          <div class="ogc-day-header__day-info ${isToday ? "ogc-day-header__day-info--today" : ""}">
            <span class="ogc-day-header__day-name">${dayName}</span>
            <span class="ogc-day-header__day-num">${dayNum}</span>
          </div>
          <div class="ogc-day-header__allday-row" style="height: ${allDayRowHeight}px;"></div>
        </div>
      </div>
      <div class="ogc-day-body-wrapper">
        <div class="ogc-day-body">
          <div class="ogc-day-sidebar">
            <div class="ogc-day-sidebar__allday"></div>
            <div class="ogc-day-sidebar__hours">
              ${hours
                .map(
                  (h, i) => `
                  <div class="ogc-day-sidebar__hour" style="height: ${hourHeight}px;">
                    <span class="ogc-day-sidebar__hour-label">${h}</span>
                  </div>
                `,
                )
                .join("")}
            </div>
          </div>
          <div class="ogc-day-content">
            <div class="ogc-day-content__allday" style="height: ${allDayRowHeight}px;"></div>
            <div class="ogc-day-grid" style="height: ${gridHeight}px;">
              ${hours
                .map(
                  (_, i) => `
                  <div class="ogc-day-grid-slot" data-hour="${dayStartHour + i}"></div>
                `,
                )
                .join("")}
              ${currentTimeHtml}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function positionTimedEvents(
  container: HTMLElement,
  events: CalendarEvent[],
  dayStartHour: number,
  dayEndHour: number,
  hourHeight: number,
  onEventClick?: (event: CalendarEvent, element: HTMLElement) => void,
): void {
  const timedEvents = events.filter((e) => !e.allDay);
  const grid = container.querySelector<HTMLElement>(".ogc-day-grid");
  if (!grid) return;

  const config: GridConfig = {
    ...DEFAULT_GRID_CONFIG,
    columns: 1,
    hourHeight,
    dayStartHour,
    dayEndHour,
    slotMinutes: 30,
  };

  const layouts = layoutEventsInColumn(timedEvents, 0, config);

  layouts.forEach((layout) => {
    const eventEl = document.createElement("div");
    eventEl.className = "ogc-day-event";
    eventEl.dataset["eventId"] = layout.event.id;

    const startHour = layout.event.start.getHours() + layout.event.start.getMinutes() / 60;
    const endHour = layout.event.end.getHours() + layout.event.end.getMinutes() / 60;
    const durationHours = Math.max(0.5, endHour - startHour);

    const top = (startHour - dayStartHour) * hourHeight;
    const height = durationHours * hourHeight;

    eventEl.style.top = `${top}px`;
    eventEl.style.height = `${height}px`;
    eventEl.style.left = `${layout.left * 100}%`;
    eventEl.style.width = `${layout.width * 100}%`;

    const startTimeStr = formatTime(layout.event.start, { use12Hour: true });
    const endTimeStr = formatTime(layout.event.end, { use12Hour: true });

    eventEl.innerHTML = `
      <div class="ogc-day-event__title">${layout.event.title}</div>
      <div class="ogc-day-event__time">${startTimeStr} - ${endTimeStr}</div>
    `;

    if (layout.event.backgroundColor) {
      eventEl.style.backgroundColor = layout.event.backgroundColor;
    }

    if (onEventClick) {
      eventEl.addEventListener("click", () => onEventClick(layout.event, eventEl));
    }

    grid.appendChild(eventEl);
  });
}

function positionAllDayEvents(
  container: HTMLElement,
  events: CalendarEvent[],
  onEventClick?: (event: CalendarEvent, element: HTMLElement) => void,
): void {
  const allDayEvents = events.filter((e) => e.allDay);
  const allDayContainer = container.querySelector<HTMLElement>(".ogc-day-content__allday");
  if (!allDayContainer) return;

  allDayEvents.forEach((event, index) => {
    const eventEl = document.createElement("div");
    eventEl.className = "ogc-day-event ogc-day-event--allday";
    eventEl.dataset["eventId"] = event.id;

    const row = Math.floor(index / 1);
    eventEl.style.top = `${row * 24}px`;
    eventEl.style.left = "0";
    eventEl.style.width = "100%";
    eventEl.style.height = "24px";

    eventEl.innerHTML = `<span class="ogc-day-event__title">${event.title}</span>`;

    if (event.backgroundColor) {
      eventEl.style.backgroundColor = event.backgroundColor;
    }

    if (onEventClick) {
      eventEl.addEventListener("click", () => onEventClick(event, eventEl));
    }

    allDayContainer.appendChild(eventEl);
  });

  const headerAllDay = container.querySelector<HTMLElement>(".ogc-day-header__allday-row");
  if (headerAllDay) {
    allDayEvents.forEach((event, index) => {
      const eventEl = document.createElement("div");
      eventEl.className = "ogc-day-event ogc-day-event--allday-header";
      eventEl.dataset["eventId"] = event.id;

      eventEl.style.top = `${index * 24}px`;
      eventEl.style.left = "0";
      eventEl.style.width = "100%";
      eventEl.style.height = "24px";

      eventEl.innerHTML = `<span class="ogc-day-event__title">${event.title}</span>`;

      if (event.backgroundColor) {
        eventEl.style.backgroundColor = event.backgroundColor;
      }

      if (onEventClick) {
        eventEl.addEventListener("click", () => onEventClick(event, eventEl));
      }

      headerAllDay.appendChild(eventEl);
    });
  }
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

export function renderDayView(container: HTMLElement, options: DayViewOptions): RenderedDayView {
  container.innerHTML = buildDayGridHtml(options);

  const dayView = container.querySelector<HTMLElement>(".ogc-day-view");
  if (!dayView) {
    return {
      container,
      updateEvents: () => {},
      scrollToHour: () => {},
      scrollToNow: () => {},
      destroy: () => {},
    };
  }

  positionAllDayEvents(dayView, options.events, options.onEventClick);
  positionTimedEvents(
    dayView,
    options.events,
    options.dayStartHour,
    options.dayEndHour,
    options.hourHeight,
    options.onEventClick,
  );

  const cleanupTime = startTimeUpdate(dayView, options.dayStartHour, options.dayEndHour, options.hourHeight);

  const scrollContainer = dayView.querySelector<HTMLElement>(".ogc-day-body-wrapper");
  const now = new Date();
  const currentHour = now.getHours();
  if (currentHour >= options.dayStartHour && currentHour <= options.dayEndHour && scrollContainer) {
    const scrollTop = Math.max(0, (currentHour - options.dayStartHour - 1) * options.hourHeight);
    scrollContainer.scrollTop = scrollTop;
  }

  return {
    container: dayView,
    updateEvents: (events: CalendarEvent[]) => {
      const allDayContent = dayView.querySelector<HTMLElement>(".ogc-day-content__allday");
      if (allDayContent) allDayContent.innerHTML = "";
      const headerAllDay = dayView.querySelector<HTMLElement>(".ogc-day-header__allday-row");
      if (headerAllDay) headerAllDay.innerHTML = "";
      const grid = dayView.querySelector<HTMLElement>(".ogc-day-grid");
      if (grid) {
        grid.querySelectorAll(".ogc-day-event").forEach((el) => el.remove());
      }

      positionAllDayEvents(dayView, events, options.onEventClick);
      positionTimedEvents(
        dayView,
        events,
        options.dayStartHour,
        options.dayEndHour,
        options.hourHeight,
        options.onEventClick,
      );
    },
    scrollToHour: (hour: number) => {
      const scrollContainer = dayView.querySelector<HTMLElement>(".ogc-day-body-wrapper");
      if (scrollContainer) {
        const scrollTop = Math.max(0, (hour - options.dayStartHour) * options.hourHeight);
        scrollContainer.scrollTop = scrollTop;
      }
    },
    scrollToNow: () => {
      const now = new Date();
      const currentHour = now.getHours() + now.getMinutes() / 60;
      if (currentHour >= options.dayStartHour && currentHour <= options.dayEndHour) {
        const scrollContainer = dayView.querySelector<HTMLElement>(".ogc-day-body-wrapper");
        if (scrollContainer) {
          const scrollTop = Math.max(0, (currentHour - options.dayStartHour - 1) * options.hourHeight);
          scrollContainer.scrollTop = scrollTop;
        }
      }
    },
    destroy: () => {
      cleanupTime();
    },
  };
}