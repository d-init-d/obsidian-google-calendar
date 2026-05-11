import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { CalendarViewMode, CalendarSurface } from "../types";
import { createCalendarState, setSurface, setCalendarView, setAnchorDate } from "../state/CalendarState";
import type { CalendarState } from "../types";
import { renderToolbar } from "./renderToolbar";
import { addDays, addWeeks, addMonths } from "../utils/dateRange";

export const GOOGLE_CALENDAR_VIEW_TYPE = "google-calendar-view";

export class CalendarView extends ItemView {
  private state: CalendarState;
  private toolbarContainerEl: HTMLElement | null = null;
  private bodyContainerEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isCompact = false;

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

    const surface = this.state.surface;
    const view = this.state.calendarView;
    const anchorDate = this.state.anchorDate;

    const shell = container.createDiv("ogc-shell");

    shell.createDiv("ogc-shell__placeholder", (el) => {
      el.setText(surface === "sidebar"
        ? "Google Calendar"
        : `Google Calendar — ${view} — ${anchorDate.toDateString()}`);
    });
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
    this.app.workspace.getLeaf(false).setViewState({
      type: GOOGLE_CALENDAR_VIEW_TYPE,
      state: this.serializeState(),
    });
  }

  private sync(): void {
    new Notice("Google Calendar sync coming soon", 4000);
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
}
