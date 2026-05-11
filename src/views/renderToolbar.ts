import type { CalendarSurface, CalendarViewMode } from "../types";
import { MONTH_LABELS } from "../types";

interface ToolbarOptions {
  surface: CalendarSurface;
  view: CalendarViewMode;
  anchorDate: Date;
  isCompact: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (v: CalendarViewMode) => void;
  onExpand: () => void;
  onSync: () => void;
}

function getTitle(view: CalendarViewMode, anchorDate: Date): string {
  const month = MONTH_LABELS[anchorDate.getMonth()];
  const year = anchorDate.getFullYear();
  switch (view) {
    case "month":
      return `${month} ${year}`;
    case "week":
      return `${month} ${year}`;
    case "day":
      return anchorDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    case "agenda":
      return `${month} ${year}`;
    default:
      return `${month} ${year}`;
  }
}

function buildToolbarHtml(options: ToolbarOptions): string {
  const { surface, view, anchorDate, isCompact, onPrev, onNext, onToday, onViewChange, onExpand, onSync } = options;
  const title = getTitle(view, anchorDate);

  const viewOptions: CalendarViewMode[] = ["month", "week", "day", "agenda"];

  const viewButtons = viewOptions
    .map((v) => {
      const active = v === view ? "active" : "";
      return `<button class="ogc-btn ogc-btn--sm ogc-view-btn ${active}" data-view="${v}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`;
    })
    .join("");

  let expandBtn = "";
  if (surface === "sidebar") {
    expandBtn = `<button class="ogc-btn ogc-btn--icon ogc-expand-btn" title="Open in full tab">⤢</button>`;
  }

  return `
    <div class="ogc-toolbar">
      <div class="ogc-toolbar__left">
        <button class="ogc-btn ogc-nav-btn" data-action="prev" title="Previous">‹</button>
        <button class="ogc-btn ogc-nav-btn" data-action="next" title="Next">›</button>
        <button class="ogc-btn ogc-today-btn" data-action="today">Today</button>
      </div>
      <div class="ogc-toolbar__title">${title}</div>
      <div class="ogc-toolbar__right">
        <div class="ogc-view-switcher">${viewButtons}</div>
        ${expandBtn}
        <button class="ogc-btn ogc-btn--icon ogc-sync-btn" data-action="sync" title="Sync">↻</button>
      </div>
    </div>
  `;
}

export function renderToolbar(container: HTMLElement, options: ToolbarOptions): void {
  container.empty();
  container.innerHTML = buildToolbarHtml(options);

  container.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
    const action = btn.dataset["action"];
    if (action === "prev") {
      btn.addEventListener("click", options.onPrev);
    } else if (action === "next") {
      btn.addEventListener("click", options.onNext);
    } else if (action === "today") {
      btn.addEventListener("click", options.onToday);
    } else if (action === "sync") {
      btn.addEventListener("click", options.onSync);
    }
  });

  container.querySelectorAll<HTMLButtonElement>(".ogc-view-btn").forEach((btn) => {
    const view = btn.dataset["view"] as CalendarViewMode;
    btn.addEventListener("click", () => options.onViewChange(view));
  });

  const expandBtn = container.querySelector<HTMLButtonElement>(".ogc-expand-btn");
  if (expandBtn) {
    expandBtn.addEventListener("click", options.onExpand);
  }
}