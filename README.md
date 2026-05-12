# Google Calendar Plugin for Obsidian

View and edit Google Calendar events directly inside Obsidian. This desktop plugin connects to Google Calendar via OAuth, renders events in a native Obsidian-themed UI, and supports a compact right-sidebar view as well as a full main-tab view.

## Features

- Connect a Google account through Google OAuth 2.0 with PKCE (no client secret required)
- View events in month, week, day, and agenda/list layouts
- Compact sidebar view with mini month calendar and upcoming agenda
- Create, edit, and delete events
- Native Obsidian theming using CSS variables — works with light and dark themes
- Automatic token refresh

## Setup

### 1. Prerequisites

- [Obsidian](https://obsidian.md) (desktop, version 1.x)
- Node.js 18 or later
- npm

### 2. Install the plugin from source

```bash
git clone <repository-url>
cd obsidian-google-calendar
npm install
```

### 3. Configure Google Cloud OAuth (required before connecting)

1. Open the [Google Cloud Console](https://console.cloud.google.com).
2. Select or create a project.
3. Go to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
5. Application type: **Desktop app**.
6. Give the client a name and click **Create**.
7. Copy the **Your Client ID** value — you will paste it into the plugin settings.
8. No redirect URIs are needed for this plugin. It uses a local loopback redirect (`http://127.0.0.1:<port>`) that is set dynamically at runtime.

### 4. Enable the plugin in Obsidian

1. Copy `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/google-calendar/`.
2. Alternatively, for development, copy the files and enable the plugin in **Settings > Community plugins**.
3. Open **Settings > Google Calendar** and paste your Google OAuth Client ID.
4. Click **Connect** and complete the Google sign-in flow in your system browser.

### 5. Development commands

```bash
npm run dev      # Watch mode: rebuilds on file changes
npm run build    # Production build, outputs main.js
```

## OAuth Scopes

The plugin requests only the following Google Calendar scopes:

| Scope | Purpose |
|---|---|
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Read the user's calendar list |
| `https://www.googleapis.com/auth/calendar.events` | Create, edit, and delete calendar events |

No other Google APIs are accessed.

## Token Storage

Access tokens, refresh tokens, and related token metadata are stored in Obsidian's local plugin data storage (`loadData()` / `saveData()`). They are **not** stored in the operating system's keychain or credential manager.

This means:
- Tokens persist between Obsidian sessions.
- Tokens are stored in plain text in the plugin data folder — do not use this plugin on a shared or untrusted machine.
- Future versions may add OS keychain storage as a hardening option.

## Release Files

To install a release build, ensure these three files are present in the plugin directory:

| File | Purpose |
|---|---|
| `manifest.json` | Plugin metadata (id, name, description, desktop-only flag) |
| `main.js` | Compiled JavaScript bundle |
| `styles.css` | Plugin styles |

## Current MVP Non-Goals / Known Limitations

The first release is intentionally scoped. The following are **not** included in this MVP:

- **Mobile support** — plugin is desktop-only (`isDesktopOnly: true` in `manifest.json`)
- **Multiple Google accounts** — one account at a time
- **Real-time Google push notifications** — sync is pull-only, manual or on a configurable interval
- **Complex recurrence editing UI** — basic recurring events are supported through Google's own recurrence fields, but no special editor UI is provided
- **Guest availability lookup** — not included
- **Google Meet creation** — not included
- **OS keychain token storage** — tokens are in local plugin data; see Token Storage section
- **Pixel-perfect Google Calendar clone** — layouts are inspired by Google Calendar but adapted for Obsidian's UI conventions

## Tested Flows

The following flows have been implemented and verified through build and code review:

- OAuth Authorization Code flow with PKCE, loopback redirect, state validation, and token refresh
- Calendar list and event list API calls with 401 retry
- Compact sidebar view (mini month + agenda)
- Full tab view (month, week, day, agenda)
- Event create, edit, and delete modal

## Untested Flows

Some Google integration flows could not be tested in this repository because they require real OAuth credentials and an active Google Calendar:

- End-to-end OAuth connection with a live Google account
- Creating, editing, and deleting an event against a real calendar
- Token refresh through a full OAuth cycle
- Calendar selection and multi-calendar viewing with real data

These flows are fully implemented and will work once a valid OAuth Client ID and Google account are connected in the plugin settings.
