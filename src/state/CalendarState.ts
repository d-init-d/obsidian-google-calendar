import type { CalendarState, CalendarSurface, CalendarViewMode, AuthStatus } from "../types";
import { startOfDay } from "../utils/dateRange";

export function createCalendarState(): CalendarState {
  const now = new Date();
  return {
    surface: "sidebar",
    calendarView: "week",
    anchorDate: now,
    selectedDate: null,
    loading: false,
    error: null,
    weekStartsOn: 0,
    showWeekends: true,
    visibleEventRange: null,
    authStatus: "disconnected",
  };
}

export function setSurface(state: CalendarState, surface: CalendarSurface): CalendarState {
  return { ...state, surface };
}

export function setCalendarView(state: CalendarState, calendarView: CalendarViewMode): CalendarState {
  return { ...state, calendarView };
}

export function setAnchorDate(state: CalendarState, anchorDate: Date): CalendarState {
  return { ...state, anchorDate };
}

export function setSelectedDate(state: CalendarState, selectedDate: Date | null): CalendarState {
  return { ...state, selectedDate };
}

export function setLoading(state: CalendarState, loading: boolean): CalendarState {
  return { ...state, loading };
}

export function setError(state: CalendarState, error: string | null): CalendarState {
  return { ...state, error: error ?? null };
}

export function setWeekStartsOn(state: CalendarState, weekStartsOn: 0 | 1): CalendarState {
  return { ...state, weekStartsOn };
}

export function setShowWeekends(state: CalendarState, showWeekends: boolean): CalendarState {
  return { ...state, showWeekends };
}

export function setVisibleEventRange(
  state: CalendarState,
  visibleEventRange: { start: Date; end: Date } | null,
): CalendarState {
  return { ...state, visibleEventRange };
}

export function setAuthStatus(state: CalendarState, authStatus: AuthStatus): CalendarState {
  return { ...state, authStatus };
}

export function selectDate(state: CalendarState, date: Date): CalendarState {
  return {
    ...state,
    selectedDate: startOfDay(date),
  };
}

export function navigateToday(state: CalendarState): CalendarState {
  return { ...state, anchorDate: new Date() };
}

export function clearError(state: CalendarState): CalendarState {
  return { ...state, error: null };
}

export function isViewLoading(state: CalendarState): boolean {
  return state.loading;
}

export function getActiveCalendarIds(state: CalendarState): string[] {
  return [];
}

export interface StateReducer<S> {
  (state: S, partial: Partial<S> & { type: string }): S;
}

export function calendarStateReducer(
  state: CalendarState,
  action: { type: string } & Partial<CalendarState>,
): CalendarState {
  const { type: _, ...rest } = action;
  return { ...state, ...rest };
}