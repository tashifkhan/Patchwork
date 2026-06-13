# Patchwork Backend Proxy (FastAPI)

This directory contains the FastAPI backend proxy application for the developer-centric tasks app.

## Purpose of the Proxy

The proxy serves two main technical requirements:
1. CORS Resolution: Browser-based React Native Web instances cannot query CalDAV or Nextcloud servers directly due to Same-Origin policy restrictions. The proxy routes these requests from a CORS-approved origin.
2. Secrets Encapsulation: The proxy securely wraps external API calls (e.g. Gemini, LiteLLM, Nextcloud calendars) using environment variables on the host. This prevents sending usernames, app passwords, or API keys directly to the web client.

## Directory Structure

* [app/core/](file:///Users/taf/Projects/PatchWork/proxy/app/core): Configuration settings.
  * [config.py](file:///Users/taf/Projects/PatchWork/proxy/app/core/config.py): Pydantic settings schema to validate environment variables.
  * [application.py](file:///Users/taf/Projects/PatchWork/proxy/app/core/application.py): FastAPI application factory module configuring CORS settings.
* [app/clients/](file:///Users/taf/Projects/PatchWork/proxy/app/clients): Connectors to target service providers.
  * [caldav_client.py](file:///Users/taf/Projects/PatchWork/proxy/app/clients/caldav_client.py): Unified HTTP wrapper for basic auth and DAV actions.
  * [litellm_client.py](file:///Users/taf/Projects/PatchWork/proxy/app/clients/litellm_client.py): LiteLLM router wrapper supporting JSON object outputs.
  * [gemini_client.py](file:///Users/taf/Projects/PatchWork/proxy/app/clients/gemini_client.py): SDK client for accessing Google Gemini models directly via google-genai.
* [app/services/](file:///Users/taf/Projects/PatchWork/proxy/app/services): Intermediate service logic.
  * [task_service.py](file:///Users/taf/Projects/PatchWork/proxy/app/services/task_service.py): Handlers for creating XML payloads and requesting CalDAV listings.
  * [caldav_codec.py](file:///Users/taf/Projects/PatchWork/proxy/app/services/caldav_codec.py): VTODO iCalendar (ics) parsing and generation utility based on vobject.
  * [deck_service.py](file:///Users/taf/Projects/PatchWork/proxy/app/services/deck_service.py): Business actions mapping Nextcloud Deck stacks and cards to JSON structures.
  * [ai_service.py](file:///Users/taf/Projects/PatchWork/proxy/app/services/ai_service.py): Text prompts assembly and output structure validation for OCR, drafting, and refining.
* [app/model/](file:///Users/taf/Projects/PatchWork/proxy/app/model): Pydantic entity models.
  * [task.py](file:///Users/taf/Projects/PatchWork/proxy/app/model/task.py): Task definitions, validators, and XML encoders.
  * [deck.py](file:///Users/taf/Projects/PatchWork/proxy/app/model/deck.py): Board schema wrapper.
  * [ai.py](file:///Users/taf/Projects/PatchWork/proxy/app/model/ai.py): Request payloads and models for generated tasks.
  * [health.py](file:///Users/taf/Projects/PatchWork/proxy/app/model/health.py): Health response schemas.
* [app/router/](file:///Users/taf/Projects/PatchWork/proxy/app/router): API endpoints wiring.
  * [dependencies.py](file:///Users/taf/Projects/PatchWork/proxy/app/router/dependencies.py): Centrally injected service providers.
  * [health.py](file:///Users/taf/Projects/PatchWork/proxy/app/router/health.py): Check status check.
  * [tasks.py](file:///Users/taf/Projects/PatchWork/proxy/app/router/tasks.py): Task collection retrievals and items instantiation.
  * [deck.py](file:///Users/taf/Projects/PatchWork/proxy/app/router/deck.py): Boards and column cards mutations.
  * [ai.py](file:///Users/taf/Projects/PatchWork/proxy/app/router/ai.py): Vision file-upload handlers and completion pathways.

## API Specification

* GET /health: Simple readiness check.
* GET /api/task-lists: Lists all active task lists (excluding lists labeled with "Deck:").
* POST /api/task-lists: Creates a new CalDAV task calendar.
* GET /api/tasks: Returns all task items mapped into hierarchical tree collections (child subtasks are nested inside parent task children arrays).
* POST /api/tasks: Instantiates a new VTODO card on the target calendar list.
* PATCH /api/tasks/{task_id}: (Status: 501 Not Implemented) Planned pathway for editing tasks and resolving concurrency collisions via ETag headers.
* DELETE /api/tasks/{task_id}: (Status: 501 Not Implemented) Planned pathway for task deletion.
* GET /api/deck/boards: Retrieves lists of active Kanban boards.
* POST /api/deck/boards: Creates a board and inserts default columns ("To do", "Doing", "Done").
* GET /api/deck/boards/{board_id}: Resolves cards and columns for the selected board.
* POST /api/deck/boards/{board_id}/stacks: Appends a column to a board.
* PATCH /api/deck/boards/{board_id}/stacks/{stack_id}: Edits column information.
* DELETE /api/deck/boards/{board_id}/stacks/{stack_id}: Deletes a column.
* POST /api/deck/boards/{board_id}/stacks/{stack_id}/cards: Creates a new card in a column.
* PATCH /api/deck/boards/{board_id}/stacks/{stack_id}/cards/{card_id}: Modifies card properties.
* PUT /api/deck/boards/{board_id}/stacks/{stack_id}/cards/{card_id}/reorder: Moves cards across stacks or within a single stack order.
* DELETE /api/deck/boards/{board_id}/stacks/{stack_id}/cards/{card_id}: Deletes card items.
* POST /api/ai/ocr: Extracts structured task objects from a base64-encoded image string.
* POST /api/ai/ocr-upload: Handles multipart image files upload for OCR processing (checks max upload limit).
* POST /api/ai/draft-tasks: Generates staged tasks from user input strings.
* POST /api/ai/refine-tasks: Modifies list structures via prompts.

## Development and Verification

### Environmental Variables Configuration

Create a `.env` file in this directory and populate the required settings:
```env
NEXTCLOUD_BASE_URL=https://your-nextcloud-instance.com
NEXTCLOUD_USERNAME=your-username
NEXTCLOUD_APP_PASSWORD=your-app-password
GEMINI_API_KEY=your-gemini-key
LITELLM_API_KEY=your-litellm-key
LITELLM_MODEL=gemini/gemini-2.5-flash
LITELLM_BASE_URL=https://api.litellm.example.com
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
```

### Verification Scripts

Run the verification checklist locally:
1. Verify coding style, lint patterns, and import standards using Ruff:
   ```bash
   uv run ruff check .
   ```
2. Execute tests:
   ```bash
   uv run pytest
   ```
3. Test start-up routing structure:
   ```bash
   uv run python -c "from app.main import app; print(sorted(route.path for route in app.routes if route.path.startswith('/api') or route.path == '/health'))"
   ```
4. Start the server locally:
   ```bash
   uv run uvicorn main:app --reload
   ```
