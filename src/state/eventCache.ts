import type { CalendarEvent, DateRange, EventCacheEntry, EventCacheKey } from "../types";

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