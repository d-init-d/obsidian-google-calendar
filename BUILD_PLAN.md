# Obsidian Google Calendar Plugin - Overnight Build Plan

## 0. Mission

Build an Obsidian desktop plugin that lets users connect Google Calendar via OAuth, view Google Calendar events inside Obsidian, and create/edit/delete events. The UI must feel native to Obsidian by using the active Obsidian theme variables, while the calendar layout and workflows should be inspired by Google Calendar.

The repository is currently empty. Start by scaffolding a TypeScript Obsidian plugin.

## 1. Product Requirements

### Core user goals

- Connect a Google account from Obsidian using OAuth.
- View Google Calendar events in a right sidebar.
- Expand the same calendar view into a full main tab.
- Switch between month, week, day, and agenda/list views in the full tab.
- Create, edit, and delete events from Obsidian.
- Sync data with Google Calendar without manually opening Google Calendar.
- Match the active Obsidian theme instead of building a separate visual style.

### MVP scope

- Desktop-only plugin.
- OAuth connect/disconnect.
- Calendar list loading.
- Event list loading for the visible date range.
- Sidebar compact view:
  - Mini month calendar.
  - Today/upcoming agenda.
  - Sync button.
  - Expand button to open the full tab.
- Full tab view:
  - Top toolbar: previous, next, today, range title, view switcher.
  - Month view.
  - Week view with all-day row and hourly grid.
  - Day view with all-day row and hourly grid.
  - Agenda/list view.
- Event modal:
  - Create event.
  - Edit event title, calendar, start/end, all-day, location, description.
  - Delete event.

### Non-goals for the first overnight build

- Mobile support.
- Real-time Google push notifications.
- Multiple Google accounts.
- Complex recurrence editing UI.
- Guest availability lookup.
- Google Meet creation.
- OS keychain token storage.
- Pixel-perfect Google Calendar clone.

## 2. Key Technical Decisions

### Plugin target

- Set `isDesktopOnly` to `true` in `manifest.json`.
- Reason: OAuth loopback redirect requires a local HTTP listener. This is appropriate for Windows, macOS, and Linux desktop apps, but not for Obsidian mobile.

### UI approach

- Do not embed the Google Calendar website or iframe.
- Render native Obsidian DOM UI using TypeScript and CSS.
- Use Google Calendar as layout reference only:
  - Month grid.
  - Week/day time grid.
  - All-day row.
  - Agenda list.
  - Toolbar with previous/next/today and view switcher.
- Use Obsidian CSS variables for colors, spacing, borders, text, and controls.
- Avoid a custom design system and avoid hard-coded app-wide colors.

### OAuth approach

- Use Google OAuth 2.0 Authorization Code flow with PKCE.
- Open the authorization URL in the system browser, not an embedded Obsidian webview.
- Start a temporary loopback HTTP server on `127.0.0.1:<random-free-port>`.
- Use `state` validation.
- Request offline access so the plugin receives a refresh token.
- Do not log OAuth codes, access tokens, refresh tokens, or authorization headers.
- Do not use or store a client secret in plugin code.

### Google API scopes

Use narrow scopes:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/calendar.events`

If implementing read-only mode later:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/calendar.events.readonly`

Avoid broad `https://www.googleapis.com/auth/calendar` for MVP unless the narrower scopes fail for a specific required feature.

### Token storage

- Store plugin settings and tokens with Obsidian `loadData()` / `saveData()` for MVP.
- Clearly separate user settings from token state in TypeScript types.
- Add comments in README/settings that token storage is local plugin data, not OS keychain.
- Future hardening can add OS keychain storage after explicitly adding and reviewing a dependency.

### HTTP requests

- Prefer Obsidian `requestUrl` for Google API calls to avoid CORS issues.
- Use standard Node modules for the loopback server (`http`, `url`) instead of adding a server dependency.
- Check `package.json` before importing any library.

## 3. Suggested Project Structure

Create a standard Obsidian TypeScript plugin structure:

```text
.
|-- manifest.json
|-- package.json
|-- package-lock.json
|-- tsconfig.json
|-- esbuild.config.mjs
|-- styles.css
|-- README.md
|-- src
|   |-- main.ts
|   |-- constants.ts
|   |-- settings.ts
|   |-- types.ts
|   |-- google
|   |   |-- oauth.ts
|   |   |-- calendarApi.ts
|   |   |-- googleTypes.ts
|   |   |-- tokenStore.ts
|   |-- views
|   |   |-- CalendarView.ts
|   |   |-- renderToolbar.ts
|   |   |-- renderSidebar.ts
|   |   |-- renderMonthView.ts
|   |   |-- renderWeekView.ts
|   |   |-- renderDayView.ts
|   |   |-- renderAgendaView.ts
|   |-- modals
|   |   |-- EventModal.ts
|   |-- state
|   |   |-- CalendarState.ts
|   |   |-- eventCache.ts
|   |-- utils
|   |   |-- dateRange.ts
|   |   |-- dateFormat.ts
|   |   |-- eventLayout.ts
|   |   |-- dom.ts
```

Keep the first implementation simple. If the agent can finish faster with fewer files, it may merge small helpers, but do not put everything into one huge `main.ts`.

## 4. Implementation Milestones

### Milestone 1 - Scaffold and build baseline

Tasks:

- Create Obsidian plugin scaffold.
- Use TypeScript.
- Configure build with esbuild.
- Add `npm run dev`, `npm run build`, and `npm run lint` if lint config is included.
- Create `manifest.json`:
  - `id`: `google-calendar`
  - `name`: `Google Calendar`
  - `description`: `View and edit Google Calendar events in Obsidian.`
  - `isDesktopOnly`: `true`
- Create a minimal plugin class in `src/main.ts`.
- Register:
  - Ribbon icon.
  - Command: `Open Google Calendar in sidebar`.
  - Command: `Open Google Calendar in tab`.
  - Command: `Sync Google Calendar`.
  - Settings tab.
- Build once with `npm run build`.

Acceptance criteria:

- `npm install` works.
- `npm run build` outputs `main.js`.
- Obsidian can load the plugin.
- Commands appear in the command palette.

### Milestone 2 - Settings and local state

Tasks:

- Define settings types:
  - `clientId`.
  - `selectedCalendarIds`.
  - `defaultCalendarId`.
  - `defaultView`: `month | week | day | agenda`.
  - `refreshIntervalMinutes`.
  - `weekStartsOn`: `0 | 1`.
  - `showWeekends`.
- Define token state:
  - `accessToken`.
  - `refreshToken`.
  - `expiresAt`.
  - `scope`.
  - `tokenType`.
- Add settings tab:
  - Client ID input.
  - Connect button.
  - Disconnect button.
  - Connection status.
  - Default view dropdown.
  - Refresh interval input.
- Save and load settings with `loadData()` / `saveData()`.

Acceptance criteria:

- Settings persist after reload.
- Connect button is disabled or shows a clear notice when Client ID is empty.
- No token value is shown in the UI.

### Milestone 3 - OAuth with PKCE

Tasks:

- Implement PKCE:
  - Generate code verifier.
  - Generate SHA-256 code challenge.
  - Base64url encode.
- Start a temporary local HTTP server:
  - Bind to `127.0.0.1` on a random available port.
  - Callback path can be `/oauth2callback`.
  - Redirect URI example: `http://127.0.0.1:<port>/oauth2callback`.
- Build Google authorization URL:
  - `response_type=code`.
  - `client_id`.
  - `redirect_uri`.
  - `scope`.
  - `state`.
  - `code_challenge`.
  - `code_challenge_method=S256`.
  - `access_type=offline`.
  - `prompt=consent` only when reconnecting or when refresh token is missing.
- Open URL in the system browser.
  - Use Electron shell if available in Obsidian desktop.
  - Fallback to `window.open` only if necessary.
- Validate callback:
  - Reject missing code.
  - Reject mismatched state.
  - Handle `error` query param.
- Exchange code for token at Google token endpoint.
- Save token state.
- Implement refresh token flow.
- Implement disconnect:
  - Revoke token via Google revoke endpoint when possible.
  - Clear local token state.

Acceptance criteria:

- User can connect a Google account.
- OAuth callback browser page tells the user to return to Obsidian.
- Plugin shows connected status.
- Expired access token refreshes before API calls.
- Disconnect clears token state.

### Milestone 4 - Google Calendar API client

Tasks:

- Implement API helper with authenticated requests.
- Calendar endpoints:
  - `calendarList.list`.
  - `events.list`.
  - `events.insert`.
  - `events.patch`.
  - `events.delete`.
- Handle:
  - `nextPageToken`.
  - Time zone.
  - All-day dates (`start.date`, `end.date`).
  - Timed events (`start.dateTime`, `end.dateTime`).
  - Cancelled events should not render unless needed for sync bookkeeping.
  - 401 -> refresh token and retry once.
  - 403/429 -> user-facing notice.
- Convert Google event objects into internal `CalendarEvent` type.

Acceptance criteria:

- Calendar list loads after OAuth.
- Events load for the currently visible range.
- Create/edit/delete basic events works against a test calendar.
- API errors are visible as Obsidian notices or inline error state.

### Milestone 5 - View shell and open behavior

Tasks:

- Register a single view type, for example `google-calendar-view`.
- `CalendarView` should accept state:
  - `surface`: `sidebar | full`.
  - `calendarView`: `month | week | day | agenda`.
  - `anchorDate`: ISO date string.
- Add commands:
  - Open in right sidebar.
  - Open in main tab.
- Add expand button in sidebar:
  - Opens a full main tab with the same anchor date and selected view.
- Add compact/full layout detection:
  - Use `ResizeObserver`.
  - If width is below a threshold, render sidebar-style compact layout.
  - If width is wide, render full layout.
- Do not duplicate business logic between sidebar and full tab.

Acceptance criteria:

- Calendar opens in the right sidebar.
- Calendar opens in a main tab.
- Sidebar expand button opens full tab.
- Reloading Obsidian does not throw view registration errors.

### Milestone 6 - Sidebar compact UI

Tasks:

- Render a compact header:
  - Calendar title.
  - Sync icon/button.
  - Expand icon/button.
- Render mini month:
  - Previous/next month.
  - Today highlight.
  - Selected date highlight.
  - Dots or small markers for days with events.
- Render agenda:
  - Today first.
  - Upcoming grouped by day.
  - Empty state.
  - Loading state.
  - Error state.
- Event click opens event modal.
- Date click updates selected day and agenda range.

Theme rules:

- Use Obsidian variables:
  - `--background-primary`.
  - `--background-secondary`.
  - `--text-normal`.
  - `--text-muted`.
  - `--interactive-accent`.
  - `--background-modifier-border`.
  - `--background-modifier-hover`.
- Do not hard-code a dark theme.
- Event colors may come from Google Calendar, but text contrast must be readable.

Acceptance criteria:

- Sidebar remains usable around 260-360px width.
- Text does not overlap.
- Buttons are discoverable with tooltips or clear labels.
- UI looks native under both light and dark Obsidian themes.

### Milestone 7 - Full tab UI

Tasks:

- Render top toolbar:
  - Previous.
  - Next.
  - Today.
  - Title.
  - View switcher: month, week, day, agenda.
  - Sync.
- Month view:
  - 7-column grid.
  - Day cells.
  - Event chips.
  - More indicator when too many events fit.
- Week view:
  - Header with weekdays.
  - All-day row.
  - Hourly time grid.
  - Timed event blocks positioned by time.
  - Current time indicator if viewing today.
- Day view:
  - Same as week, one day wide.
- Agenda/list view:
  - Group by date.
  - Include time, title, calendar color.
- Click empty slot:
  - Open create event modal prefilled with clicked date/time.
- Click event:
  - Open edit event modal.

Acceptance criteria:

- Full tab is usable at desktop widths.
- Month/week/day/list switch without losing selected date.
- Week/day event placement is visually stable.
- Full tab still uses Obsidian theme variables.

### Milestone 8 - Event modal

Tasks:

- Create a modal for new/edit event.
- Fields:
  - Title.
  - Calendar.
  - All-day toggle.
  - Start date.
  - Start time.
  - End date.
  - End time.
  - Location.
  - Description.
- Buttons:
  - Save.
  - Delete, only for existing event.
  - Cancel.
- Validate:
  - Title can be empty only if Google accepts it, but show a warning if empty.
  - End must be after start.
  - Calendar must be selected.
- On save:
  - Insert or patch via Google API.
  - Refresh visible range.
- On delete:
  - Confirm delete.
  - Delete via Google API.
  - Refresh visible range.

Acceptance criteria:

- Create event from a date/time slot.
- Edit event from sidebar and full tab.
- Delete event.
- Calendar refreshes after mutations.

### Milestone 9 - Sync, cache, and error handling

Tasks:

- Cache events by date range and calendar IDs in memory.
- Persist only minimal useful cache if needed; do not persist stale data unless the implementation is clear.
- Manual sync reloads visible range.
- Optional interval sync:
  - Use `registerInterval`.
  - Respect `refreshIntervalMinutes`.
  - Do nothing if disconnected.
- Add clear states:
  - Not connected.
  - Loading.
  - Empty.
  - API error.
  - Needs re-auth.

Acceptance criteria:

- Plugin does not make API calls when disconnected.
- Sync button works from sidebar and full tab.
- API failures do not break the view.

### Milestone 10 - Polish and release readiness

Tasks:

- README:
  - Setup instructions.
  - Google Cloud OAuth Client setup.
  - Required scopes.
  - Local token storage note.
  - Development commands.
- Add screenshots later if available.
- Ensure release files:
  - `manifest.json`.
  - `main.js`.
  - `styles.css`.
- Run final commands:
  - `npm install`.
  - `npm run build`.
  - `npm run lint` if available.
- Do a manual Obsidian smoke test in a dev vault.

Acceptance criteria:

- Build succeeds.
- No obvious console errors on plugin load.
- Connect, view, create, edit, delete tested against a test Google Calendar.

## 5. Data Types To Define Early

```ts
export type CalendarSurface = "sidebar" | "full";
export type CalendarViewMode = "month" | "week" | "day" | "agenda";

export interface PluginSettings {
  clientId: string;
  selectedCalendarIds: string[];
  defaultCalendarId: string | null;
  defaultView: CalendarViewMode;
  refreshIntervalMinutes: number;
  weekStartsOn: 0 | 1;
  showWeekends: boolean;
}

export interface TokenState {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  colorId?: string;
  backgroundColor?: string;
  htmlLink?: string;
  recurringEventId?: string;
}
```

## 6. UI/CSS Guidance

Use class names with a stable prefix, for example `ogc-`.

Preferred CSS variable usage:

```css
.ogc-root {
  color: var(--text-normal);
  background: var(--background-primary);
  font-size: var(--font-ui-small);
}

.ogc-toolbar {
  border-bottom: 1px solid var(--background-modifier-border);
}

.ogc-button {
  color: var(--text-normal);
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
}

.ogc-button:hover {
  background: var(--background-modifier-hover);
}

.ogc-active {
  color: var(--text-on-accent);
  background: var(--interactive-accent);
}
```

Avoid:

- Fixed dark-only colors.
- Large decorative cards.
- Nested cards.
- Marketing-style layout.
- Overly rounded controls.
- Text that depends on viewport-based font sizing.

## 7. Manual QA Checklist

Use a separate Obsidian dev vault.

- Install plugin into `.obsidian/plugins/google-calendar`.
- Run `npm run dev`.
- Enable plugin in Obsidian community plugins.
- Open settings and enter Google OAuth Client ID.
- Connect Google account.
- Verify calendar list loads.
- Open sidebar calendar.
- Expand into full tab.
- Switch month/week/day/agenda.
- Create event on a test calendar.
- Edit title/time/location/description.
- Delete event.
- Disconnect account.
- Reload Obsidian and ensure no startup errors.
- Test in light and dark themes.
- Test sidebar width around 260px.
- Test full tab width around 1200px.

## 8. Important References

- Obsidian plugin docs: https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin
- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- Obsidian API type definitions: https://github.com/obsidianmd/obsidian-api
- Google OAuth for desktop apps: https://developers.google.com/identity/protocols/oauth2/native-app
- Google Calendar scopes: https://developers.google.com/workspace/calendar/api/auth
- Google Calendar Events API: https://developers.google.com/workspace/calendar/api/v3/reference/events

## 9. Handoff Prompt For An Implementation Agent

Use this prompt if handing the repo to another agent:

```text
You are working in D:\obsidian-google-calendar. The repo is empty except for BUILD_PLAN.md. Build the MVP described in BUILD_PLAN.md.

Implement a desktop-only Obsidian TypeScript plugin named Google Calendar. It must connect to Google Calendar using OAuth Authorization Code with PKCE through the system browser and a local loopback redirect. It must render Google Calendar events in a native Obsidian-themed UI, with a compact right-sidebar view and a full tab view inspired by Google Calendar month/week/day/agenda layouts.

Keep dependencies minimal. Before importing any library, check package.json. Prefer Obsidian APIs, standard browser APIs, and Node built-ins. Do not embed Google Calendar web UI. Do not hard-code a custom theme. Use Obsidian CSS variables.

Finish by running npm install and npm run build, then report changed files, verification commands, and any remaining gaps.
```

## 10. Overnight Execution Task List And Checklists

This section is the execution blueprint for the orchestrator. The orchestrator is the brain: it plans, assigns bounded work, reviews results, resolves conflicts, and decides verification gates. `@minimax-m27` workers are coding hands only. Do not ask a worker to own broad architecture or to read the entire repo when a smaller context pack is enough.

### 10.1 Permission Gate Before Starting Overnight Work

Do not start implementation until the user explicitly grants these permissions:

- [ ] Write permission for this repo: create and edit `package.json`, lockfile, config files, `src/**`, `styles.css`, `README.md`, `manifest.json`, and generated build output.
- [ ] Dependency permission: run `npm install` and install only minimal development dependencies needed for an Obsidian TypeScript plugin, expected to include `typescript`, `esbuild`, `obsidian`, and `@types/node` unless an existing scaffold says otherwise.
- [ ] Build permission: run `npm run build`, `npm run dev` when useful, and `npm run lint` only if lint config is added.
- [ ] Network permission: download npm packages and call Google OAuth/Calendar endpoints during manual testing if credentials are supplied.
- [ ] OAuth permission: start a temporary loopback server on `127.0.0.1:<random-port>` and open the system browser for Google OAuth testing.
- [ ] Test account permission: use a user-provided Google OAuth Desktop Client ID and a disposable/test Google Calendar for create/edit/delete validation.
- [ ] Overnight autonomy permission: continue assigning bounded `@minimax-m27` coding tasks without further confirmation as long as work stays inside this plan and uses non-destructive commands.
- [ ] Long-running process permission: keep dev/build processes running if needed, and stop only processes started by this run.
- [ ] Logging permission: write concise progress notes or temporary verification logs inside the repo if needed, excluding secrets and tokens.
- [ ] Safety boundary acknowledged: no git commit, no push, no destructive git commands, no force delete, no token logging, no client secret in code, and no broad dependency additions without stopping for approval.

### 10.2 Worker Operating Rules

- The orchestrator owns planning, sequencing, conflict control, final review, and final verification.
- Each `@minimax-m27` worker gets one bounded task, explicit owned files, forbidden files, dependencies, acceptance checklist, and verification command.
- Keep every worker context under 200k tokens: include only `BUILD_PLAN.md` sections relevant to the task, current file snippets, and owned file list.
- Prefer one worker per feature boundary. Use multiple workers only when owned files do not overlap.
- If two tasks need the same file, run them sequentially or let the orchestrator merge one patch manually.
- Workers must not import uninstalled libraries. If a worker needs a new dependency, it must report the need instead of adding it.
- Workers must not show OAuth codes, tokens, refresh tokens, authorization headers, or local plugin data containing tokens.
- Every worker returns: changed files, summary, commands run, command results, gaps, and follow-up risks.
- The orchestrator reads changed files after every worker, runs the nearest verification gate, and only then unlocks dependent tasks.

### 10.3 Parallel Batch Plan

| Batch | Goal | Tasks | Parallel `@minimax-m27` count | Gate before next batch |
| --- | --- | --- | ---: | --- |
| B0 | Preflight and scaffold baseline | T00, T01 | 0-1 | `npm install` and `npm run build` pass |
| B1 | Shared contracts and foundations | T02, T03, T04 | up to 3 | TypeScript build passes after merge |
| B2 | Auth/API and view shell | T05, T06, T07 | up to 2, with T06 after T05 | OAuth/API compile and commands register |
| B3 | UI surfaces | T08, T09, T10, T11 | up to 4 | Sidebar/full tab render without compile errors |
| B4 | Mutation, sync, and integration | T12, T13, T14 | 1-2, mostly sequential | Create/edit/delete paths compile and refresh state |
| B5 | Polish, docs, and QA | T15, T16, T17 | up to 2 | Final build, smoke checklist, and known gaps documented |

Recommended overnight maximum: 4 concurrent `@minimax-m27` workers. Use fewer when files overlap or when a build failure needs diagnosis.

### 10.4 Detailed Task List

#### T00 - Orchestrator Preflight

- `@minimax-m27` workers: 0.
- Owner: orchestrator only.
- Depends on: user grants permission gate.
- Files owned: none unless adding progress notes.
- Checklist:
  - [x] Confirm current repo contents.
  - [x] Confirm whether `package.json` already exists before adding dependencies.
  - [x] Confirm no unrelated user changes would be overwritten.
  - [x] Create implementation todo list for the live session.
  - [x] Decide whether lint is included in the first scaffold or deferred.
- Verification:
  - [x] Repo state is understood.
  - [x] No worker is launched before the permission gate is granted.

#### T01 - Scaffold And Build Baseline

- `@minimax-m27` workers: 1.
- Owned files: `package.json`, `package-lock.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, `src/main.ts`, `styles.css`.
- Forbidden files: `src/google/**`, `src/views/**`, `src/modals/**` except placeholders needed for compile.
- Depends on: T00.
- Worker context pack:
  - Mission, MVP scope, plugin target, project structure, Milestone 1, UI/CSS guidance.
- Checklist:
  - [x] Create standard Obsidian TypeScript plugin scaffold.
  - [x] Add scripts: `dev`, `build`, and `lint` only if lint config is actually added.
  - [x] Set `isDesktopOnly` to `true` in `manifest.json`.
  - [x] Create minimal plugin class with `onload` and `onunload`.
  - [x] Register ribbon icon and commands for sidebar, tab, and sync.
  - [x] Register settings tab placeholder.
  - [x] Ensure esbuild outputs `main.js` for Obsidian.
- Verification:
  - [x] `npm install` passes.
  - [x] `npm run build` passes.
  - [x] `main.js` is generated.

#### T02 - Settings, Data Model, And Local Persistence

- `@minimax-m27` workers: 1.
- Owned files: `src/types.ts`, `src/settings.ts`, `src/constants.ts`, `src/google/tokenStore.ts`.
- Forbidden files: `src/google/oauth.ts`, `src/google/calendarApi.ts`, `src/views/**`, `src/modals/**`.
- Depends on: T01.
- Can run in parallel with: T03, T04.
- Worker context pack:
  - Milestone 2, Token storage, Data Types To Define Early, security notes.
- Checklist:
  - [x] Define `PluginSettings`, `TokenState`, calendar/event types, and view mode types.
  - [x] Add default settings.
  - [x] Implement load/save settings through Obsidian plugin data.
  - [x] Keep settings and token state clearly separated.
  - [x] Implement token store helpers without logging tokens.
  - [x] Add settings UI: Client ID, connection status, connect/disconnect placeholders, default view, refresh interval, week start, show weekends.
  - [x] Disable or clearly block connect when Client ID is empty.
- Verification:
  - [x] `npm run build` passes.
  - [x] No token value appears in settings UI.

#### T03 - Date, Format, Layout, And State Utilities

- `@minimax-m27` workers: 1.
- Owned files: `src/utils/dateRange.ts`, `src/utils/dateFormat.ts`, `src/utils/eventLayout.ts`, `src/utils/dom.ts`, `src/state/CalendarState.ts`, `src/state/eventCache.ts`.
- Forbidden files: `src/google/**`, `src/views/**`, `src/modals/**` except exported type imports.
- Depends on: T01 and shared types from T02; if T02 is not done, use a narrow agreed interface from the plan and let orchestrator reconcile.
- Can run in parallel with: T04; T02 if file boundaries stay clean.
- Worker context pack:
  - Data types, Milestone 5, Milestone 9, date range requirements.
- Checklist:
  - [x] Implement visible ranges for month, week, day, and agenda.
  - [x] Respect `weekStartsOn` and `showWeekends`.
  - [x] Add safe date formatting helpers.
  - [x] Add event grouping by day.
  - [x] Add timed event layout helpers for day/week grids.
  - [x] Add in-memory event cache keyed by range and calendar IDs.
  - [x] Add view state for `surface`, `calendarView`, `anchorDate`, loading, error, and selected date.
- Verification:
  - [x] `npm run build` passes after type reconciliation.
  - [x] Utility functions avoid timezone-lossy string parsing where practical.

#### T04 - Theme CSS Foundation

- `@minimax-m27` workers: 1.
- Owned files: `styles.css`.
- Forbidden files: all TypeScript files unless a class name mismatch requires a tiny coordinated change.
- Depends on: T01.
- Can run in parallel with: T02, T03, T05.
- Worker context pack:
  - UI approach, Theme rules, UI/CSS Guidance, sidebar and full tab acceptance criteria.
- Checklist:
  - [x] Add stable `ogc-` class prefix rules.
  - [x] Use Obsidian CSS variables for colors, borders, text, hover, accent, and font sizes.
  - [x] Add compact sidebar layout styles for 260-360px width.
  - [x] Add full tab grid styles for desktop widths.
  - [x] Add modal field and button styles that look native to Obsidian.
  - [x] Avoid hard-coded dark-only colors and marketing-style cards.
  - [x] Add readable event chip styles with contrast fallback.
- Verification:
  - [x] `npm run build` still passes.
  - [x] CSS has no non-Obsidian global resets.

#### T05 - OAuth PKCE And Token Refresh

- `@minimax-m27` workers: 1.
- Owned files: `src/google/oauth.ts`, coordinated small edits to `src/settings.ts`, `src/constants.ts`, and `src/main.ts` only if required for wiring.
- Forbidden files: `src/google/calendarApi.ts`, `src/views/**`, `src/modals/**`.
- Depends on: T02.
- Can run in parallel with: T04. Do not run in parallel with T06 if both edit Google auth helpers.
- Worker context pack:
  - OAuth approach, scopes, token storage, Milestone 3, security notes.
- Checklist:
  - [x] Generate PKCE code verifier and S256 challenge.
  - [x] Generate and validate `state`.
  - [x] Start temporary loopback HTTP server on `127.0.0.1` random free port.
  - [x] Build authorization URL with narrow scopes and `access_type=offline`.
  - [x] Open system browser through Obsidian/Electron-safe method.
  - [x] Handle callback success, missing code, mismatched state, and OAuth error.
  - [x] Exchange authorization code for tokens.
  - [x] Refresh access token before API calls when expired.
  - [x] Revoke token on disconnect when possible and always clear local token state.
  - [x] Never log codes, tokens, refresh tokens, or authorization headers.
- Verification:
  - [x] `npm run build` passes.
  - [ ] OAuth code path can be manually tested after user supplies Client ID.

#### T06 - Google Calendar API Client

- `@minimax-m27` workers: 1.
- Owned files: `src/google/calendarApi.ts`, `src/google/googleTypes.ts`.
- Forbidden files: `src/google/oauth.ts` except import usage; `src/views/**`, `src/modals/**`.
- Depends on: T05 and T02.
- Worker context pack:
  - Google API scopes, HTTP requests, Milestone 4, data types.
- Checklist:
  - [x] Implement authenticated request helper using Obsidian `requestUrl`.
  - [x] Implement `calendarList.list`.
  - [x] Implement paginated `events.list`.
  - [x] Implement `events.insert`, `events.patch`, and `events.delete`.
  - [x] Refresh token and retry once on 401.
  - [x] Surface 403/429 and other API errors as typed errors for UI notices.
  - [x] Convert Google events into internal `CalendarEvent` values.
  - [x] Handle all-day dates and timed events.
  - [x] Ignore cancelled events for rendering unless needed later.
- Verification:
  - [x] `npm run build` passes.
  - [x] API methods have clear return types and no `any` escapes.

#### T07 - View Registration And Shell Behavior

- `@minimax-m27` workers: 1.
- Owned files: `src/main.ts`, `src/views/CalendarView.ts`, `src/views/renderToolbar.ts`.
- Forbidden files: detailed view renderers, `src/google/**` internals, `src/modals/**`.
- Depends on: T02 and T03.
- Can run in parallel with: T06 if imports stay stable.
- Worker context pack:
  - Milestone 5, view shell requirements, settings/state types.
- Checklist:
  - [x] Register one stable view type such as `google-calendar-view`.
  - [x] Open right sidebar view from command and ribbon.
  - [x] Open full main tab view from command.
  - [x] Add expand action from sidebar to full tab preserving date/view.
  - [x] Add toolbar with previous, next, today, title, view switcher, sync.
  - [x] Add `ResizeObserver` or safe fallback for compact/full behavior.
  - [x] Avoid duplicating business logic between surfaces.
- Verification:
  - [x] `npm run build` passes.
  - [ ] View registration/unregistration is safe across reloads.

#### T08 - Sidebar Compact UI

- `@minimax-m27` workers: 1.
- Owned files: `src/views/renderSidebar.ts`, coordinated tiny class-name additions in `src/views/CalendarView.ts` if needed.
- Forbidden files: `src/google/**`, full view renderer files, `src/modals/EventModal.ts` except opening hook signature agreed by orchestrator.
- Depends on: T03, T04, T07.
- Can run in parallel with: T09, T10, T11.
- Worker context pack:
  - Milestone 6, theme rules, date utilities, state shape, event modal open contract.
- Checklist:
  - [x] Render compact header with title, sync, and expand controls.
  - [x] Render mini month with previous/next, today, selected date, and event markers.
  - [x] Render agenda grouped by day.
  - [x] Support loading, empty, error, disconnected, and needs-auth states.
  - [x] Click date updates selected day/range.
  - [x] Click event calls the event modal open handler.
  - [x] Keep layout usable at 260-360px width.
- Verification:
  - [x] `npm run build` passes.
  - [ ] No overlapping text in compact markup assumptions.

#### T09 - Full Tab Month And Agenda Views

- `@minimax-m27` workers: 1.
- Owned files: `src/views/renderMonthView.ts`, `src/views/renderAgendaView.ts`.
- Forbidden files: `src/views/renderWeekView.ts`, `src/views/renderDayView.ts`, `src/google/**`, `src/modals/**`.
- Depends on: T03, T04, T07.
- Can run in parallel with: T08, T10, T11.
- Worker context pack:
  - Milestone 7 month and agenda sections, date utilities, event display type.
- Checklist:
  - [x] Month grid uses 7 columns and respects week start.
  - [x] Day cells show date, today marker, out-of-range styling, event chips, and more indicator.
  - [x] Agenda groups events by date with time, title, and calendar color.
  - [x] Empty slot/date click opens create flow with prefilled date.
  - [x] Event click opens edit flow.
  - [x] View does not lose selected date when switching modes.
- Verification:
  - [x] `npm run build` passes.
  - [x] Month/agenda renderers are pure enough to reuse from `CalendarView`.

#### T10 - Full Tab Week And Day Time Grids

- `@minimax-m27` workers: 1.
- Owned files: `src/views/renderWeekView.ts`, `src/views/renderDayView.ts`, coordinated updates to `src/utils/eventLayout.ts` only through orchestrator if needed.
- Forbidden files: `src/views/renderMonthView.ts`, `src/views/renderAgendaView.ts`, `src/google/**`, `src/modals/**`.
- Depends on: T03, T04, T07.
- Can run in parallel with: T08, T09, T11.
- Worker context pack:
  - Milestone 7 week/day sections, event layout helper contract.
- Checklist:
  - [x] Render weekday/day header.
  - [x] Render all-day row.
  - [x] Render hourly grid.
  - [x] Position timed event blocks by start/end time.
  - [x] Show current time indicator when viewing today.
  - [x] Empty time slot click opens create flow with prefilled date/time.
  - [x] Event click opens edit flow.
  - [x] Handle overlapping events with stable visual columns.
- Verification:
  - [x] `npm run build` passes.
  - [x] Timed grid avoids layout math inside click handlers where possible.

#### T11 - Event Modal UI And Validation

- `@minimax-m27` workers: 1.
- Owned files: `src/modals/EventModal.ts`.
- Forbidden files: `src/google/**`, `src/views/**` except shared callback types if orchestrator approves.
- Depends on: T02 and T06 type contracts; can start after T02 with API callbacks stubbed if orchestrator defines the contract.
- Can run in parallel with: T08, T09, T10 after callback contract is stable.
- Worker context pack:
  - Milestone 8, data types, Google all-day/timed event shape, theme rules.
- Checklist:
  - [x] Support create and edit mode.
  - [x] Fields: title, calendar, all-day, start date/time, end date/time, location, description.
  - [x] Buttons: save, delete for existing events, cancel.
  - [x] Validate calendar selection.
  - [x] Validate end is after start.
  - [x] Warn on empty title without blocking if Google accepts it.
  - [x] Confirm before delete.
  - [x] Return normalized payload for API insert/patch.
- Verification:
  - [x] `npm run build` passes.
  - [x] Modal never displays raw token or auth state.

#### T12 - Mutations And Refresh Integration

- `@minimax-m27` workers: 1.
- Owned files: `src/views/CalendarView.ts`, `src/modals/EventModal.ts`, small coordinated wiring in `src/google/calendarApi.ts` if required.
- Forbidden files: broad renderer rewrites unless fixing integration callbacks.
- Depends on: T06, T07, T08, T09, T10, T11.
- Can run in parallel with: none by default because this is cross-cutting.
- Worker context pack:
  - Milestones 4, 7, 8, existing callback contracts, current renderer signatures.
- Checklist:
  - [ ] Wire create flow from empty date/time slot.
  - [ ] Wire edit flow from event clicks in sidebar and full tab.
  - [ ] Call API insert/patch/delete from modal callbacks.
  - [ ] Refresh visible range after successful mutation.
  - [ ] Show Obsidian notices for success/failure.
  - [ ] Preserve selected date and view mode after refresh.
- Verification:
  - [ ] `npm run build` passes.
  - [ ] Manual API test can be run after OAuth credentials are available.

#### T13 - Sync, Cache, And Error States

- `@minimax-m27` workers: 1.
- Owned files: `src/state/eventCache.ts`, `src/state/CalendarState.ts`, `src/views/CalendarView.ts`, coordinated small edits to renderers for state display.
- Forbidden files: OAuth internals unless fixing typed auth error handling through orchestrator.
- Depends on: T06, T07, T08, T09, T10.
- Can run in parallel with: T16 docs, not with T12 unless orchestrator splits files.
- Worker context pack:
  - Milestone 9, cache requirements, current state and API contracts.
- Checklist:
  - [ ] Manual sync reloads visible range.
  - [ ] Optional interval sync uses `registerInterval` and respects settings.
  - [ ] No API calls occur when disconnected.
  - [ ] Cache is invalidated after mutations.
  - [ ] Render not connected, loading, empty, API error, and needs-auth states.
  - [ ] Handle refresh-token failure by moving UI into needs-auth state.
- Verification:
  - [ ] `npm run build` passes.
  - [ ] Sync command is safe while disconnected.

#### T14 - Settings And Calendar Selection Integration

- `@minimax-m27` workers: 1.
- Owned files: `src/settings.ts`, `src/main.ts`, `src/google/calendarApi.ts` small usage edits only, `src/views/CalendarView.ts` small usage edits only.
- Forbidden files: renderer rewrites.
- Depends on: T06 and T13.
- Can run in parallel with: T16 docs only.
- Worker context pack:
  - Milestones 2 and 4, calendar list loading, selected/default calendar settings.
- Checklist:
  - [ ] Load calendar list after connection.
  - [ ] Let user choose selected calendar IDs if practical for MVP.
  - [ ] Let user choose default calendar for new events.
  - [ ] Persist calendar settings.
  - [ ] Fall back to primary calendar when default is missing.
  - [ ] Refresh visible events after calendar selection changes.
- Verification:
  - [ ] `npm run build` passes.
  - [ ] Settings persist after reload.

#### T15 - Accessibility, Responsive Polish, And Native Feel

- `@minimax-m27` workers: 1.
- Owned files: `styles.css`, `src/views/**`, `src/modals/EventModal.ts` small accessibility edits.
- Forbidden files: Google auth/API internals.
- Depends on: T08, T09, T10, T11.
- Can run in parallel with: T16 docs if file boundaries are respected.
- Worker context pack:
  - UI/CSS Guidance, sidebar/full tab acceptance criteria, current UI files.
- Checklist:
  - [ ] Add accessible labels/titles for icon-only controls.
  - [ ] Ensure keyboard focus is visible and not removed.
  - [ ] Ensure buttons are discoverable.
  - [ ] Check compact widths around 260-360px.
  - [ ] Check desktop full tab around 1200px.
  - [ ] Avoid text overlap in grids and modal fields.
  - [ ] Verify light/dark theme variable usage.
- Verification:
  - [ ] `npm run build` passes.
  - [ ] Manual theme smoke test checklist is updated with any limitations.

#### T16 - README And Release Readiness Docs

- `@minimax-m27` workers: 1.
- Owned files: `README.md`, optional `BUILD_NOTES.md` if orchestrator approves.
- Forbidden files: implementation files.
- Depends on: T01; best after T05/T06 for accuracy.
- Can run in parallel with: T13, T14, T15 if no file overlap.
- Worker context pack:
  - Mission, OAuth setup, scopes, token storage, final QA checklist.
- Checklist:
  - [ ] Add setup instructions.
  - [ ] Add Google Cloud OAuth Desktop Client setup.
  - [ ] List exact scopes.
  - [ ] Explain local plugin token storage and non-keychain limitation.
  - [ ] Document development commands.
  - [ ] Document release files: `manifest.json`, `main.js`, `styles.css`.
  - [ ] Document known MVP non-goals.
- Verification:
  - [ ] README instructions match actual package scripts.
  - [ ] No secrets or user-specific tokens are documented.

#### T17 - Final Verification And Overnight Report

- `@minimax-m27` workers: 0 by default; use 1 targeted worker only if a failing area needs a bounded fix.
- Owner: orchestrator.
- Depends on: all implementation tasks selected for the overnight run.
- Files owned: none unless documenting final report.
- Checklist:
  - [ ] Run `npm install` from clean state if lockfile changed.
  - [ ] Run `npm run build`.
  - [ ] Run `npm run lint` if available.
  - [ ] Inspect generated `main.js`, `manifest.json`, and `styles.css` presence.
  - [ ] Install into a separate Obsidian dev vault if permitted.
  - [ ] Enable plugin and verify commands appear.
  - [ ] Enter OAuth Client ID and connect, if user provided credentials.
  - [ ] Load calendar list.
  - [ ] Open sidebar and full tab.
  - [ ] Switch month/week/day/agenda.
  - [ ] Create, edit, and delete an event on a test calendar, if credentials are available.
  - [ ] Disconnect and reload Obsidian.
  - [ ] Record remaining gaps and exact commands run.
- Verification:
  - [ ] Final build passes.
  - [ ] Any untested Google/OAuth steps are clearly marked as blocked by missing credentials or manual access.

### 10.5 Handoff Prompt Template For `@minimax-m27`

Use this template for every coding worker. Fill only the task-specific fields and keep the context small.

```text
You are a coding worker for D:\obsidian-google-calendar. The orchestrator is the architect and final reviewer. Implement only the bounded task below.

Task ID: <Txx>
Goal: <one clear goal>
Owned files: <explicit file list>
Forbidden files: <explicit file list or patterns>
Dependencies already completed: <list>
Relevant BUILD_PLAN sections: <paste only relevant excerpts>
Current code context: <paste only needed snippets or file summaries>

Rules:
- Do not broaden scope.
- Do not add dependencies unless the orchestrator explicitly approved them.
- Do not log OAuth codes, access tokens, refresh tokens, or authorization headers.
- Do not use `any`, `@ts-ignore`, placeholder implementations, or empty catch blocks.
- Keep code in English and follow existing project style.
- Run the nearest verification command when possible.

Acceptance checklist:
<task checklist>

Return:
- Changed files.
- What was implemented.
- Commands run and results.
- Gaps or risks.
```

### 10.6 Conflict Matrix

- `src/main.ts`: orchestrator/T01/T07/T14 only; avoid parallel edits.
- `src/settings.ts`: T02 first, then T05/T14 with orchestrator approval.
- `src/google/oauth.ts`: T05 owns it.
- `src/google/calendarApi.ts`: T06 owns it, T12/T14 may touch only after T06.
- `src/views/CalendarView.ts`: T07 owns shell first; T08-T10 should avoid it unless callback signatures are pre-approved; T12/T13 integrate later.
- `styles.css`: T04 owns foundation; T15 polishes later.
- `src/modals/EventModal.ts`: T11 owns it; T12 integrates callbacks later.
- `README.md`: T16 owns it.

### 10.7 Stop Conditions

Stop overnight execution and ask the user before proceeding if any of these happen:

- A new production dependency is needed beyond the approved minimal dependency set.
- OAuth requires a client secret or a non-loopback redirect approach.
- Google API behavior requires broader scopes than listed in this plan.
- Three consecutive build/test fixes fail for the same issue.
- A worker needs to touch unrelated files or overwrite unknown user changes.
- Any command asks for credentials, payment, browser login, or destructive confirmation.
- A manual Google account step is required and no test credentials/calendar were provided.

### 10.8 Minimum Done Criteria For The Overnight Build

- [ ] `npm install` succeeds.
- [ ] `npm run build` succeeds and outputs `main.js`.
- [ ] Plugin manifest is desktop-only and has the expected id/name/description.
- [ ] Commands register for sidebar, full tab, and sync.
- [ ] Settings persist and do not expose token values.
- [ ] OAuth code path is implemented with PKCE, loopback redirect, state validation, refresh, and disconnect.
- [ ] Calendar list and event list API clients compile and handle 401 retry once.
- [ ] Sidebar compact view renders mini month and agenda states.
- [ ] Full tab renders month, week, day, and agenda states.
- [ ] Event modal supports create/edit/delete payloads with validation.
- [ ] Manual sync and optional interval sync are safe while disconnected.
- [ ] README documents setup, scopes, token storage, and dev commands.
- [ ] Untested manual steps are listed honestly if OAuth credentials or Obsidian dev vault access are unavailable.
