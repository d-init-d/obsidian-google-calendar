export interface GoogleCalendarListResponse {
  kind: "calendar#calendarList";
  etag?: string;
  items?: GoogleCalendar[];
  nextPageToken?: string;
}

export interface GoogleCalendar {
  kind: "calendar#calendarListEntry";
  id: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
  summaryOverride?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
  primary?: boolean;
  accessRole?: "freeBusyReader" | "reader" | "writer" | "owner";
}

export interface GoogleEventsResponse {
  kind: "calendar#events";
  etag?: string;
  summary?: string;
  description?: string;
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GoogleEvent {
  kind: "calendar#event";
  etag?: string;
  id?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  htmlLink?: string;
  created?: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  organizer?: {
    id?: string;
    email?: string;
    displayName?: string;
    self?: boolean;
  };
  attendees?: Array<{
    id?: string;
    email?: string;
    displayName?: string;
    organizer?: boolean;
    self?: boolean;
    inResources?: boolean;
    responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  }>;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  timeZone?: string;
  endTimeUnspecified?: boolean;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleEventDateTime;
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  meetingReady?: boolean;
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  privateCopy?: boolean;
  locked?: boolean;
}

export interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
  relative?: string;
}

export interface GoogleEventCreatedResponse {
  kind: "calendar#event";
  id: string;
  etag?: string;
  htmlLink?: string;
}

export interface RefreshTokenResult {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}
