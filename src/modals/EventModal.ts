import { App, Modal, Setting } from "obsidian";
import { GoogleCalendarInfo, CalendarEvent } from "../types";
import { createElement, addClass, removeClass } from "../utils/dom";
import { formatDate, formatTime } from "../utils/dateFormat";
import { toISODateString } from "../utils/dateFormat";

export interface EventModalResult {
  action: "save" | "delete" | "cancel";
  event?: EventModalPayload;
}

export interface EventModalPayload {
  title: string;
  calendarId: string;
  allDay: boolean;
  start: Date;
  end: Date;
  location: string;
  description: string;
  existingEvent?: { id: string; calendarId: string } | null;
}

export interface EventModalOptions {
  calendars: GoogleCalendarInfo[];
  existingEvent?: CalendarEvent | null;
  defaultCalendarId?: string | null;
  initialStart?: Date | null;
  initialEnd?: Date | null;
}

interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

export class EventModal extends Modal {
  private calendars: GoogleCalendarInfo[];
  private existingEvent: CalendarEvent | null;
  private defaultCalendarId: string | null;
  private initialStart: Date | null;
  private initialEnd: Date | null;

  private result: EventModalResult | null = null;
  private resolveResult: ((result: EventModalResult) => void) | null = null;

  private titleInput!: HTMLInputElement;
  private calendarSelect!: HTMLSelectElement;
  private allDayToggle!: HTMLInputElement;
  private startDateInput!: HTMLInputElement;
  private startTimeInput!: HTMLInputElement;
  private endDateInput!: HTMLInputElement;
  private endTimeInput!: HTMLInputElement;
  private locationInput!: HTMLInputElement;
  private descriptionInput!: HTMLTextAreaElement;
  private errorContainer!: HTMLElement;
  private warningContainer!: HTMLElement;
  private deleteButton: HTMLElement | null = null;

  private allDayChecked = false;

  constructor(app: App, options: EventModalOptions) {
    super(app);
    this.calendars = options.calendars;
    this.existingEvent = options.existingEvent ?? null;
    this.defaultCalendarId = options.defaultCalendarId ?? null;
    this.initialStart = options.initialStart ?? null;
    this.initialEnd = options.initialEnd ?? null;
  }

  async onOpen(): Promise<void> {
    this.titleEl.addClass("ogc-event-modal");
    this.titleEl.textContent = this.existingEvent ? "Edit Event" : "New Event";

    await this.renderContent();
    this.updateAllDayVisibility();
  }

  onClose(): void {
    if (!this.result) {
      this.result = { action: "cancel" };
    }
  }

  private async renderContent(): Promise<void> {
    const contentEl = this.contentEl;
    contentEl.addClass("ogc-modal-content");

    this.errorContainer = createElement("div", { class: "ogc-modal-errors" });
    this.errorContainer.setAttribute("role", "alert");
    addClass(this.errorContainer, "ogc-hidden");
    contentEl.appendChild(this.errorContainer);

    this.warningContainer = createElement("div", { class: "ogc-modal-warnings" });
    contentEl.appendChild(this.warningContainer);

    const formEl = createElement("form", { class: "ogc-event-form" });
    formEl.setAttribute("novalidate", "");

    this.buildTitleField(formEl);
    this.buildCalendarField(formEl);
    this.buildAllDayField(formEl);
    this.buildDateTimeFields(formEl);
    this.buildLocationField(formEl);
    this.buildDescriptionField(formEl);

    contentEl.appendChild(formEl);

    this.buildButtonRow(contentEl);

    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSave();
    });
  }

  private buildTitleField(parent: HTMLElement): void {
    const container = createElement("div", { class: "ogc-field ogc-title-field" });
    const label = createElement("label", { for: "ogc-event-title", class: "ogc-field__label" });
    label.textContent = "Title";

    this.titleInput = createElement("input", {
      id: "ogc-event-title",
      type: "text",
      class: "ogc-field__input",
      placeholder: "Event title",
      value: this.existingEvent?.title ?? "",
      "aria-label": "Event title",
    }) as HTMLInputElement;

    container.appendChild(label);
    container.appendChild(this.titleInput);
    parent.appendChild(container);
  }

  private buildCalendarField(parent: HTMLElement): void {
    const container = createElement("div", { class: "ogc-field ogc-calendar-field" });
    const label = createElement("label", { for: "ogc-event-calendar", class: "ogc-field__label" });
    label.textContent = "Calendar";

    this.calendarSelect = createElement("select", {
      id: "ogc-event-calendar",
      class: "ogc-field__input ogc-select",
    }) as HTMLSelectElement;

    const placeholder = createElement("option", { value: "", disabled: true });
    placeholder.textContent = "Select a calendar";
    placeholder.selected = true;
    this.calendarSelect.appendChild(placeholder);

    for (const cal of this.calendars) {
      const option = createElement("option", { value: cal.id }) as HTMLOptionElement;
      option.textContent = cal.summary;
      if (cal.id === (this.existingEvent?.calendarId ?? this.defaultCalendarId)) {
        option.selected = true;
      }
      this.calendarSelect.appendChild(option);
    }

    container.appendChild(label);
    container.appendChild(this.calendarSelect);
    parent.appendChild(container);
  }

  private buildAllDayField(parent: HTMLElement): void {
    const container = createElement("div", { class: "ogc-field ogc-all-day-field" });
    const label = createElement("label", { class: "ogc-checkbox-label" });
    label.htmlFor = "ogc-event-all-day";

    this.allDayToggle = createElement("input", {
      id: "ogc-event-all-day",
      type: "checkbox",
      class: "ogc-checkbox",
      ariaLabel: "All-day event",
    }) as HTMLInputElement;

    if (this.existingEvent) {
      this.allDayToggle.checked = this.existingEvent.allDay;
    }

    this.allDayToggle.addEventListener("change", () => {
      this.allDayChecked = this.allDayToggle.checked;
      this.updateAllDayVisibility();
    });

    this.allDayChecked = this.allDayToggle.checked;

    const labelText = createElement("span");
    labelText.textContent = "All-day event";

    label.appendChild(this.allDayToggle);
    label.appendChild(labelText);
    container.appendChild(label);
    parent.appendChild(container);
  }

  private buildDateTimeFields(parent: HTMLElement): void {
    const startContainer = createElement("div", { class: "ogc-field ogc-datetime-field ogc-start-field" });
    const startLabel = createElement("label", { class: "ogc-field__label" });
    startLabel.textContent = "Start";
    startLabel.htmlFor = "ogc-event-start-date";

    const startDateRow = createElement("div", { class: "ogc-datetime-row" });
    this.startDateInput = createElement("input", {
      id: "ogc-event-start-date",
      type: "date",
      class: "ogc-field__input ogc-date-input",
      "aria-label": "Event start date",
    }) as HTMLInputElement;

    this.startTimeInput = createElement("input", {
      id: "ogc-event-start-time",
      type: "time",
      class: "ogc-field__input ogc-time-input",
      "aria-label": "Event start time",
    }) as HTMLInputElement;

    const startDefault = this.getDefaultStart();
    this.startDateInput.value = toISODateString(startDefault);
    this.startTimeInput.value = this.formatTimeForInput(startDefault);

    startDateRow.appendChild(this.startDateInput);
    startDateRow.appendChild(this.startTimeInput);
    startContainer.appendChild(startLabel);
    startContainer.appendChild(startDateRow);

    const endContainer = createElement("div", { class: "ogc-field ogc-datetime-field ogc-end-field" });
    const endLabel = createElement("label", { class: "ogc-field__label" });
    endLabel.textContent = "End";
    endLabel.htmlFor = "ogc-event-end-date";

    const endDateRow = createElement("div", { class: "ogc-datetime-row" });
    this.endDateInput = createElement("input", {
      id: "ogc-event-end-date",
      type: "date",
      class: "ogc-field__input ogc-date-input",
      ariaLabel: "Event end date",
    }) as HTMLInputElement;

    this.endTimeInput = createElement("input", {
      id: "ogc-event-end-time",
      type: "time",
      class: "ogc-field__input ogc-time-input",
      ariaLabel: "Event end time",
    }) as HTMLInputElement;

    const endDefault = this.getDefaultEnd();
    this.endDateInput.value = toISODateString(endDefault);
    this.endTimeInput.value = this.formatTimeForInput(endDefault);

    endDateRow.appendChild(this.endDateInput);
    endDateRow.appendChild(this.endTimeInput);
    endContainer.appendChild(endLabel);
    endContainer.appendChild(endDateRow);

    parent.appendChild(startContainer);
    parent.appendChild(endContainer);
  }

  private buildLocationField(parent: HTMLElement): void {
    const container = createElement("div", { class: "ogc-field ogc-location-field" });
    const label = createElement("label", { for: "ogc-event-location", class: "ogc-field__label" });
    label.textContent = "Location";

    this.locationInput = createElement("input", {
      id: "ogc-event-location",
      type: "text",
      class: "ogc-field__input",
      placeholder: "Add location",
      value: this.existingEvent?.location ?? "",
      ariaLabel: "Event location",
    }) as HTMLInputElement;

    container.appendChild(label);
    container.appendChild(this.locationInput);
    parent.appendChild(container);
  }

  private buildDescriptionField(parent: HTMLElement): void {
    const container = createElement("div", { class: "ogc-field ogc-description-field" });
    const label = createElement("label", { for: "ogc-event-description", class: "ogc-field__label" });
    label.textContent = "Description";

    this.descriptionInput = createElement("textarea", {
      id: "ogc-event-description",
      class: "ogc-field__input ogc-textarea",
      placeholder: "Add description",
      rows: "3",
      ariaLabel: "Event description",
    }) as HTMLTextAreaElement;

    if (this.existingEvent?.description) {
      this.descriptionInput.value = this.existingEvent.description;
    }

    container.appendChild(label);
    container.appendChild(this.descriptionInput);
    parent.appendChild(container);
  }

  private buildButtonRow(parent: HTMLElement): void {
    const buttonRow = createElement("div", { class: "ogc-modal-button-row" });

    if (this.existingEvent) {
      this.deleteButton = createElement("button", {
        type: "button",
        class: "ogc-btn ogc-btn--danger",
      });
      this.deleteButton.textContent = "Delete";
      this.deleteButton.setAttribute("aria-label", "Delete event");
      this.deleteButton.addEventListener("click", () => this.handleDelete());
      buttonRow.appendChild(this.deleteButton);
    }

    const rightButtons = createElement("div", { class: "ogc-modal-button-right" });

    const cancelButton = createElement("button", {
      type: "button",
      class: "ogc-btn ogc-btn--secondary",
    });
    cancelButton.textContent = "Cancel";
    cancelButton.setAttribute("aria-label", "Cancel");
    cancelButton.addEventListener("click", () => this.handleCancel());

    const saveButton = createElement("button", {
      type: "submit",
      class: "ogc-btn ogc-btn--primary",
    });
    saveButton.textContent = "Save";
    saveButton.setAttribute("aria-label", "Save event");

    const form = this.contentEl.querySelector(".ogc-event-form") as HTMLFormElement;
    form.appendChild(saveButton);

    rightButtons.appendChild(cancelButton);
    rightButtons.appendChild(saveButton);
    buttonRow.appendChild(rightButtons);

    parent.appendChild(buttonRow);
  }

  private updateAllDayVisibility(): void {
    if (this.allDayChecked) {
      addClass(this.startTimeInput, "ogc-hidden");
      addClass(this.endTimeInput, "ogc-hidden");
    } else {
      removeClass(this.startTimeInput, "ogc-hidden");
      removeClass(this.endTimeInput, "ogc-hidden");
    }
  }

  private getDefaultStart(): Date {
    if (this.existingEvent) {
      return new Date(this.existingEvent.start);
    }
    if (this.initialStart) {
      return new Date(this.initialStart);
    }
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    return now;
  }

  private getDefaultEnd(): Date {
    if (this.existingEvent) {
      return new Date(this.existingEvent.end);
    }
    if (this.initialEnd) {
      return new Date(this.initialEnd);
    }
    const start = this.getDefaultStart();
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return end;
  }

  private formatTimeForInput(date: Date): string {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  private handleSave(): void {
    const validation = this.validate();

    if (!validation.valid) {
      this.displayErrors(validation.errors);
      return;
    }

    this.clearErrors();

    if (Object.keys(validation.warnings).length > 0) {
      this.displayWarnings(validation.warnings);
    }

    const payload = this.buildPayload();
    this.result = { action: "save", event: payload };
    this.close();
  }

  private handleDelete(): void {
    this.result = {
      action: "delete",
      event: this.existingEvent
        ? {
            title: this.existingEvent.title,
            calendarId: this.existingEvent.calendarId,
            allDay: this.existingEvent.allDay,
            start: new Date(this.existingEvent.start),
            end: new Date(this.existingEvent.end),
            location: this.existingEvent.location ?? "",
            description: this.existingEvent.description ?? "",
            existingEvent: { id: this.existingEvent.id, calendarId: this.existingEvent.calendarId },
          }
        : undefined,
    };
    this.close();
  }

  private handleCancel(): void {
    this.result = { action: "cancel" };
    this.close();
  }

  private validate(): ValidationResult {
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};

    if (!this.calendarSelect.value) {
      errors.calendar = "Please select a calendar";
    }

    const start = this.parseStartDateTime();
    const end = this.parseEndDateTime();

    if (start && end && end <= start) {
      errors.end = "End time must be after start time";
    }

    const titleValue = this.titleInput.value.trim();
    if (!titleValue) {
      warnings.title = "Event title is empty";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      warnings,
    };
  }

  private parseStartDateTime(): Date | null {
    const dateVal = this.startDateInput.value;
    if (!dateVal) return null;

    if (this.allDayChecked) {
      const [year, month, day] = dateVal.split("-").map(Number);
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }

    const timeVal = this.startTimeInput.value || "00:00";
    const [hours, minutes] = timeVal.split(":").map(Number);
    const [year, month, day] = dateVal.split("-").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  private parseEndDateTime(): Date | null {
    const dateVal = this.endDateInput.value;
    if (!dateVal) return null;

    if (this.allDayChecked) {
      const [year, month, day] = dateVal.split("-").map(Number);
      return new Date(year, month - 1, day, 23, 59, 59, 999);
    }

    const timeVal = this.endTimeInput.value || "23:59";
    const [hours, minutes] = timeVal.split(":").map(Number);
    const [year, month, day] = dateVal.split("-").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  private buildPayload(): EventModalPayload {
    const payload: EventModalPayload = {
      title: this.titleInput.value.trim(),
      calendarId: this.calendarSelect.value,
      allDay: this.allDayChecked,
      start: this.parseStartDateTime()!,
      end: this.parseEndDateTime()!,
      location: this.locationInput.value.trim(),
      description: this.descriptionInput.value.trim(),
    };
    if (this.existingEvent) {
      payload.existingEvent = { id: this.existingEvent.id, calendarId: this.existingEvent.calendarId };
    }
    return payload;
  }

  private displayErrors(errors: Record<string, string>): void {
    const messages = Object.values(errors);
    if (messages.length === 0) return;

    this.errorContainer.textContent = messages.join(". ");
    removeClass(this.errorContainer, "ogc-hidden");
    addClass(this.errorContainer, "ogc-visible");

    const firstErrorField = Object.keys(errors)[0];
    const fieldMap: Record<string, string> = {
      calendar: "#ogc-event-calendar",
      end: "#ogc-event-end-date",
      title: "#ogc-event-title",
    };
    const selector = fieldMap[firstErrorField];
    if (selector) {
      const el = this.contentEl.querySelector(selector) as HTMLElement;
      el?.focus();
    }
  }

  private displayWarnings(warnings: Record<string, string>): void {
    const messages = Object.values(warnings);
    if (messages.length === 0) return;

    this.warningContainer.textContent = `Warning: ${messages.join(". ")}`;
    removeClass(this.warningContainer, "ogc-hidden");
    addClass(this.warningContainer, "ogc-visible");
  }

  private clearErrors(): void {
    addClass(this.errorContainer, "ogc-hidden");
    removeClass(this.errorContainer, "ogc-visible");
    removeClass(this.warningContainer, "ogc-visible");
    addClass(this.warningContainer, "ogc-hidden");
  }

  async getResult(): Promise<EventModalResult> {
    return new Promise((resolve) => {
      this.resolveResult = resolve;
      this.open();
    });
  }
}

export async function showEventModal(
  app: App,
  options: EventModalOptions
): Promise<EventModalResult> {
  const modal = new EventModal(app, options);
  return modal.getResult();
}
