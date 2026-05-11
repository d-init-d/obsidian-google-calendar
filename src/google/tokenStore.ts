import { TokenState } from "../types";
import { loadTokenState, saveTokenState, getDefaultTokenState } from "../settings";

export interface TokenStore {
  get(): Promise<TokenState>;
  set(state: TokenState): Promise<void>;
  clear(): Promise<void>;
}

export function createTokenStore(
  plugin: { loadData(): Promise<unknown>; saveData(data: unknown): Promise<void> }
): TokenStore {
  return {
    async get(): Promise<TokenState> {
      return loadTokenState(plugin);
    },
    async set(state: TokenState): Promise<void> {
      await saveTokenState(plugin, state);
    },
    async clear(): Promise<void> {
      await saveTokenState(plugin, getDefaultTokenState());
    },
  };
}
