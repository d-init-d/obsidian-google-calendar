import type { DateRange, WeekdayIndex } from "../types";

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isWithinRange(date: Date, range: DateRange): boolean {
  const d = date.getTime();
  return d >= range.start.getTime() && d < range.end.getTime();
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const d = date.getTime();
  return d >= start.getTime() && d < end.getTime();
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfWeek(date: Date, weekStartsOn: WeekdayIndex = 0): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date: Date, weekStartsOn: WeekdayIndex = 0): Date {
  const start = startOfWeek(date, weekStartsOn);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getWeekdays(showWeekends: boolean, weekStartsOn: WeekdayIndex = 0): WeekdayIndex[] {
  const days: WeekdayIndex[] = [];
  for (let i = 0; i < 7; i++) {
    const day = ((weekStartsOn + i) % 7) as WeekdayIndex;
    if (showWeekends || (day !== 0 && day !== 6)) {
      days.push(day);
    }
  }
  return days;
}

export function getMonthVisibleRange(anchor: Date, weekStartsOn: WeekdayIndex = 0, showWeekends: boolean = true): DateRange {
  const firstOfMonth = startOfMonth(anchor);
  const monthStartWeek = startOfWeek(firstOfMonth, weekStartsOn);

  const lastOfMonth = endOfMonth(anchor);
  const monthEndWeek = endOfWeek(lastOfMonth, weekStartsOn);

  return { start: monthStartWeek, end: monthEndWeek };
}

export function getWeekVisibleRange(anchor: Date, weekStartsOn: WeekdayIndex = 0, showWeekends: boolean = true): DateRange {
  const start = startOfWeek(anchor, weekStartsOn);
  const end = endOfWeek(anchor, weekStartsOn);
  return { start, end };
}

export function getDayVisibleRange(anchor: Date): DateRange {
  return { start: startOfDay(anchor), end: endOfDay(anchor) };
}

export function getAgendaVisibleRange(anchor: Date): DateRange {
  const today = startOfDay(anchor);
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  end.setHours(23, 59, 59, 999);
  return { start: today, end };
}

export function getDaysInRange(range: DateRange): Date[] {
  const days: Date[] = [];
  const current = startOfDay(range.start);
  const end = startOfDay(range.end);

  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

export function getWeekendCount(range: DateRange): number {
  let count = 0;
  const current = startOfDay(range.start);
  const end = startOfDay(range.end);

  while (current <= end) {
    const day = current.getDay();
    if (day === 0 || day === 6) count++;
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function diffDays(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / msPerDay);
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}