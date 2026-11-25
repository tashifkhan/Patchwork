# Patchwork Frontend App (Expo React Native)

This directory contains the native app for the developer-centric tasks application. It is built on Expo and React Native, supporting iOS and Android from a single codebase.

## Android Release Distribution

Production APKs are published through GitHub Releases and mirrored into a self-hosted F-Droid-compatible repository on `tashif.codes`.

User-facing install links:

* F-Droid install page: `https://tashif.codes/fdroid`
* F-Droid repository URL: `https://tashif.codes/fdroid/repo`
* Latest GitHub APK release: `https://github.com/tashifkhan/Patchwork/releases/latest`

Build profile:

* `eas.json` profile: `github-release`
* Android output: APK
* Gradle command: `:app:assembleRelease -PreactNativeArchitectures=arm64-v8a`

Build a signed APK on your machine from the release source:

```bash
bun x eas-cli build --platform android --profile github-release --local --non-interactive --output ./Patchwork.apk
```

Publish a local build:

1. Tag the release commit and push the tag.
2. Create a GitHub Release with the notes from `CHANGELOG.md`, the signed APK, and its SHA-256 checksum.
3. Run **Publish F-Droid Repo** in GitHub Actions with the release tag. It imports the APK into the `tashif.codes` F-Droid repo.

To build on EAS cloud, run **Release Android APK** in GitHub Actions with an existing tag. The workflow publishes the APK and dispatches the F-Droid import when its token is configured.

* `EXPO_TOKEN` authenticates the cloud build.
* `TASHIF_CODES_WORKFLOW_TOKEN` authorizes the F-Droid import.

## Directory Layout

* [src/app/](src/app) contains Expo Router routes and root providers.
* [src/features/](src/features) contains the Tasks, Boards, GitHub, Search, AI, and Sync workflows. Each feature owns its screens, state, and TanStack Query hooks where applicable.
* [src/api/](src/api) contains the CalDAV, Nextcloud Files, Deck, Jira, GitHub, and AI provider clients.
* [src/components/](src/components) contains shared UI and platform-specific controls. [src/lib/](src/lib) contains shared utilities and device services.
* [src/widgets/](src/widgets) contains snapshots and platform widget views. [modules/](modules) and [plugins/](plugins) contain local native modules and Expo prebuild configuration.

## Technology Stack and Dependencies

The client application utilizes the following core libraries:
* Expo SDK 58.
* React Native 0.88.
* NativeWind (v5 preview) and Tailwind CSS (v4): Utility-first styling framework.
* Zustand (v5): Lightweight state management.
* React Query / TanStack Query (v5): Async state cache and synchronization.
* Vercel AI SDK (`ai`): Integrates LLM interfaces directly on native clients.
* Fuse.js (v7): Fuzzy client-side search index.
* Expo Notifications: Registers and schedules reminder alarms.

## Customizability Capabilities

The app focuses heavily on user personalization, particularly via the settings interface:
* Theme customizer: Light, dark, and system-wide modes.
* Material You (Android): Derive theme color palette from the system wallpaper.
* Accent colors (iOS/Fallback): Define specific accent colors to custom-brand the UI.
* Pure Black mode: Force deep black surfaces to optimize contrast and power consumption on OLED displays.
* Custom AI Engine Registry: Users can fetch active model lists from online repositories (`models.dev`), save individual API keys, toggle vision capabilities, and create new provider targets pointing to custom OpenAI-compatible proxy and local API servers (like Ollama or LocalAI).

## Status Checklist

### CalDAV Integration
* [x] Sync task lists and checkoff statuses.
* [x] Subtask nesting (collapsible tree view utilizing RELATED-TO fields).
* [x] Priority adjustments and due dates setting.
* [x] Tag-based filtering chips.
* [x] Rename or delete a task list from the app.
* [x] Stale cache/conflict resolution notification in UI.
* [x] Local push notifications trigger.

### Kanban Deck Integration
* [x] Display board lists.
* [x] Horizontal scrolling column structure on Desktop.
* [x] Vertical card list rendering with assignees, labels, and descriptions.
* [x] Card detail overlay showing card properties.
* [x] Drag-and-drop card movement UI.
* [x] Form-based column creation and deletion in UI.

### AI Import
* [x] Draft planning input (turn general sentences into structured checkoff task drafts).
* [x] Refine tasks input (alter lists using natural language feedback).
* [x] Photo/Screenshot OCR (select photo from image gallery, parse with vision models).
* [x] Interactive staging editor (review, modify lists, check items, change list destinations before saving).
* [ ] Analytical summary dashboard.

### Third-Party Connectors (GitHub, Slack, Jira)
* [x] Native GitHub App device flow with on-device SecureStore credentials.
* [x] Validated anonymous public repositories and virtualized authenticated repository selection.
* [x] Paginated GitHub issues, independent issue details, partial-sync warnings, and close/reopen actions.
* [ ] Slack and Jira UI integration panels inside settings.
* [ ] Synced list tabs.
* [ ] Two-way update actions for all connected providers.

## Setup Instructions

### Prerequisites

Make sure you have [Bun](https://bun.sh) installed.

### Installation

1. Navigate to the app directory:
   ```bash
   cd app
   ```
2. Copy the template env variables and fill them in:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   bun install
   ```

### Execution

* Start the bundler:
   ```bash
   bun start
   ```
* Run on specific platforms:
   ```bash
   bun android  # Run in Android emulator
   bun ios      # Run in iOS simulator
   ```
* Check for code problems or type errors:
   ```bash
   bun lint
   ```
* Run integration tests:
   ```bash
   bun test:caldav
   ```
