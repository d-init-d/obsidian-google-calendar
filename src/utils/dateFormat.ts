import { MONTH_LABELS, WEEKDAY_LABELS, type WeekdayIndex } from "../types";

export type DateFormatToken =
  | "YYYY"
  | "YY"
  | "MMMM"
  | "MMM"
  | "MM"
  | "M"
  | "DDDD"
  | "DDD"
  | "DD"
  | "D"
  | "dddd"
  | "ddd"
  | "dd"
  | "d"
  | "HH"
  | "hh"
  | "mm"
  | "ss"
  | "a"
  | "A";

export interface FormatOptions {
  weekStartsOn?: WeekdayIndex;
  showWeekends?: boolean;
  use12Hour?: boolean;
  showTimezone?: boolean;
  timezone?: string;
}

const TOKEN_REGEX = /YYYY|YY|MMMM|MMM|MM|M|DDDD|DDD|DD|D|dddd|ddd|dd|d|HH|hh|mm|ss|a|A|ll|LL|L|z/g;

function padZero(n: number, len: number = 2): string {
  return String(n).padStart(len, "0");
}

function getMonthName(month: number, format: "MMMM" | "MMM" | "MM" | "M"): string {
  switch (format) {
    case "MMMM":
      return MONTH_LABELS[month];
    case "MMM":
      return MONTH_LABELS[month].substring(0, 3);
    case "MM":
      return padZero(month + 1);
    case "M":
      return String(month + 1);
    default:
      return String(month + 1);
  }
}

function getWeekdayName(day: number, format: "dddd" | "ddd" | "dd" | "d"): string {
  switch (format) {
    case "dddd":
      return WEEKDAY_LABELS[day] === "Sun"
        ? "Sunday"
        : WEEKDAY_LABELS[day] === "Mon"
          ? "Monday"
          : WEEKDAY_LABELS[day] === "Tue"
            ? "Tuesday"
            : WEEKDAY_LABELS[day] === "Wed"
              ? "Wednesday"
              : WEEKDAY_LABELS[day] === "Thu"
                ? "Thursday"
                : WEEKDAY_LABELS[day] === "Fri"
                  ? "Friday"
                  : "Saturday";
    case "ddd":
      return WEEKDAY_LABELS[day];
    case "dd":
      return WEEKDAY_LABELS[day].substring(0, 2);
    case "d":
      return String(day);
    default:
      return String(day);
  }
}

export function formatDate(date: Date, formatStr: string, options: FormatOptions = {}): string {
  const { use12Hour = false } = options;

  return formatStr.replace(TOKEN_REGEX, (token) => {
    switch (token) {
      case "YYYY":
        return String(date.getFullYear());
      case "YY":
        return String(date.getFullYear()).slice(-2);
      case "MMMM":
        return getMonthName(date.getMonth(), "MMMM");
      case "MMM":
        return getMonthName(date.getMonth(), "MMM");
      case "MM":
        return getMonthName(date.getMonth(), "MM");
      case "M":
        return getMonthName(date.getMonth(), "M");
      case "DDDD":
        return getWeekdayName(date.getDay(), "dddd");
      case "DDD":
        return getWeekdayName(date.getDay(), "ddd");
      case "DD":
        return getWeekdayName(date.getDay(), "dd");
      case "D":
        return getWeekdayName(date.getDay(), "d");
      case "dddd":
        return getWeekdayName(date.getDay(), "dddd");
      case "ddd":
        return getWeekdayName(date.getDay(), "ddd");
      case "dd":
        return getWeekdayName(date.getDay(), "dd");
      case "d":
        return getWeekdayName(date.getDay(), "d");
      case "HH":
        return padZero(date.getHours());
      case "hh": {
        const h = date.getHours();
        const hour12 = h % 12 || 12;
        return padZero(use12Hour ? hour12 : h);
      }
      case "mm":
        return padZero(date.getMinutes());
      case "ss":
        return padZero(date.getSeconds());
      case "a":
        return date.getHours() < 12 ? "am" : "pm";
      case "A":
        return date.getHours() < 12 ? "AM" : "PM";
      default:
        return token;
    }
  });
}

export function formatTime(date: Date, options: FormatOptions = {}): string {
  const { use12Hour = true } = options;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = use12Hour ? (hours < 12 ? "AM" : "PM") : "";
  const hour12 = use12Hour ? (hours % 12 || 12) : hours;

  if (minutes === 0) {
    return use12Hour ? `${hour12} ${ampm}` : `${padZero(hour12)}:00`;
  }

  return use12Hour ? `${hour12}:${padZero(minutes)} ${ampm}` : `${padZero(hour12)}:${padZero(minutes)}`;
}

export function formatDateRange(start: Date, end: Date, formatStr: string, options: FormatOptions = {}): string {
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) {
    return formatDate(start, formatStr, options);
  }

  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${formatDate(start, "MMM D", options)} - ${formatDate(end, "D, YYYY", options)}`;
  }

  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameYear) {
    return `${formatDate(start, "MMM D", options)} - ${formatDate(end, "MMM D, YYYY", options)}`;
  }

  return `${formatDate(start, "MMM D, YYYY", options)} - ${formatDate(end, "MMM D, YYYY", options)}`;
}

export function formatMonthYear(date: Date, options: FormatOptions = {}): string {
  return formatDate(date, "MMMM YYYY", options);
}

export function formatDayOfMonth(date: Date): string {
  const day = date.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
        ? "nd"
        : day === 3 || day === 23
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}

export function parseISODate(isoString: string): Date | null {
  if (!isoString) return null;

  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;

  return d;
}

export function toISODateTimeString(date: Date): string {
  return date.toISOString();
}

export function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}