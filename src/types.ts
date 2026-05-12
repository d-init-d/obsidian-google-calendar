export type CalendarSurface = "sidebar" | "full";
export type CalendarViewMode = "month" | "week" | "day" | "agenda";

export interface PluginSettings {
  clientId: string;
  selectedCalendarIds: string[];
  defaultCalendarId: string | null;
  defaultView: CalendarViewMode;
  refreshIntervalMinutes: number;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
}

export interface TokenState {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  colorId?: string;
  backgroundColor?: string;
  htmlLink?: string;
  recurringEventId?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface VisibleRange extends DateRange {
  view: CalendarViewMode;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
}

export interface EventLayout {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  row: number;
  column: number;
  span: number;
}

export interface CalendarState {
  surface: CalendarSurface;
  calendarView: CalendarViewMode;
  anchorDate: Date;
  selectedDate: Date | null;
  loading: boolean;
  error: string | null;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
  visibleEventRange: DateRange | null;
  authStatus: AuthStatus;
}

export type AuthStatus = "disconnected" | "needs-auth" | "connected";

export interface EventCacheKey {
  range: DateRange;
  calendarIds: string[];
}

export interface EventCacheEntry {
  events: CalendarEvent[];
  fetchedAt: Date;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_FULL_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
