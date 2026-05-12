import type { CalendarEvent, DateRange, EventCacheEntry, EventCacheKey, TokenState, PluginSettings } from "../types";
import { getMonthVisibleRange, getWeekVisibleRange, getDayVisibleRange, getAgendaVisibleRange } from "../utils/dateRange";
import type { CalendarApiClient, ApiError } from "../google/calendarApi";
import { refreshAccessToken } from "../google/oauth";

export class EventCache {
  private cache: Map<string, EventCacheEntry> = new Map();
  private ttlMs: number;
  private maxEntries: number;

  constructor(ttlMs: number = 5 * 60 * 1000, maxEntries: number = 100) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  private buildKey(range: DateRange, calendarIds: string[]): string {
    const rangeKey = `${range.start.getTime()}-${range.end.getTime()}`;
    const idsKey = [...calendarIds].sort().join(",");
    return `${rangeKey}|${idsKey}`;
  }

  get(range: DateRange, calendarIds: string[]): CalendarEvent[] | null {
    const key = this.buildKey(range, calendarIds);
    const entry = this.cache.get(key);

    if (!entry) return null;

    const now = Date.now();
    if (now - entry.fetchedAt.getTime() > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.events;
  }

  set(range: DateRange, calendarIds: string[], events: CalendarEvent[]): void {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.findOldestEntry();
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const key = this.buildKey(range, calendarIds);
    this.cache.set(key, {
      events: [...events],
      fetchedAt: new Date(),
    });
  }

  invalidate(calendarId?: string): void {
    if (!calendarId) {
      this.cache.clear();
      return;
    }

    for (const [key, entry] of this.cache) {
      const hasCalendar = entry.events.some((e) => e.calendarId === calendarId);
      if (hasCalendar) {
        this.cache.delete(key);
      }
    }
  }

  invalidateRange(range: DateRange, calendarIds: string[]): void {
    const key = this.buildKey(range, calendarIds);
    this.cache.delete(key);
  }

  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      const time = entry.fetchedAt.getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; maxEntries: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
    };
  }
}

let globalEventCache: EventCache | null = null;

export function getEventCache(): EventCache {
  if (!globalEventCache) {
    globalEventCache = new EventCache();
  }
  return globalEventCache;
}

export function resetEventCache(): void {
  globalEventCache = new EventCache();
}

export type AuthStatus = "disconnected" | "needs-auth" | "connected";

export interface SyncResult {
  events: CalendarEvent[];
  authStatus: AuthStatus;
  errorMessage: string | null;
}

export interface SyncCallbacks {
  onAuthFailed(): void;
  onSyncComplete(events: CalendarEvent[], authStatus: AuthStatus): void;
  onSyncError(message: string): void;
}

export class SyncManager {
  private apiClient: CalendarApiClient;
  private cache: EventCache;
  private settings: PluginSettings;
  private tokenState: TokenState;
  private intervalId: number | null = null;
  private callbacks: SyncCallbacks | null = null;
  private refreshIntervalMs: number = 0;

  constructor(
    apiClient: CalendarApiClient,
    cache: EventCache,
    settings: PluginSettings,
    tokenState: TokenState
  ) {
    this.apiClient = apiClient;
    this.cache = cache;
    this.settings = settings;
    this.tokenState = tokenState;
    this.refreshIntervalMs = (settings.refreshIntervalMinutes || 30) * 60 * 1000;
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
    this.refreshIntervalMs = (settings.refreshIntervalMinutes || 30) * 60 * 1000;
    this.restartInterval();
  }

  updateTokenState(tokenState: TokenState): void {
    this.tokenState = tokenState;
  }

  setCallbacks(callbacks: SyncCallbacks): void {
    this.callbacks = callbacks;
  }

  isConnected(): boolean {
    return this.tokenState.accessToken !== "" && this.tokenState.refreshToken !== null;
  }

  getAuthStatus(): AuthStatus {
    if (this.tokenState.accessToken === "") {
      return "disconnected";
    }
    return "connected";
  }

  getVisibleRangeForView(anchorDate: Date, view: string, weekStartsOn: 0 | 1, showWeekends: boolean): DateRange {
    switch (view) {
      case "month":
        return getMonthVisibleRange(anchorDate, weekStartsOn, showWeekends);
      case "week":
        return getWeekVisibleRange(anchorDate, weekStartsOn, showWeekends);
      case "day":
        return getDayVisibleRange(anchorDate);
      case "agenda":
        return getAgendaVisibleRange(anchorDate);
      default:
        return getWeekVisibleRange(anchorDate, weekStartsOn, showWeekends);
    }
  }

  async syncVisibleRange(
    anchorDate: Date,
    view: string,
    weekStartsOn: 0 | 1,
    showWeekends: boolean
  ): Promise<SyncResult> {
    if (!this.isConnected()) {
      const status = this.tokenState.accessToken === "" ? "disconnected" : "needs-auth";
      return { events: [], authStatus: status, errorMessage: null };
    }

    const range = this.getVisibleRangeForView(anchorDate, view, weekStartsOn, showWeekends);
    const calendarIds = this.settings.selectedCalendarIds.length > 0
      ? this.settings.selectedCalendarIds
      : ["primary"];

    const cached = this.cache.get(range, calendarIds);
    if (cached !== null) {
      return { events: cached, authStatus: "connected", errorMessage: null };
    }

    try {
      const events = await this.apiClient.listEvents({
        calendarIds,
        start: range.start,
        end: range.end,
      });

      this.cache.set(range, calendarIds, events);
      return { events, authStatus: "connected", errorMessage: null };
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.isAuthError) {
        return { events: [], authStatus: "needs-auth", errorMessage: "Authentication failed. Please re-authenticate." };
      }
      return { events: [], authStatus: "connected", errorMessage: apiError.message || "Failed to fetch events." };
    }
  }

  manualSync(anchorDate: Date, view: string, weekStartsOn: 0 | 1, showWeekends: boolean): void {
    if (!this.callbacks) return;

    if (!this.isConnected()) {
      this.callbacks.onSyncError("Not connected to Google Calendar.");
      return;
    }

    this.syncVisibleRange(anchorDate, view, weekStartsOn, showWeekends)
      .then((result) => {
        this.callbacks?.onSyncComplete(result.events, result.authStatus);
      })
      .catch((err: Error) => {
        this.callbacks?.onSyncError(err.message || "Sync failed.");
      });
  }

  startInterval(anchorDate: Date, view: string, weekStartsOn: 0 | 1, showWeekends: boolean): void {
    this.stopInterval();
    if (this.refreshIntervalMs <= 0) return;
    if (!this.isConnected()) return;

    this.intervalId = window.setInterval(() => {
      this.syncVisibleRange(anchorDate, view, weekStartsOn, showWeekends)
        .then((result) => {
          if (this.callbacks) {
            this.callbacks.onSyncComplete(result.events, result.authStatus);
          }
        })
        .catch((err: Error) => {
          if (this.callbacks) {
            this.callbacks.onSyncError(err.message || "Interval sync failed.");
          }
        });
    }, this.refreshIntervalMs);
  }

  stopInterval(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  restartInterval(): void {
    this.stopInterval();
  }

  invalidateCacheForCalendar(calendarId: string): void {
    this.cache.invalidate(calendarId);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

let globalSyncManager: SyncManager | null = null;

export function getSyncManager(): SyncManager | null {
  return globalSyncManager;
}

export function createSyncManager(
  apiClient: CalendarApiClient,
  cache: EventCache,
  settings: PluginSettings,
  tokenState: TokenState
): SyncManager {
  globalSyncManager = new SyncManager(apiClient, cache, settings, tokenState);
  return globalSyncManager;
}

export function resetSyncManager(): void {
  if (globalSyncManager) {
    globalSyncManager.stopInterval();
  }
  globalSyncManager = null;
}