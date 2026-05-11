import { Plugin, PluginSettingTab, Setting, App, Notice } from "obsidian";
import { PluginSettings, TokenState, CalendarViewMode } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import { loadSettings, saveSettings, loadTokenState, saveTokenState, getDefaultTokenState } from "./settings";
import { createTokenStore } from "./google/tokenStore";
import { runOAuthFlow, revokeToken } from "./google/oauth";
import { CalendarView, GOOGLE_CALENDAR_VIEW_TYPE } from "./views/CalendarView";

export default class GoogleCalendarPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  tokenState: TokenState = getDefaultTokenState();
  tokenStore = createTokenStore(this);

  async onload() {
    await this.loadSettings();
    await this.loadTokenState();

    this.registerView(GOOGLE_CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf));

    this.addRibbonIcon("calendar", "Open Google Calendar", () => {
      this.app.workspace.getLeaf(false).setViewState({
        type: GOOGLE_CALENDAR_VIEW_TYPE,
        state: { calendarView: this.settings.defaultView, anchorDate: new Date().toISOString() },
      });
    });

    this.addCommand({
      id: "open-google-calendar-sidebar",
      name: "Open Google Calendar in sidebar",
      callback: () => {
        this.app.workspace.getLeaf("right").setViewState({
          type: GOOGLE_CALENDAR_VIEW_TYPE,
          state: { calendarView: this.settings.defaultView, anchorDate: new Date().toISOString() },
        });
      },
    });

    this.addCommand({
      id: "open-google-calendar-tab",
      name: "Open Google Calendar in tab",
      callback: () => {
        this.app.workspace.getLeaf(false).setViewState({
          type: GOOGLE_CALENDAR_VIEW_TYPE,
          state: { calendarView: this.settings.defaultView, anchorDate: new Date().toISOString() },
        });
      },
    });

    this.addCommand({
      id: "open-google-calendar-expand",
      name: "Expand Google Calendar to full tab",
      callback: () => {
        const leaf = this.app.workspace.getLeaf(false);
        leaf.setViewState({
          type: GOOGLE_CALENDAR_VIEW_TYPE,
          state: { calendarView: this.settings.defaultView, anchorDate: new Date().toISOString() },
        });
      },
    });

    this.addCommand({
      id: "sync-google-calendar",
      name: "Sync Google Calendar",
      callback: () => {
        new Notice("Sync triggered - implementation in later tasks");
      },
    });

    this.addSettingTab(new GoogleCalendarSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = await loadSettings(this);
  }

  async saveSettings() {
    await saveSettings(this, this.settings);
  }

  async loadTokenState() {
    this.tokenState = await loadTokenState(this);
  }

  async saveTokenState() {
    await saveTokenState(this, this.tokenState);
  }

  onunload() {}
}

class GoogleCalendarSettingTab extends PluginSettingTab {
  plugin: GoogleCalendarPlugin;

  constructor(app: App, plugin: GoogleCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Google Calendar" });

    this.buildOAuthSection(containerEl);
    this.buildCalendarSection(containerEl);
    this.buildSyncSection(containerEl);
  }

  private buildOAuthSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv();
    section.createEl("h3", { text: "Authentication" });

    new Setting(section)
      .setName("Client ID")
      .setDesc("Google OAuth client ID from Google Cloud Console")
      .addText((text) => {
        text.setValue(this.plugin.settings.clientId);
        text.setPlaceholder("your-client-id.apps.googleusercontent.com");
        text.onChange(async (value) => {
          this.plugin.settings.clientId = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    const isConnected = this.plugin.tokenState.accessToken !== "";
    const clientIdEmpty = this.plugin.settings.clientId.trim().length === 0;

    const connectBtnSetting = new Setting(section)
      .setName("Connect to Google");

    connectBtnSetting.addButton((btn) => {
      btn.setButtonText("Connect");
      btn.setDisabled(clientIdEmpty);
      btn.setTooltip(clientIdEmpty ? "Enter a Client ID to enable" : "Initiate OAuth flow");
      btn.onClick(async () => {
        await this.handleConnect();
      });
    });

    new Setting(section)
      .setName("Connection Status")
      .setDesc(isConnected ? "Connected to Google Calendar" : "Not connected");

    new Setting(section)
      .setName("Disconnect")
      .setDesc("Remove stored credentials")
      .addButton((btn) => {
        btn.setButtonText("Disconnect");
        btn.setTooltip("Clear OAuth tokens");
        btn.onClick(async () => {
          await this.handleDisconnect();
        });
      });
  }

  private buildCalendarSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv();
    section.createEl("h3", { text: "Calendar View" });

    new Setting(section)
      .setName("Default View")
      .setDesc("Which view to show by default")
      .addDropdown((dropdown) => {
        const views: CalendarViewMode[] = ["month", "week", "day", "agenda"];
        views.forEach((v) => dropdown.addOption(v, v.charAt(0).toUpperCase() + v.slice(1)));
        dropdown.setValue(this.plugin.settings.defaultView);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultView = value as CalendarViewMode;
          await this.plugin.saveSettings();
        });
      });

    new Setting(section)
      .setName("Refresh Interval")
      .setDesc("How often to refresh calendar data (minutes)")
      .addText((text) => {
        text.setValue(String(this.plugin.settings.refreshIntervalMinutes));
        text.setPlaceholder("30");
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "1440";
        text.onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.refreshIntervalMinutes = num;
          } else {
            this.plugin.settings.refreshIntervalMinutes = DEFAULT_SETTINGS.refreshIntervalMinutes;
          }
          await this.plugin.saveSettings();
        });
      });

    new Setting(section)
      .setName("Week Start")
      .setDesc("First day of the week")
      .addDropdown((dropdown) => {
        dropdown.addOption("0", "Sunday");
        dropdown.addOption("1", "Monday");
        dropdown.setValue(String(this.plugin.settings.weekStartsOn));
        dropdown.onChange(async (value) => {
          this.plugin.settings.weekStartsOn = parseInt(value, 10) as 0 | 1;
          await this.plugin.saveSettings();
        });
      });

    new Setting(section)
      .setName("Show Weekends")
      .setDesc("Display Saturday and Sunday in views")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showWeekends);
        toggle.onChange(async (value) => {
          this.plugin.settings.showWeekends = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private buildSyncSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv();
    section.createEl("h3", { text: "Sync" });

    new Setting(section)
      .setName("Sync Now")
      .addButton((btn) => {
        btn.setButtonText("Sync Calendar");
        btn.setTooltip("Force an immediate calendar sync");
        btn.onClick(async () => {
        });
      });
  }

  private async handleConnect() {
    const clientId = this.plugin.settings.clientId.trim();
    if (!clientId) return;

    try {
      const hasRefresh = this.plugin.tokenState.refreshToken !== null;
      const tokenResp = await runOAuthFlow(clientId, hasRefresh);

      this.plugin.tokenState = {
        accessToken: tokenResp.access_token,
        refreshToken: tokenResp.refresh_token ?? this.plugin.tokenState.refreshToken,
        expiresAt: Date.now() + tokenResp.expires_in * 1000,
        scope: tokenResp.scope,
        tokenType: tokenResp.token_type,
      };
      await this.plugin.saveTokenState();
    } catch (e) {
      console.error("Google OAuth connection failed.", e);
      new Notice("Google OAuth connection failed.");
    }

    this.display();
  }

  private async handleDisconnect() {
    const hadToken = this.plugin.tokenState.accessToken !== "";
    let revokeFailed = false;
    if (hadToken) {
      try {
        await revokeToken(this.plugin.tokenState.accessToken);
      } catch (e) {
        revokeFailed = true;
        console.error("Google token revoke failed.", e);
      }
    }
    this.plugin.tokenState = getDefaultTokenState();
    await this.plugin.saveTokenState();
    if (revokeFailed) {
      new Notice("Disconnected locally. Token revoke may need retry.");
    }
    this.display();
  }
}