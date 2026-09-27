import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store wraps the OS keychain/keystore and isn't available on web
// at all; fall back to localStorage there so `npx expo start --web` keeps
// working for local testing.
const webStore = {
  async getItemAsync(key: string): Promise<string | null> {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    } catch {
      // Ignore — private browsing / blocked storage. Session just won't persist.
    }
  },
  async deleteItemAsync(key: string): Promise<void> {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
  },
};

const store = Platform.OS === "web" ? webStore : SecureStore;

const ACCESS_TOKEN_KEY = "biletflow.access_token";
const REFRESH_TOKEN_KEY = "biletflow.refresh_token";

export async function getTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    store.getItemAsync(ACCESS_TOKEN_KEY),
    store.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    store.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    store.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    store.deleteItemAsync(ACCESS_TOKEN_KEY),
    store.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
