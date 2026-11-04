# Patchwork - Dev Centric Tasks Application

This is a developer-centric tasks application designed to unify task management across multiple engineering systems. It integrates CalDAV, Kanban boards, and issues/messages from developer tools like GitHub, Slack, and Jira, powered by on-device and proxy-based AI task generators and analyzers.

## Android Downloads and F-Droid

Android APK releases are built with EAS, attached to GitHub Releases, and mirrored into a self-hosted F-Droid-compatible repository on `tashif.codes`.

| | |
|---|---|
| F-Droid install page | https://tashif.codes/fdroid |
| F-Droid repo URL | https://tashif.codes/fdroid/repo |
| Direct APK | GitHub Releases → latest |

Release notes live in [CHANGELOG.md](CHANGELOG.md). The release workflow reads the matching version section from that file when it publishes the GitHub Release.

### Cut a release

```bash
# from a clean main with the code you want shipped
git tag v1.0.0
git push origin v1.0.0
```

That starts [`.github/workflows/release-apk.yml`](.github/workflows/release-apk.yml):

1. Sets `app.json` / `package.json` version from the tag
2. Builds a production APK on EAS (`github-release` profile, auto-incremented `versionCode`)
3. Publishes a GitHub Release with the APK + SHA-256 checksum
4. Dispatches F-Droid publishing on `tashifkhan/tashif.codes`

You can also run **Actions → Release Android APK → Run workflow** and pass a tag like `v1.0.0`.

### Required GitHub secrets (this repo)

| Secret | Purpose |
|---|---|
| `EXPO_TOKEN` | Expo account token for EAS cloud builds |
| `TASHIF_CODES_WORKFLOW_TOKEN` | Fine-grained PAT with **Actions: Read and write** on `tashifkhan/tashif.codes` (optional; skips F-Droid if unset) |

### User install (F-Droid)

1. Open F-Droid on Android
2. Settings → Repositories → add `https://tashif.codes/fdroid/repo`
3. Refresh repositories and install **Patchwork**
4. Or download the APK from the latest GitHub Release


## Repository Structure

The project is structured into two main parts:
* [app/](file:///Users/taf/Projects/PatchWork/app): A universal Expo React Native frontend supporting iOS, Android, and Web platforms.
* [proxy/](file:///Users/taf/Projects/PatchWork/proxy): A FastAPI Python backend proxy that handles CORS limitations for Web-based interfaces and wraps AI API integrations.

## Architecture and Design Decisions

The application employs a dual-sync architecture to optimize security, credentials storage, and platform performance:
* Native Clients (iOS, Android): Interact directly with CalDAV and Nextcloud Deck REST APIs. They leverage on-device secure storage for account credentials and API keys. The native app utilizes the Vercel AI SDK to communicate directly with AI models using local API keys.
* Web Client: Routes requests through the FastAPI proxy backend. The proxy solves CORS restrictions that prevent browser-based React Native Web clients from directly querying CalDAV and Nextcloud servers. It also stores credentials and AI API keys on the server, avoiding shipping secrets to the browser.

## Feature Checklists

The following checklists highlight what has been completed, what is in progress, and what remains to be implemented.

### 1. CalDAV Task Support
* [x] Retrieve task lists (calendars) from Nextcloud/CalDAV.
* [x] Retrieve task items from lists.
* [x] Parse task structures, including tags (categories), due dates, priorities, and Markdown descriptions.
* [x] Parse hierarchical structures (parent and child subtasks via RELATED-TO mapping).
* [x] Support task creation on CalDAV server.
* [x] Secure local credential management on mobile devices.
* [x] Rename or delete a task list (calendar).
* [x] Implement task updates with `If-Match` ETag collision handling.
* [x] Implement task deletion (DELETE requests).
* [x] Implement local push notification sync on mobile clients.

### 2. Nextcloud Deck (Kanban) Support
* [x] Access Nextcloud Deck board lists via REST API.
* [x] Retrieve boards with stacks and cards.
* [x] Support board, stack, and card creation.
* [x] Support stack and card updating, deletion, and reordering.
* [x] Filter out Deck-synced CalDAV calendars from normal todo lists (using "Deck:" displayname filtering).
* [x] Render boards horizontally on desktop and vertically on mobile.
* [x] Implement fully interactive drag-and-drop column card reordering UI in Expo app.
* [x] Complete UI forms for managing columns/stacks and cards directly.

### 3. GitHub Issues Integration
* [x] Fetch and validate public GitHub repositories without login.
* [x] Connect the native Expo app through GitHub App device flow or a fine-grained Personal Access Token.
* [x] Store GitHub credentials locally with Expo SecureStore; GitHub traffic does not pass through the proxy.
* [x] Paginate and render GitHub issues with partial-sync and rate-limit warnings.
* [x] Support independently loadable issue details and permission-aware close/reopen actions.

### 4. Slack List and Reminders Integration
* [ ] Implement backend proxy service connecting to Slack Web API and Slack Lists.
* [ ] Create OAuth flow or Bot Token settings in the configuration store.
* [ ] Sync Slack reminders and saved items as task cards.
* [ ] Build interactive quick-action to convert Slack notifications into todo cards.

### 5. Jira Tickets Integration
* [ ] Implement Jira REST API service wrapper in the backend proxy.
* [ ] Create configuration settings for Jira Cloud/On-Premise hosts and API tokens.
* [ ] Fetch assigned Jira tickets and project cards.
* [ ] Render ticket states (In Progress, Done) and synchronize state transitions.

### 6. AI-Assisted Tasks and Analysis
* [x] Implement AI OCR task parser in the backend proxy (reading photos of notes and mapping to structured task models).
* [x] Implement AI refinement (altering task lists via natural language prompts).
* [x] Implement AI drafting (generating structured tasks from natural language requests).
* [x] Create a dedicated on-device AI integration using the Vercel AI SDK for native clients.
* [x] Build an AI staging and review screen in the frontend to edit generated tasks before saving them to CalDAV.
* [ ] Implement multi-modal AI task analysis (e.g., productivity patterns, deadline bottlenecks, and task descriptions refinement).

### 7. Customizability
* [x] Implement dynamic colors (Material You) on Android clients.
* [x] Support custom Accent color selection on iOS and fallback Android layouts.
* [x] Support OLED pure-black theme toggle for dark mode.
* [x] Build setting screens for choosing and toggling active AI models from various providers (OpenAI, Anthropic, Google, DeepSeek, OpenRouter, NVIDIA, OpenCode Zen).
* [x] Support adding custom OpenAI-compatible endpoints directly in settings.

## Getting Started

### Backend Proxy Setup

The backend proxy uses the `uv` tool for package and runtime management.

1. Navigate to the proxy directory:
   ```bash
   cd proxy
   ```
2. Create and fill out the `.env` file based on `proxy/.env.example`:
   ```bash
   cp .env.example .env
   ```
3. Run the development server:
   ```bash
   uv run uvicorn main:app --reload
   ```

### Frontend App Setup

The frontend app uses the `bun` package manager.

1. Navigate to the app directory:
   ```bash
   cd app
   ```
2. Create and fill out the `.env` file:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   bun install
   ```
4. Start the Expo development server:
   ```bash
   bun start
   ```
5. From the Expo CLI menu, press `w` to run in web, `a` for Android emulator, or `i` for iOS simulator.
