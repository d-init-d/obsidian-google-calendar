import { PluginSettings, TokenState } from "./types";
import { DEFAULT_SETTINGS } from "./constants";

const SETTINGS_KEY = "pluginSettings";
const TOKEN_KEY = "tokenState";

export async function loadSettings(plugin: { loadData(): Promise<unknown> }): Promise<PluginSettings> {
  const data = await plugin.loadData();
  if (typeof data === "object" && data !== null && SETTINGS_KEY in data) {
    const saved = (data as Record<string, unknown>)[SETTINGS_KEY];
    if (typeof saved === "object" && saved !== null) {
      return { ...DEFAULT_SETTINGS, ...(saved as Partial<PluginSettings>) };
    }
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(
  plugin: { saveData(data: unknown): Promise<void> },
  settings: PluginSettings
): Promise<void> {
  const existing = await plugin.loadData().catch(() => ({}));
  const merged = { ...(existing as Record<string, unknown>), [SETTINGS_KEY]: settings };
  await plugin.saveData(merged);
}

export function getDefaultTokenState(): TokenState {
  return {
    accessToken: "",
    refreshToken: null,
    expiresAt: 0,
    scope: "",
    tokenType: "",
  };
}

export async function loadTokenState(plugin: { loadData(): Promise<unknown> }): Promise<TokenState> {
  const data = await plugin.loadData();
  if (typeof data === "object" && data !== null && TOKEN_KEY in data) {
    const saved = (data as Record<string, unknown>)[TOKEN_KEY];
    if (typeof saved === "object" && saved !== null) {
      return {
        accessToken: typeof saved.accessToken === "string" ? saved.accessToken : "",
        refreshToken: typeof saved.refreshToken === "string" ? saved.refreshToken : null,
        expiresAt: typeof saved.expiresAt === "number" ? saved.expiresAt : 0,
        scope: typeof saved.scope === "string" ? saved.scope : "",
        tokenType: typeof saved.tokenType === "string" ? saved.tokenType : "",
      };
    }
  }
  return getDefaultTokenState();
}

export async function saveTokenState(
  plugin: { saveData(data: unknown): Promise<void> },
  tokenState: TokenState
): Promise<void> {
  const existing = await plugin.loadData().catch(() => ({}));
  const merged = { ...(existing as Record<string, unknown>), [TOKEN_KEY]: tokenState };
  await plugin.saveData(merged);
}
