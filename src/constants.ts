import { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  clientId: "",
  selectedCalendarIds: [],
  defaultCalendarId: null,
  defaultView: "month",
  refreshIntervalMinutes: 30,
  weekStartsOn: 0,
  showWeekends: true,
};
