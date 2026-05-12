import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { CalendarEvent, CalendarViewMode, CalendarSurface, PluginSettings, TokenState, AuthStatus, GoogleCalendarInfo } from "../types";
import { createCalendarState, setSurface, setCalendarView, setAnchorDate, setSelectedDate, setLoading, setError, setAuthStatus } from "../state/CalendarState";
import type { CalendarState } from "../types";
import { renderToolbar } from "./renderToolbar";
import { renderSidebar, type SidebarStatus } from "./renderSidebar";
import { renderMonthView } from "./renderMonthView";
import { renderAgendaView } from "./renderAgendaView";
import { renderWeekView, type RenderedWeekView } from "./renderWeekView";
import { renderDayView, type RenderedDayView } from "./renderDayView";
import { addDays, addWeeks, addMonths, startOfDay } from "../utils/dateRange";
import { getMonthVisibleRange, getWeekVisibleRange, getDayVisibleRange, getAgendaVisibleRange } from "../utils/dateRange";
import { CalendarApiClient, ApiError } from "../google/calendarApi";
import { EventCache, getEventCache, SyncManager, createSyncManager, resetSyncManager } from "../state/eventCache";
import { refreshAccessToken } from "../google/oauth";
import { showEventModal, EventModalPayload } from "../modals/EventModal";

export const GOOGLE_CALENDAR_VIEW_TYPE = "google-calendar-view";

export interface PluginContext {
  settings: PluginSettings;
  tokenState: TokenState;
  saveTokenState(): Promise<void>;
  getLoadedCalendars(): GoogleCalendarInfo[];
  loadCalendars(): Promise<GoogleCalendarInfo[]>;
}

export class CalendarView extends ItemView {
  private state: CalendarState;
  private toolbarContainerEl: HTMLElement | null = null;
  private bodyContainerEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isCompact = false;

  private renderedWeekView: RenderedWeekView | null = null;
  private renderedDayView: RenderedDayView | null = null;

  private eventStatus: SidebarStatus = "loading";
  private eventErrorMessage: string | null = null;

  private pluginContext: PluginContext | null = null;
  private apiClient: CalendarApiClient | null = null;
  private syncManager: SyncManager | null = null;
  private eventCache: EventCache;
  private intervalId: number | null = null;
  private pendingSync: boolean = false;
  private loadedCalendars: GoogleCalendarInfo[] = [];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.state = createCalendarState();
    this.eventCache = getEventCache();
  }

  setPluginContext(context: PluginContext): void {
    this.pluginContext = context;
    this.loadedCalendars = context.getLoadedCalendars();
    this.initializeApiClient();
    this.initializeSyncManager();
    this.updateAuthStatus();
  }

  private async ensureCalendarsLoaded(): Promise<boolean> {
    if (this.loadedCalendars.length > 0) {
      return true;
    }

    if (!this.pluginContext) {
      return false;
    }

    this.loadedCalendars = await this.pluginContext.loadCalendars();
    return this.loadedCalendars.length > 0;
  }

  private initializeApiClient(): void {
    if (!this.pluginContext) return;

    const { tokenState, settings } = this.pluginContext;
    const tokenAccessor = {
      accessToken: tokenState.accessToken,
      refreshToken: tokenState.refreshToken,
    };

    this.apiClient = new CalendarApiClient(
      tokenAccessor,
      settings.clientId,
      refreshAccessToken,
      (result) => {
        if (this.pluginContext) {
          this.pluginContext.tokenState = {
            ...this.pluginContext.tokenState,
            accessToken: result.access_token,
            expiresAt: Date.now() + result.expires_in * 1000,
            tokenType: result.token_type,
          };
          this.pluginContext.saveTokenState();
        }
      }
    );
  }

  private initializeSyncManager(): void {
    if (!this.pluginContext || !this.apiClient) return;

    const { settings, tokenState } = this.pluginContext;

    if (this.syncManager) {
      resetSyncManager();
    }

    this.syncManager = createSyncManager(this.apiClient, this.eventCache, settings, tokenState);
    this.syncManager.setCallbacks({
      onAuthFailed: () => this.handleAuthFailure(),
      onSyncComplete: (events, authStatus) => this.handleSyncComplete(events, authStatus),
      onSyncError: (message) => this.handleSyncError(message),
    });
  }

  private updateAuthStatus(): void {
    if (!this.pluginContext) return;
    const { tokenState } = this.pluginContext;
    let authStatus: AuthStatus = "disconnected";
    if (tokenState.accessToken !== "") {
      authStatus = "connected";
    }
    this.state = setAuthStatus(this.state, authStatus);
  }

  private handleAuthFailure(): void {
    this.state = setAuthStatus(this.state, "needs-auth");
    this.state = setLoading(this.state, false);
    this.state = setError(this.state, "Authentication failed. Please re-authenticate.");
    this.updateViewStatus("needs-auth", "Authentication failed. Please re-authenticate.");
  }

  private handleSyncComplete(events: CalendarEvent[], authStatus: AuthStatus): void {
    this.state = setAuthStatus(this.state, authStatus);
    this.state = setLoading(this.state, false);

    if (authStatus === "needs-auth") {
      this.state = setError(this.state, "Please re-authenticate to continue.");
      this.updateViewStatus("needs-auth", "Please re-authenticate.");
      return;
    }

    this.state = setError(this.state, null);
    this.updateViewStatus(events.length === 0 ? "empty" : "ok", null);
    this.updateEvents(events);
  }

  private handleSyncError(message: string): void {
    this.state = setLoading(this.state, false);
    this.state = setError(this.state, message);
    this.updateViewStatus("error", message);
  }

  private updateViewStatus(status: SidebarStatus, errorMessage: string | null): void {
    this.eventStatus = status;
    this.eventErrorMessage = errorMessage;
    if (this.state.surface === "sidebar") {
      this.renderBody();
    }
  }

  getViewType(): string {
    return GOOGLE_CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Google Calendar";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.toolbarContainerEl = this.contentEl.createDiv("ogc-toolbar-container");
    this.bodyContainerEl = this.contentEl.createDiv("ogc-body-container");
    this.updateSurfaceFromLeaf();
    this.renderToolbar();
    this.renderBody();
    this.setupResizeObserver();
  }

  async onClose(): Promise<void> {
    this.resizeObserver?.disconnect();
    this.renderedWeekView?.destroy();
    this.renderedDayView?.destroy();
    this.stopIntervalSync();
    if (this.syncManager) {
      this.syncManager.stopInterval();
    }
  }

  private updateSurfaceFromLeaf(): void {
    const leaf = this.leaf;
    const container = leaf.containerEl;
    const width = container.clientWidth;
    const isSidebar = width > 0 && width < 600;
    const surface: CalendarSurface = isSidebar ? "sidebar" : "full";
    this.state = setSurface(this.state, surface);
  }

  private setupResizeObserver(): void {
    const container = this.leaf.containerEl;
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const wasCompact = this.isCompact;
        this.isCompact = width < 600;
        if (wasCompact !== this.isCompact) {
          this.updateSurfaceFromLeaf();
          this.renderToolbar();
          this.renderBody();
        }
      }
    });
    this.resizeObserver.observe(container);
  }

  private renderToolbar(): void {
    const toolbar = this.toolbarContainerEl;
    if (!toolbar) return;

    const surface = this.state.surface;
    const view = this.state.calendarView;
    const anchorDate = this.state.anchorDate;
    const isCompact = this.isCompact;

    renderToolbar(toolbar, {
      surface,
      view,
      anchorDate,
      isCompact,
      onPrev: () => this.navigatePrev(),
      onNext: () => this.navigateNext(),
      onToday: () => this.navigateToday(),
      onViewChange: (v: CalendarViewMode) => this.changeView(v),
      onExpand: () => this.expandToFull(),
      onSync: () => this.sync(),
    });
  }

  private renderBody(): void {
    const container = this.bodyContainerEl;
    if (!container) return;
    container.empty();

    this.renderedWeekView?.destroy();
    this.renderedWeekView = null;
    this.renderedDayView?.destroy();
    this.renderedDayView = null;

    const surface = this.state.surface;
    const view = this.state.calendarView;
    const anchorDate = this.state.anchorDate;

    const shell = container.createDiv("ogc-shell");

    if (surface === "sidebar") {
      this.renderSidebarSurface(shell, view, anchorDate);
    } else {
      this.renderFullSurface(shell, view, anchorDate);
    }
  }

  private getVisibleRange(): { start: Date; end: Date } {
    const { anchorDate, calendarView, weekStartsOn, showWeekends } = this.state;
    switch (calendarView) {
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

  private renderSidebarSurface(shell: HTMLElement, view: CalendarViewMode, anchorDate: Date): void {
    const status = this.resolveSidebarStatus();
    const range = this.getVisibleRange();
    const calendarIds = this.pluginContext?.settings.selectedCalendarIds.length
      ? this.pluginContext.settings.selectedCalendarIds
      : ["primary"];
    const cachedEvents = this.eventCache.get(range, calendarIds) || [];

    renderSidebar(shell, {
      title: "Google Calendar",
      status,
      errorMessage: this.eventErrorMessage,
      anchorDate,
      weekStartsOn: this.state.weekStartsOn,
      selectedDate: this.state.selectedDate,
      events: cachedEvents,
      callbacks: {
        onDateClick: (date: Date) => {
          this.state = setSelectedDate(this.state, date);
          this.state = setAnchorDate(this.state, date);
          this.renderBody();
          this.renderToolbar();
          this.triggerSync();
        },
        onEventClick: (event: CalendarEvent) => {
          this.onEventClickHandler(event);
        },
        onSync: () => this.sync(),
        onExpand: () => this.expandToFull(),
      },
    });
  }

  private renderFullSurface(shell: HTMLElement, view: CalendarViewMode, anchorDate: Date): void {
    const range = this.getVisibleRange();
    const calendarIds = this.pluginContext?.settings.selectedCalendarIds.length
      ? this.pluginContext.settings.selectedCalendarIds
      : ["primary"];
    const cachedEvents = this.eventCache.get(range, calendarIds) || [];

    const options = {
      anchorDate,
      weekStartsOn: this.state.weekStartsOn,
      showWeekends: this.state.showWeekends,
      surface: "full" as CalendarSurface,
    };

    switch (view) {
      case "month":
        renderMonthView(shell, {
          ...options,
          events: cachedEvents,
          isLoading: this.state.loading,
          error: this.state.error,
          callbacks: {
            onDateClick: (date: Date) => {
              this.state = setSelectedDate(this.state, date);
              this.renderBody();
            },
            onEventClick: (event: CalendarEvent) => {
              this.onEventClickHandler(event);
            },
            onCreateEvent: (date: Date) => {
              this.onDateClickCreate(date);
            },
          },
        });
        break;

      case "agenda":
        renderAgendaView(shell, {
          anchorDate,
          events: cachedEvents,
          surface: "full",
          isLoading: this.state.loading,
          error: this.state.error,
          callbacks: {
            onDateClick: (date: Date) => {
              this.state = setSelectedDate(this.state, date);
              this.renderBody();
            },
            onEventClick: (event: CalendarEvent) => {
              this.onEventClickHandler(event);
            },
            onCreateEvent: (date: Date) => {
              this.onDateClickCreate(date);
            },
          },
        });
        break;

      case "week": {
        const weekShell = shell.createDiv("ogc-week-view-container");
        this.renderedWeekView = renderWeekView(weekShell, {
          ...options,
          events: cachedEvents,
          hourHeight: 60,
          dayStartHour: 0,
          dayEndHour: 24,
          onEventClick: (event: CalendarEvent) => {
            this.onEventClickHandler(event);
          },
          onDateClick: (date: Date) => {
            this.onDateClickCreate(date);
          },
        });
        break;
      }

      case "day": {
        const dayShell = shell.createDiv("ogc-day-view-container");
        this.renderedDayView = renderDayView(dayShell, {
          ...options,
          events: cachedEvents,
          hourHeight: 60,
          dayStartHour: 0,
          dayEndHour: 24,
          onEventClick: (event: CalendarEvent) => {
            this.onEventClickHandler(event);
          },
          onDateClick: (date: Date) => {
            this.onDateClickCreate(date);
          },
        });
        break;
      }

      default:
        shell.setText(`Unsupported view: ${view}`);
    }
  }

  private resolveSidebarStatus(): SidebarStatus {
    if (this.state.authStatus === "disconnected") return "disconnected";
    if (this.state.authStatus === "needs-auth") return "needs-auth";
    if (this.state.loading) return "loading";
    if (this.state.error) return "error";
    return "ok";
  }

  private async onEventClickHandler(event: CalendarEvent): Promise<void> {
    if (!this.apiClient) {
      new Notice("Plugin not initialized", 3000);
      return;
    }
    if (!(await this.ensureCalendarsLoaded())) {
      new Notice("No calendars loaded. Please wait or sync.", 3000);
      return;
    }
    const defaultCalendarId = this.getPreferredCalendarId();
    const result = await showEventModal(this.app, {
      calendars: this.loadedCalendars,
      existingEvent: event,
      defaultCalendarId,
    });
    await this.handleModalResult(result, event.calendarId);
  }

  private async onDateClickCreate(date: Date): Promise<void> {
    if (!this.apiClient) {
      new Notice("Plugin not initialized", 3000);
      return;
    }
    if (!(await this.ensureCalendarsLoaded())) {
      new Notice("No calendars loaded. Please wait or sync.", 3000);
      return;
    }
    const defaultCalendarId = this.getPreferredCalendarId();
    const startOfDayDate = startOfDay(date);
    const initialEnd = new Date(startOfDayDate);
    initialEnd.setHours(initialEnd.getHours() + 1);
    const result = await showEventModal(this.app, {
      calendars: this.loadedCalendars,
      defaultCalendarId,
      initialStart: startOfDayDate,
      initialEnd,
    });
    await this.handleModalResult(result, defaultCalendarId);
  }

  private getPreferredCalendarId(): string {
    const defaultCalendarId = this.pluginContext?.settings.defaultCalendarId;
    if (defaultCalendarId) {
      return defaultCalendarId;
    }

    const selectedCalendarId = this.pluginContext?.settings.selectedCalendarIds[0];
    if (selectedCalendarId) {
      return selectedCalendarId;
    }

    const primaryCalendarId = this.loadedCalendars.find((calendar) => calendar.primary)?.id;
    if (primaryCalendarId) {
      return primaryCalendarId;
    }

    return this.loadedCalendars[0]?.id ?? "primary";
  }

  private async handleModalResult(result: { action: string; event?: EventModalPayload }, calendarId: string): Promise<void> {
    if (result.action === "cancel") {
      return;
    }
    if (!this.apiClient) {
      new Notice("API client not available", 3000);
      return;
    }
    try {
      if (result.action === "save" && result.event) {
        const payload = result.event;
        if (payload.existingEvent) {
          await this.apiClient.patchEvent({
            eventId: payload.existingEvent.id,
            calendarId: payload.calendarId,
            summary: payload.title,
            description: payload.description,
            location: payload.location,
            start: payload.start,
            end: payload.end,
            allDay: payload.allDay,
          });
          new Notice("Event updated", 2000);
        } else {
          await this.apiClient.insertEvent({
            calendarId: payload.calendarId,
            summary: payload.title,
            description: payload.description,
            location: payload.location,
            start: payload.start,
            end: payload.end,
            allDay: payload.allDay,
          });
          new Notice("Event created", 2000);
        }
      } else if (result.action === "delete" && result.event) {
        const eventToDelete = result.event as unknown as CalendarEvent;
        const confirmed = await this.showDeleteConfirmation(eventToDelete.title || "this event");
        if (!confirmed) {
          return;
        }
        await this.apiClient.deleteEvent(eventToDelete.id, eventToDelete.calendarId);
        new Notice("Event deleted", 2000);
      }
      this.clearCacheAndRefresh(calendarId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed: ${message}`, 4000);
    }
  }

  private showDeleteConfirmation(eventTitle: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new (require("obsidian").Modal)(this.app);
      modal.titleEl.textContent = "Delete Event";
      const content = modal.contentEl.createDiv();
      content.createEl("p", { text: `Are you sure you want to delete "${eventTitle}"?` });
      const buttonGroup = content.createDiv("ogc-confirm-buttons");
      const deleteBtn = buttonGroup.createEl("button", {
        text: "Delete",
        cls: "ogc-btn ogc-btn--danger",
      });
      const cancelBtn = buttonGroup.createEl("button", {
        text: "Cancel",
        cls: "ogc-btn ogc-btn--secondary",
      });
      deleteBtn.onclick = () => {
        modal.close();
        resolve(true);
      };
      cancelBtn.onclick = () => {
        modal.close();
        resolve(false);
      };
      modal.open();
    });
  }

  private clearCacheAndRefresh(affectedCalendarId: string): void {
    if (this.syncManager) {
      this.syncManager.invalidateCacheForCalendar(affectedCalendarId);
    }
    this.eventCache.invalidateRange(this.getVisibleRange(), this.pluginContext?.settings.selectedCalendarIds ?? ["primary"]);
    this.triggerSync();
  }

  private navigatePrev(): void {
    const { calendarView, anchorDate } = this.state;
    let newDate: Date;
    switch (calendarView) {
      case "month":
        newDate = addMonths(anchorDate, -1);
        break;
      case "week":
        newDate = addWeeks(anchorDate, -1);
        break;
      case "day":
        newDate = addDays(anchorDate, -1);
        break;
      case "agenda":
        newDate = addDays(anchorDate, -30);
        break;
      default:
        newDate = anchorDate;
    }
    this.state = setAnchorDate(this.state, newDate);
    this.renderBody();
    this.renderToolbar();
    this.triggerSync();
  }

  private navigateNext(): void {
    const { calendarView, anchorDate } = this.state;
    let newDate: Date;
    switch (calendarView) {
      case "month":
        newDate = addMonths(anchorDate, 1);
        break;
      case "week":
        newDate = addWeeks(anchorDate, 1);
        break;
      case "day":
        newDate = addDays(anchorDate, 1);
        break;
      case "agenda":
        newDate = addDays(anchorDate, 30);
        break;
      default:
        newDate = anchorDate;
    }
    this.state = setAnchorDate(this.state, newDate);
    this.renderBody();
    this.renderToolbar();
    this.triggerSync();
  }

  private navigateToday(): void {
    this.state = setAnchorDate(this.state, new Date());
    this.renderBody();
    this.renderToolbar();
    this.triggerSync();
  }

  private changeView(view: CalendarViewMode): void {
    this.state = setCalendarView(this.state, view);
    this.renderBody();
    this.renderToolbar();
    this.triggerSync();
  }

  private expandToFull(): void {
    this.state = setSurface(this.state, "full");
    this.app.workspace.getLeaf(false).setViewState({
      type: GOOGLE_CALENDAR_VIEW_TYPE,
      state: this.serializeState(),
    });
  }

  private sync(): void {
    if (!this.pluginContext) {
      new Notice("Plugin not initialized", 3000);
      return;
    }

    if (this.pluginContext.tokenState.accessToken === "") {
      this.state = setAuthStatus(this.state, "disconnected");
      this.updateViewStatus("disconnected", null);
      new Notice("Not connected to Google Calendar", 3000);
      return;
    }

    this.state = setLoading(this.state, true);
    this.pendingSync = true;

    const { anchorDate, calendarView, weekStartsOn, showWeekends } = this.state;

    if (!this.syncManager) {
      this.initializeSyncManager();
    }

    if (!this.syncManager) {
      this.state = setLoading(this.state, false);
      this.updateViewStatus("error", "Sync manager not available");
      return;
    }

    this.syncManager.syncVisibleRange(anchorDate, calendarView, weekStartsOn, showWeekends)
      .then((result) => {
        this.pendingSync = false;
        this.handleSyncComplete(result.events, result.authStatus);

        if (result.errorMessage && result.authStatus !== "needs-auth") {
          new Notice(result.errorMessage, 3000);
        }
      })
      .catch((err: Error) => {
        this.pendingSync = false;
        this.handleSyncError(err.message || "Sync failed");
        new Notice("Sync failed: " + (err.message || "Unknown error"), 3000);
      });
  }

  private triggerSync(): void {
    if (this.pendingSync) return;
    if (!this.pluginContext) return;
    if (this.pluginContext.tokenState.accessToken === "") return;

    this.pendingSync = true;
    const { anchorDate, calendarView, weekStartsOn, showWeekends } = this.state;

    if (this.syncManager) {
      this.syncManager.syncVisibleRange(anchorDate, calendarView, weekStartsOn, showWeekends)
        .then((result) => {
          this.pendingSync = false;
          this.handleSyncComplete(result.events, result.authStatus);
        })
        .catch((err: Error) => {
          this.pendingSync = false;
          this.handleSyncError(err.message || "Sync failed");
        });
    }
  }

  private startIntervalSync(): void {
    if (!this.pluginContext) return;
    if (this.pluginContext.tokenState.accessToken === "") return;
    if (this.intervalId !== null) return;

    const intervalMs = (this.pluginContext.settings.refreshIntervalMinutes || 30) * 60 * 1000;
    if (intervalMs <= 0) return;

    this.intervalId = window.setInterval(() => {
      if (!this.pendingSync) {
        this.triggerSync();
      }
    }, intervalMs);
  }

  private stopIntervalSync(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private serializeState(): Record<string, unknown> {
    return {
      calendarView: this.state.calendarView,
      anchorDate: this.state.anchorDate.toISOString(),
    };
  }

  setState(state: Record<string, unknown>): void {
    if (state["calendarView"]) {
      this.state = setCalendarView(this.state, state["calendarView"] as CalendarViewMode);
    }
    if (state["anchorDate"]) {
      const date = new Date(state["anchorDate"] as string);
      if (!isNaN(date.getTime())) {
        this.state = setAnchorDate(this.state, date);
      }
    }
    this.renderBody();
    this.renderToolbar();
    this.triggerSync();
  }

  getState(): Record<string, unknown> {
    return this.serializeState();
  }

  setEventStatus(status: SidebarStatus, errorMessage?: string | null): void {
    this.eventStatus = status;
    this.eventErrorMessage = errorMessage ?? null;
    this.state = setLoading(this.state, status === "loading");
    this.state = setError(this.state, status === "error" ? (errorMessage ?? "Unknown error") : null);
    if (this.state.surface === "sidebar") {
      this.renderBody();
    }
  }

  setSelectedDate(date: Date | null): void {
    this.state = setSelectedDate(this.state, date);
    if (this.state.surface === "sidebar") {
      this.renderBody();
    }
  }

  updateEvents(events: CalendarEvent[]): void {
    const range = this.getVisibleRange();
    const calendarIds = this.pluginContext?.settings.selectedCalendarIds.length
      ? this.pluginContext.settings.selectedCalendarIds
      : ["primary"];
    this.eventCache.set(range, calendarIds, events);

    if (this.renderedWeekView) {
      this.renderedWeekView.updateEvents(events);
    }
    if (this.renderedDayView) {
      this.renderedDayView.updateEvents(events);
    }
    if (this.state.surface === "sidebar") {
      this.renderBody();
    }
  }

  updateSettings(settings: PluginSettings): void {
    if (this.pluginContext) {
      this.pluginContext.settings = settings;
    }
    this.state.weekStartsOn = settings.weekStartsOn;
    this.state.showWeekends = settings.showWeekends;
    if (this.syncManager) {
      this.syncManager.updateSettings(settings);
    }
    this.stopIntervalSync();
    if (settings.refreshIntervalMinutes > 0 && this.pluginContext?.tokenState.accessToken) {
      this.startIntervalSync();
    }
  }

  updateTokenState(tokenState: TokenState): void {
    if (this.pluginContext) {
      this.pluginContext.tokenState = tokenState;
    }
    this.updateAuthStatus();
    if (this.apiClient) {
      this.apiClient.updateTokenAccessor({
        accessToken: tokenState.accessToken,
        refreshToken: tokenState.refreshToken,
      });
    }
    if (this.syncManager) {
      this.syncManager.updateTokenState(tokenState);
    }
  }

  updateCalendars(calendars: GoogleCalendarInfo[]): void {
    this.loadedCalendars = calendars;
  }

  triggerCalendarSelectionChange(): void {
    if (this.syncManager) {
      this.syncManager.clearCache();
    }
    this.eventCache.invalidate();
    this.triggerSync();
  }

  onComponentClosed(): void {
    this.stopIntervalSync();
  }
}
