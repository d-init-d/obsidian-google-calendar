import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { CalendarEvent, CalendarViewMode, CalendarSurface } from "../types";
import { createCalendarState, setSurface, setCalendarView, setAnchorDate, setSelectedDate, setLoading, setError } from "../state/CalendarState";
import type { CalendarState } from "../types";
import { renderToolbar } from "./renderToolbar";
import { renderSidebar, type SidebarStatus } from "./renderSidebar";
import { renderMonthView } from "./renderMonthView";
import { renderAgendaView } from "./renderAgendaView";
import { renderWeekView, type RenderedWeekView } from "./renderWeekView";
import { renderDayView, type RenderedDayView } from "./renderDayView";
import { addDays, addWeeks, addMonths, startOfDay } from "../utils/dateRange";

export const GOOGLE_CALENDAR_VIEW_TYPE = "google-calendar-view";

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

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.state = createCalendarState();
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

  private renderSidebarSurface(shell: HTMLElement, view: CalendarViewMode, anchorDate: Date): void {
    const status = this.resolveSidebarStatus();

    renderSidebar(shell, {
      title: "Google Calendar",
      status,
      errorMessage: this.eventErrorMessage,
      anchorDate,
      weekStartsOn: this.state.weekStartsOn,
      selectedDate: this.state.selectedDate,
      events: this.state.visibleEventRange ? this.getMockEvents() : [],
      callbacks: {
        onDateClick: (date: Date) => {
          this.state = setSelectedDate(this.state, date);
          this.state = setAnchorDate(this.state, date);
          this.renderBody();
          this.renderToolbar();
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
    const events = this.state.visibleEventRange ? this.getMockEvents() : [];
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
          events,
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
          },
        });
        break;

      case "agenda":
        renderAgendaView(shell, {
          anchorDate,
          events,
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
          },
        });
        break;

      case "week": {
        const weekShell = shell.createDiv("ogc-week-view-container");
        this.renderedWeekView = renderWeekView(weekShell, {
          ...options,
          events,
          hourHeight: 60,
          dayStartHour: 0,
          dayEndHour: 24,
          onEventClick: (event: CalendarEvent) => {
            this.onEventClickHandler(event);
          },
        });
        break;
      }

      case "day": {
        const dayShell = shell.createDiv("ogc-day-view-container");
        this.renderedDayView = renderDayView(dayShell, {
          ...options,
          events,
          hourHeight: 60,
          dayStartHour: 0,
          dayEndHour: 24,
          onEventClick: (event: CalendarEvent) => {
            this.onEventClickHandler(event);
          },
        });
        break;
      }

      default:
        shell.setText(`Unsupported view: ${view}`);
    }
  }

  private resolveSidebarStatus(): SidebarStatus {
    if (this.state.loading) return "loading";
    if (this.state.error) return "error";
    return "ok";
  }

  private onEventClickHandler(event: CalendarEvent): void {
    new Notice(`Event clicked: ${event.title}`, 2000);
  }

  private getMockEvents(): CalendarEvent[] {
    return [];
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
  }

  private navigateToday(): void {
    this.state = setAnchorDate(this.state, new Date());
    this.renderBody();
    this.renderToolbar();
  }

  private changeView(view: CalendarViewMode): void {
    this.state = setCalendarView(this.state, view);
    this.renderBody();
    this.renderToolbar();
  }

  private expandToFull(): void {
    this.state = setSurface(this.state, "full");
    this.app.workspace.getLeaf(false).setViewState({
      type: GOOGLE_CALENDAR_VIEW_TYPE,
      state: this.serializeState(),
    });
  }

  private sync(): void {
    new Notice("Google Calendar sync", 4000);
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
}
