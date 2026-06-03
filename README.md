# PatchWork - Dev Centric Tasks Application

This is a developer-centric tasks application designed to unify task management across multiple engineering systems. It integrates CalDAV, Kanban boards, and issues/messages from developer tools like GitHub, Slack, and Jira, powered by on-device and proxy-based AI task generators and analyzers.

## Android Downloads and F-Droid

Android APK releases are built from this repository with EAS, attached to GitHub Releases, and then mirrored into a self-hosted F-Droid-compatible repository served by `tashif.codes`.

Install options:

* F-Droid repo page: `https://tashif.codes/fdroid`
* F-Droid repo URL: `https://tashif.codes/fdroid/repo`
* Direct APK downloads: `https://github.com/tashifkhan/caldav-todo/releases/latest`

User install instructions:

1. Open F-Droid on Android.
2. Go to Settings -> Repositories.
3. Add `https://tashif.codes/fdroid/repo`.
4. Refresh repositories and install PatchWork.
5. If F-Droid is not available, download the APK from the latest GitHub Release.


## Repository Structure

The project is structured into two main parts:
* [app/](file:///Users/taf/Projects/caldav-todo/app): A universal Expo React Native frontend supporting iOS, Android, and Web platforms.
* [proxy/](file:///Users/taf/Projects/caldav-todo/proxy): A FastAPI Python backend proxy that handles CORS limitations for Web-based interfaces and wraps AI API integrations.

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
* [ ] Implement task updates (PATCH requests) with ETag collision handling.
* [ ] Implement task deletion (DELETE requests).
* [ ] Implement local push notification sync on mobile clients.

### 2. Nextcloud Deck (Kanban) Support
* [x] Access Nextcloud Deck board lists via REST API.
* [x] Retrieve boards with stacks and cards.
* [x] Support board, stack, and card creation.
* [x] Support stack and card updating, deletion, and reordering.
* [x] Filter out Deck-synced CalDAV calendars from normal todo lists (using "Deck:" displayname filtering).
* [x] Render boards horizontally on desktop and vertically on mobile.
* [ ] Implement fully interactive drag-and-drop column card reordering UI in Expo app.
* [ ] Complete UI forms for managing columns/stacks and cards directly.

### 3. GitHub Issues Integration
* [x] Fetch issues from public GitHub repositories without login.
* [x] Support private repositories through OAuth device flow or Personal Access Token.
* [x] Render GitHub issues in the task list.
* [x] Support closing/reopening authenticated private issues from the app.
* [ ] Implement backend proxy router and service wrappers for the GitHub REST API.

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
