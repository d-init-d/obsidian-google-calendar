import * as http from "http";
import * as url from "url";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  globalThis.crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function base64UrlEncode(buffer: Uint8Array): string {
  let str = "";
  for (let i = 0; i < buffer.length; i++) {
    str += String.fromCharCode(buffer[i]);
  }
  const encoded = globalThis.btoa(str);
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function generateState(): string {
  const array = new Uint8Array(16);
  globalThis.crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function generateCodeChallengeMethod(): "S256" {
  return "S256";
}

export interface AuthUrlParams {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  accessType?: string;
  prompt?: string;
}

export function buildAuthUrl(params: AuthUrlParams): string {
  const searchParams = new URLSearchParams();
  searchParams.set("response_type", "code");
  searchParams.set("client_id", params.clientId);
  searchParams.set("redirect_uri", params.redirectUri);
  searchParams.set("scope", params.scopes.join(" "));
  searchParams.set("state", params.state);
  searchParams.set("code_challenge", params.codeChallenge);
  searchParams.set("code_challenge_method", generateCodeChallengeMethod());
  if (params.accessType) {
    searchParams.set("access_type", params.accessType);
  }
  if (params.prompt) {
    searchParams.set("prompt", params.prompt);
  }
  return `${GOOGLE_AUTH_URL}?${searchParams.toString()}`;
}

export interface CallbackResult {
  code: string;
  state: string;
}

export interface CallbackError {
  error: string;
  error_description?: string;
}

export type CallbackResponse = CallbackResult | CallbackError;

function parseCallbackParams(u: url.UrlWithParsedQuery): CallbackResponse {
  const query = u.query;
  if (!query) {
    return { error: "missing_query" };
  }

  const error = query["error"];
  if (typeof error === "string") {
    const desc = query["error_description"];
    return {
      error,
      error_description: typeof desc === "string" ? desc : undefined,
    };
  }

  const code = query["code"];
  const state = query["state"];

  if (typeof code !== "string" || code.length === 0) {
    return { error: "missing_code" };
  }
  if (typeof state !== "string" || state.length === 0) {
    return { error: "missing_state" };
  }

  return { code, state };
}

function readBody(
  req: http.IncomingMessage,
  bodyChunks: Buffer[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    req.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(bodyChunks).toString("utf8")));
  });
}

export async function waitForCallback(
  server: http.Server,
  expectedState: string
): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("oauth_callback_timeout"));
    }, 300000);

    server.on("request", (req, res) => {
      const u = url.parse(req.url || "", true);
      const parsed = parseCallbackParams(u);

      if ("error" in parsed) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authorization Failed</h1><p>" +
            parsed.error +
            "</p><p>You may close this window.</p></body></html>"
        );
        clearTimeout(timeoutId);
        server.close();
        reject(new Error(parsed.error));
        return;
      }

      if (parsed.state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>State Mismatch</h1><p>You may close this window.</p></body></html>"
        );
        clearTimeout(timeoutId);
        server.close();
        reject(new Error("state_mismatch"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h1>Authorization Successful</h1><p>You may close this window and return to Obsidian.</p></body></html>"
      );
      clearTimeout(timeoutId);
      server.close();
      resolve({ code: parsed.code, state: parsed.state });
    });
  });
}

export async function startLoopbackServer(
  port: number
): Promise<{ server: http.Server; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error("port_in_use"));
      } else {
        reject(err);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("server_bind_failed"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      resolve({ server, redirectUri });
    });
  });
}

function findFreePort(startPort: number, maxAttempts: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryPort = (p: number) => {
      const srv = http.createServer();
      srv.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          attempt++;
          if (attempt >= maxAttempts) {
            reject(new Error("no_free_port"));
          } else {
            tryPort(p + 1);
          }
        } else {
          reject(err);
        }
      });
      srv.listen(p, "127.0.0.1", () => {
        srv.close(() => resolve(p));
      });
    };

    tryPort(startPort);
  });
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  clientId: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", clientId);
  body.set("code_verifier", codeVerifier);

  const resp = await globalThis.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`token_exchange_failed_${resp.status}`);
  }

  const data = (await resp.json()) as TokenResponse;
  return data;
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("client_id", clientId);

  const resp = await globalThis.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`token_refresh_failed_${resp.status}`);
  }

  const data = (await resp.json()) as TokenResponse;
  return data;
}

export async function revokeToken(token: string): Promise<void> {
  const params = new URLSearchParams();
  params.set("token", token);

  const resp = await globalThis.fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!resp.ok) {
    throw new Error("revoke_failed");
  }
}

export function openSystemBrowser(urlToOpen: string): void {
  if (typeof globalThis !== "undefined") {
    const win = globalThis as Record<string, unknown>;
    if (win.require && win.process && (win.process as Record<string, unknown>).versions?.electron) {
      const { shell } = win.require("electron") as { shell: { openExternal: (url: string) => void } };
      shell.openExternal(urlToOpen).catch(() => {
        if (win.open) {
          (win.open as (url: string, target?: string, features?: string) => void)(urlToOpen, "_blank", "noopener,noreferrer");
        }
      });
      return;
    }
  }
  if (typeof window !== "undefined" && window.open) {
    window.open(urlToOpen, "_blank", "noopener,noreferrer");
  }
}

export async function runOAuthFlow(
  clientId: string,
  hasRefreshToken: boolean
): Promise<TokenResponse> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  const port = await findFreePort(5000, 100);
  const { server, redirectUri } = await startLoopbackServer(port);

  const authUrl = buildAuthUrl({
    clientId,
    redirectUri,
    scopes: SCOPES,
    state,
    codeChallenge: challenge,
    accessType: "offline",
    prompt: hasRefreshToken ? undefined : "consent",
  });

  openSystemBrowser(authUrl);

  const result = await waitForCallback(server, state);

  const tokenResp = await exchangeCodeForToken(
    result.code,
    redirectUri,
    clientId,
    verifier
  );

  return tokenResp;
}