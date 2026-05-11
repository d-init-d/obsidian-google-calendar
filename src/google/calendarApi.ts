import { requestUrl } from "obsidian";
import { refreshAccessToken } from "./oauth";
import type {
  GoogleCalendarListResponse,
  GoogleEventsResponse,
  GoogleEvent,
  RefreshTokenResult,
} from "./googleTypes";
import type { GoogleCalendarInfo, CalendarEvent } from "../types";

const BASE_URL = "https://www.googleapis.com/calendar/v3";

export class ApiError extends Error {
  readonly code: number;
  readonly isAuthError: boolean;
  readonly isRateLimit: boolean;

  constructor(message: string, code: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.isAuthError = code === 401 || code === 403;
    this.isRateLimit = code === 429;
  }
}

export interface TokenAccessor {
  accessToken: string;
  refreshToken: string | null;
}

export interface RefreshFn {
  (refreshToken: string, clientId: string): Promise<RefreshTokenResult>;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  queryParams?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  tokenAccessor: TokenAccessor;
  clientId: string;
  onRefresh?: (result: RefreshTokenResult) => void;
  refreshFn?: RefreshFn;
}

async function authenticatedRequest<T>(options: RequestOptions): Promise<T> {
  const {
    method = "GET",
    path,
    queryParams = {},
    body,
    tokenAccessor,
    clientId,
    onRefresh,
    refreshFn,
  } = options;

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const makeRequest = async (token: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const resp = await requestUrl({
      url: url.toString(),
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      throw: false,
    });

    return resp;
  };

  let lastToken = tokenAccessor.accessToken;
  let resp = await makeRequest(lastToken);

  if (resp.status === 401 && refreshFn && tokenAccessor.refreshToken) {
    const newTokenData = await refreshFn(tokenAccessor.refreshToken, clientId);
    const newToken = newTokenData.access_token;
    if (onRefresh) {
      onRefresh(newTokenData);
    }
    lastToken = newToken;
    resp = await makeRequest(newToken);
  }

  if (resp.status === 403) {
    throw new ApiError("Access forbidden. Check calendar permissions.", 403);
  }

  if (resp.status === 429) {
    throw new ApiError("Rate limit exceeded. Please try again later.", 429);
  }

  if (resp.status >= 400) {
    const errorBody = resp.text ?? "";
    let message = `API error ${resp.status}`;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.error?.message ?? message;
    } catch {
      // use default message
    }
    throw new ApiError(message, resp.status);
  }

  const data = resp.json;
  if (!data) {
    throw new ApiError("Empty API response", resp.status);
  }
  return data as T;
}

export class CalendarApiClient {
  private tokenAccessor: TokenAccessor;
  private clientId: string;
  private refreshFn: RefreshFn;
  private onRefresh?: (result: RefreshTokenResult) => void;

  constructor(
    tokenAccessor: TokenAccessor,
    clientId: string,
    refreshFn?: RefreshFn,
    onRefresh?: (result: RefreshTokenResult) => void
  ) {
    this.tokenAccessor = tokenAccessor;
    this.clientId = clientId;
    this.refreshFn = refreshFn ?? refreshAccessToken;
    this.onRefresh = onRefresh;
  }

  updateTokenAccessor(accessor: TokenAccessor): void {
    this.tokenAccessor = accessor;
  }

  private async request<T>(options: Omit<RequestOptions, "tokenAccessor" | "clientId" | "refreshFn">): Promise<T> {
    return authenticatedRequest<T>({
      ...options,
      tokenAccessor: this.tokenAccessor,
      clientId: this.clientId,
      refreshFn: this.refreshFn,
      onRefresh: this.onRefresh,
    });
  }

  async listCalendars(): Promise<GoogleCalendarInfo[]> {
    const calendars: GoogleCalendarInfo[] = [];
    let pageToken: string | undefined;

    do {
      const resp = await this.request<GoogleCalendarListResponse>({
        path: "/users/me/calendarList",
        queryParams: {
          maxResults: 250,
          pageToken,
          showDeleted: false,
        },
      });

      if (resp.items) {
        for (const cal of resp.items) {
          calendars.push({
            id: cal.id,
            summary: cal.summary ?? cal.id,
            primary: cal.primary ?? false,
            backgroundColor: cal.backgroundColor,
            foregroundColor: cal.foregroundColor,
            timeZone: cal.timeZone,
          });
        }
      }

      pageToken = resp.nextPageToken;
    } while (pageToken);

    return calendars;
  }

  async listEvents(params: {
    calendarIds: string[];
    start: Date;
    end: Date;
    singleEvents?: boolean;
    orderBy?: string;
  }): Promise<CalendarEvent[]> {
    const { calendarIds, start, end, singleEvents = true, orderBy = "startTime" } = params;
    const allEvents: CalendarEvent[] = [];

    for (const calendarId of calendarIds) {
      let pageToken: string | undefined;

      do {
        const resp = await this.request<GoogleEventsResponse>({
          path: `/calendars/${encodeURIComponent(calendarId)}/events`,
          queryParams: {
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            singleEvents,
            orderBy,
            maxResults: 250,
            pageToken,
          },
        });

        if (resp.items) {
          for (const event of resp.items) {
            if (event.status === "cancelled") {
              continue;
            }

            const parsed = parseGoogleEvent(event, calendarId);
            if (parsed) {
              allEvents.push(parsed);
            }
          }
        }

        pageToken = resp.nextPageToken;
      } while (pageToken);
    }

    return allEvents;
  }

  async insertEvent(params: {
    calendarId: string;
    summary: string;
    description?: string;
    location?: string;
    start: Date;
    end: Date;
    allDay: boolean;
    timeZone?: string;
  }): Promise<CalendarEvent> {
    const { calendarId, summary, description, location, start, end, allDay, timeZone } = params;

    const event: Record<string, unknown> = {
      summary,
      description,
      location,
    };

    if (allDay) {
      event.start = { date: formatDateOnly(start) };
      event.end = { date: formatDateOnly(end) };
    } else {
      event.start = { dateTime: start.toISOString(), timeZone: timeZone ?? "UTC" };
      event.end = { dateTime: end.toISOString(), timeZone: timeZone ?? "UTC" };
    }

    const resp = await this.request<GoogleEvent>({
      method: "POST",
      path: `/calendars/${encodeURIComponent(calendarId)}/events`,
      body: event,
    });

    const createdEvent = parseGoogleEvent(resp, calendarId);
    if (!createdEvent) {
      throw new ApiError("Invalid event response", 500);
    }

    return createdEvent;
  }

  async patchEvent(params: {
    eventId: string;
    calendarId: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: Date;
    end?: Date;
    allDay?: boolean;
    timeZone?: string;
  }): Promise<CalendarEvent> {
    const { eventId, calendarId, summary, description, location, start, end, allDay, timeZone } = params;

    const event: Record<string, unknown> = {};
    if (summary !== undefined) event.summary = summary;
    if (description !== undefined) event.description = description;
    if (location !== undefined) event.location = location;

    if (allDay !== undefined && start && end) {
      if (allDay) {
        event.start = { date: formatDateOnly(start) };
        event.end = { date: formatDateOnly(end) };
      } else {
        event.start = { dateTime: start.toISOString(), timeZone: timeZone ?? "UTC" };
        event.end = { dateTime: end.toISOString(), timeZone: timeZone ?? "UTC" };
      }
    }

    const resp = await this.request<GoogleEvent>({
      method: "PATCH",
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      body: event,
    });

    const patchedEvent = parseGoogleEvent(resp, calendarId);
    if (!patchedEvent) {
      throw new ApiError("Invalid event response", 500);
    }

    return patchedEvent;
  }

  async deleteEvent(eventId: string, calendarId: string): Promise<void> {
    await this.request<void>({
      method: "DELETE",
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    });
  }
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseGoogleDate(dateTime: { date?: string; dateTime?: string } | undefined): Date {
  if (!dateTime) {
    return new Date();
  }
  if (dateTime.dateTime) {
    return new Date(dateTime.dateTime);
  }
  if (dateTime.date) {
    const parsed = new Date(dateTime.date + "T00:00:00Z");
    return isNaN(parsed.getTime()) ? new Date(dateTime.date) : parsed;
  }
  return new Date();
}

function parseGoogleEvent(event: GoogleEvent, calendarId: string): CalendarEvent | null {
  if (!event.id) {
    return null;
  }

  const title = event.summary ?? "";
  const startDate = parseGoogleDate(event.start);
  const endDate = parseGoogleDate(event.end);
  const allDay = event.start?.date !== undefined;

  return {
    id: event.id,
    calendarId,
    title,
    description: event.description,
    location: event.location,
    start: startDate,
    end: endDate,
    allDay,
    colorId: event.colorId,
    backgroundColor: event.backgroundColor,
    htmlLink: event.htmlLink,
    recurringEventId: event.recurringEventId,
  };
}
