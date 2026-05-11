import type { CalendarEvent, EventLayout } from "../types";

export interface DayColumn {
  date: Date;
  weekdayIndex: number;
  isWeekend: boolean;
  isOutOfMonth: boolean;
  events: CalendarEvent[];
  timedEvents: CalendarEvent[];
  allDayEvents: CalendarEvent[];
}

export interface GridConfig {
  columns: number;
  columnWidth: number;
  hourHeight: number;
  dayStartHour: number;
  dayEndHour: number;
  slotMinutes: number;
  showAllDay: boolean;
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  columns: 7,
  columnWidth: 1 / 7,
  hourHeight: 60,
  dayStartHour: 0,
  dayEndHour: 24,
  slotMinutes: 30,
  showAllDay: true,
};

export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const dateKey = dateToKey(event.start);
    const existing = map.get(dateKey);

    if (existing) {
      existing.push(event);
    } else {
      map.set(dateKey, [event]);
    }
  }

  for (const [, dayEvents] of map) {
    dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return map;
}

export function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function splitEventsByAllDay(events: CalendarEvent[]): { allDay: CalendarEvent[]; timed: CalendarEvent[] } {
  const allDay: CalendarEvent[] = [];
  const timed: CalendarEvent[] = [];

  for (const event of events) {
    if (event.allDay) {
      allDay.push(event);
    } else {
      timed.push(event);
    }
  }

  return { allDay, timed };
}

export function layoutTimedEvents(
  events: CalendarEvent[],
  config: GridConfig = DEFAULT_GRID_CONFIG,
): EventLayout[] {
  const sorted = [...events].sort((a, b) => {
    const startCompare = a.start.getTime() - b.start.getTime();
    if (startCompare !== 0) return startCompare;
    return a.end.getTime() - b.end.getTime();
  });

  const layouts: EventLayout[] = [];
  const MAX_SLOTS = Math.ceil((config.dayEndHour - config.dayStartHour) * (60 / config.slotMinutes));

  for (const event of sorted) {
    const eventStartHour = event.start.getHours() + event.start.getMinutes() / 60;
    const eventEndHour = event.end.getHours() + event.end.getMinutes() / 60;
    const durationSlots = Math.max(1, Math.ceil((eventEndHour - eventStartHour) * (60 / config.slotMinutes)));

    let row = 0;
    let span = 1;
    let placed = false;

    for (let r = 0; r < MAX_SLOTS && !placed; r++) {
      const slotRow = Math.floor(r * config.slotMinutes / 60);
      const slotStart = config.dayStartHour + (r * config.slotMinutes / 60);
      const slotEnd = slotStart + config.slotMinutes / 60;

      const overlaps = layouts.some(
        (l) =>
          l.row === slotRow &&
          l.event.id !== event.id &&
          eventStartHour < l.event.end.getHours() + l.event.end.getMinutes() / 60 &&
          eventEndHour > l.event.start.getHours() + l.event.start.getMinutes() / 60,
      );

      if (!overlaps && eventStartHour >= slotStart && eventStartHour < slotEnd) {
        row = slotRow;
        span = Math.min(durationSlots, MAX_SLOTS - row);
        placed = true;
      }
    }

    if (!placed) {
      row = Math.floor((eventStartHour - config.dayStartHour) * (60 / config.slotMinutes));
      span = Math.min(durationSlots, MAX_SLOTS - row);
    }

    const top = row * config.slotMinutes;
    const height = span * config.slotMinutes;

    layouts.push({
      event,
      top,
      height,
      left: 0,
      width: 1,
      row,
      column: 0,
      span,
    });
  }

  return layouts;
}

export function layoutEventsInColumn(
  events: CalendarEvent[],
  column: number,
  config: GridConfig = DEFAULT_GRID_CONFIG,
): EventLayout[] {
  const allLayouts: EventLayout[] = [];
  const { allDay, timed } = splitEventsByAllDay(events);

  const sortedTimed = [...timed].sort((a, b) => a.start.getTime() - b.start.getTime());

  const maxCols = 4;
  const columnOccupancy: Array<{ endHour: number; col: number }> = Array(maxCols)
    .fill(null)
    .map(() => ({ endHour: 0, col: -1 }));

  for (const event of sortedTimed) {
    const eventStartHour = event.start.getHours() + event.start.getMinutes() / 60;
    const eventEndHour = event.end.getHours() + event.end.getMinutes() / 60;
    const durationSlots = Math.max(1, Math.ceil((eventEndHour - eventStartHour) * (60 / config.slotMinutes)));

    let assignedCol = -1;
    for (let c = 0; c < maxCols; c++) {
      if (columnOccupancy[c].endHour <= eventStartHour) {
        assignedCol = c;
        break;
      }
    }

    if (assignedCol === -1) {
      let minOverlap = Infinity;
      for (let c = 0; c < maxCols; c++) {
        const overlap = sortedTimed.filter(
          (e) =>
            e.start.getHours() + e.start.getMinutes() / 60 < eventEndHour &&
            e.end.getHours() + e.end.getMinutes() / 60 > eventStartHour &&
            allLayouts.some((l) => l.event.id === e.id && l.column === c),
        ).length;
        if (overlap < minOverlap) {
          minOverlap = overlap;
          assignedCol = c;
        }
      }
    }

    if (assignedCol === -1) assignedCol = 0;

    columnOccupancy[assignedCol] = { endHour: eventEndHour, col: assignedCol };

    const row = Math.floor((eventStartHour - config.dayStartHour) * (60 / config.slotMinutes));
    const span = Math.min(durationSlots, Math.ceil((config.dayEndHour - eventStartHour) * (60 / config.slotMinutes)));

    const top = row * config.slotMinutes;
    const height = span * config.slotMinutes;

    allLayouts.push({
      event,
      top,
      height,
      left: assignedCol / maxCols,
      width: 1 / maxCols,
      row,
      column: assignedCol,
      span,
    });
  }

  return allLayouts;
}

export function layoutWeekEvents(
  dayEvents: CalendarEvent[][],
  config: GridConfig = DEFAULT_GRID_CONFIG,
): EventLayout[][] {
  return dayEvents.map((events) => layoutEventsInColumn(events, 0, config));
}

export function getAllDayRowHeight(count: number, baseHeight: number = 24): number {
  return count === 0 ? 0 : Math.min(count * baseHeight, baseHeight * 4);
}

export function positionAllDayEvents(
  events: CalendarEvent[],
  containerWidth: number,
  maxVisible: number = 3,
): Array<{ event: CalendarEvent; left: number; width: number; top: number }> {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const result: Array<{ event: CalendarEvent; left: number; width: number; top: number }> = [];

  let currentRow = 0;
  let currentWidth = 0;

  for (const event of sorted) {
    if (result.length >= maxVisible) {
      result.push({
        event,
        left: 0,
        width: containerWidth,
        top: currentRow * 24,
      });
      continue;
    }

    if (currentWidth + 1 / sorted.length > containerWidth) {
      currentRow++;
      currentWidth = 0;
    }

    result.push({
      event,
      left: currentWidth,
      width: 1 / sorted.length,
      top: currentRow * 24,
    });

    currentWidth += 1 / sorted.length;
  }

  return result;
}