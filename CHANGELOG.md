# Changelog

All notable changes to Patchwork. Versions follow semver, and each section is the source for that tag's GitHub release body.

## [1.8.1] - 2026-11-08

Two fixes for Android: a new wallpaper palette now applies without restarting Patchwork, and the Reorder Columns sheet lets its rows be dragged.

### Fixed

- Android applies a new Material You wallpaper palette as soon as it changes. The app used to keep the old system colours until it was killed, because MainActivity handled the palette change itself.
- Reorder Columns on Android drags the column you hold instead of pulling the sheet down. Back, outside taps, and the close button still dismiss the sheet.

## [1.8.0] - 2026-11-07

Patchwork 1.8 keeps working without a connection. Lists and to-dos can live on the device, account data is cached, new items wait in an outbox, and dictation says what is wrong before it records.

### Added

- On-device lists and to-dos, stored only on the phone. Create one from the list form, and move to-dos between device and account lists without breaking subtasks.
- Cached lists and tasks for each CalDAV account, so the app shows the last known content when the network is down.
- A sync outbox for to-dos, GitHub issues, and Jira issues created without a connection. Waiting items show a badge in the task list and a banner with Sync now.
- An Offline & Sync settings screen with on-device lists, every waiting item, per-item errors, Sync now, and discard.
- Account chips in the create-list form, including On this device.

### Changed

- The outbox sends at launch, when the app returns to the foreground, and every 30 seconds while something is waiting.
- Dictation checks for an audio-capable model and a usable connection as the sheet opens. Missing models offer a link to AI settings; offline and weak connections get their own message.
- Audio models that cannot hear voice notes are skipped, and each audio attempt times out after 90 seconds instead of stalling the ladder.
- CalDAV requests time out after 30 seconds, and a dropped connection is retried rather than failing the query.

### Fixed

- Offline-created to-dos keep a fixed iCalendar UID, so a retried upload that already landed is recognised instead of duplicated.
- Completed to-dos serialize as completed when they are created through the outbox.

## [1.7.1] - 2026-11-07

Patchwork 1.7.1 adds column reordering, an optional Boards tab, floating actions on Deck cards and Jira issues, and Markdown notes in board editors.

### Added

- Reorder Deck columns from a drag sheet. Hold a column, drag it to a new place, and save; each moved column gets its new position.
- Open the Reorder Columns sheet from the board toolbar or from Edit Column.
- Delete a Jira issue from the issue screen, with a confirmation. Jira still refuses issues that have subtasks.
- A Boards tab toggle in Appearance. It is on by default.

### Changed

- Deck cards and Jira issues use the same floating Move and Delete bar as tasks.
- Board card descriptions and Jira descriptions render as Markdown and switch to the editor on tap, matching task notes.
- With the Boards tab off, Deck disappears from the native tabs, floating bar, and navigation rail, search stops indexing Deck cards, tasks hide Move to Deck, and Jira settings says the tab is off.

### Fixed

- Deck and issue editors leave room for the floating action bar instead of ending behind it.

## [1.7.0] - 2026-11-07

Patchwork 1.7 makes Jira boards draggable, groups their cards by sprint, and fixes keyboard positioning for settings fields and the floating task bar.

### Added

- Drag cards on a Jira or Deck board. Long-press lifts the card, dragging reorders it within a column or moves it to another column, edge zones auto-scroll the board and the column, and a drop line marks the landing slot.
- Long-press without moving still opens the Move to sheet.
- An All view on Jira boards, with cards grouped by sprint and dashed dividers between groups.
- Sprint filtering. Pick any combination of sprints and the backlog from the filter sheet.
- Jira rank updates when a card moves, so the new order survives a refresh.
- The issue screen shows its sprint even when the issue was opened from search or a link, not just from a board.

### Changed

- New issues created from the All view land in the active sprint.
- Done Jira issues keep the last finished sprint they belonged to instead of falling into the backlog.
- Android settings scroll the focused field above the keyboard after it appears.
- The floating task action bar tracks the keyboard on both platforms and accounts for the Android navigation bar.

### Fixed

- The settings keyboard no longer leaves focused fields hidden below the keys on edge-to-edge Android.
- The task action bar no longer sits behind the keyboard on Android.
- Sprint views resolve back to All when a saved sprint has closed or the board stops reporting sprints.

## [1.6.0] - 2026-11-06

Patchwork 1.6 adds multiple GitHub and Jira logins, a full Jira issue workflow with sprint planning, RelayRoom as an AI gateway, and several default reminders per task.

### Added

- Connect more than one GitHub token or Jira login. Issues, repositories, boards, and token failures stay attributed to the account that owns them.
- Jira sprint and backlog views, with a sprint bar, active and upcoming sprints, and a saved view for each board.
- A Jira issue editor for summary, Markdown description, labels, priority, due date, assignee, status, and sprint. Descriptions convert between Jira's ADF and Markdown, and unsupported ADF blocks keep the description read-only instead of dropping them.
- A New Issue sheet that creates an issue in the chosen board, column, and sprint, with assign-to-me, issue type, priority, and labels.
- RelayRoom as a built-in AI provider: save a gateway key and URL, load live aliases and routed models, and choose Auto, Subscription, or API-key routing per model.
- Gateway-reported reasoning levels and capabilities for RelayRoom models, with feature tags on drafts, refinement, photo imports, and dictation.
- Up to five default reminders per task, from at the due time to one week before. Each due task gets one notification per reminder.
- Native iOS search, menus, large titles, and glass toolbars on the Boards and issue screens.

### Changed

- Deck cards use the same title, Markdown notes, detail rows, and primary action pieces as Jira issues.
- iOS 26 uses transparent Liquid Glass stack headers and the system tab bar, with filled symbols for the selected tab.
- iOS empty states use SwiftUI's ContentUnavailableView with native glass buttons.
- Bottom sheets on edge-to-edge Android size themselves to the physical screen and use the Material 3 emphasized slide.
- Existing single-account GitHub and Jira credentials migrate on first read. The old reminder lead time migrates into a one-item reminder list.

### Fixed

- GitHub repositories visible to several accounts are listed once, under an account that can write to them.
- A revoked GitHub or Jira token expires only the account that used it.
- RelayRoom requests no longer depend on a local client checkout, so release builds are self-contained.
- Jira board tiles load project avatars with the right login's auth headers.
- The iOS floating action buttons clear the native tab bar.

### Removed

- The old Deck card form and its previous/next column buttons.

## [1.5.0] - 2026-11-05

Patchwork 1.5 turns Boards into one place for Nextcloud Deck and Jira, adds voice dictation, renders task notes as Markdown, and uses the extra room on tablets and foldables.

### Added

- Unified Boards list for Deck and Jira, with starred and recently opened boards, search, and a board switcher.
- Jira Cloud connection with an Atlassian API token. Browse boards and active sprints, move issues through status transitions, create issues in a column, and show issues assigned to you, reported by you, or either.
- Horizontal board view for both sources, with inline card creation, long-press moves, filters for type, priority, and label, and links to open a Jira issue or board in the browser.
- Voice dictation from the Tasks FAB or the add dialog. Record a note, let an audio-capable model transcribe it, and review the staged to-dos before saving.
- Rendered Markdown notes with headings, lists, quotes, tables, code, images, links, and GFM task boxes. Tap notes to edit and tick checkboxes from the rendered view.
- Model-specific thinking levels from models.dev, including Off, Minimal, Low, Medium, High, Extra High, and Max where a provider supports them.
- A Material 3 navigation rail on wide Android windows, the iPad sidebar, and two-pane Tasks and Settings layouts on tablets and unfolded foldables.
- A Navbar labels option for Android's Material bottom navigation.

### Changed

- Task detail is shared by the pushed screen and the split-view pane. Folding the device moves an open to-do into a full screen.
- Lists, search results, and board columns stay at a readable width and meet at the hinge on foldables.
- Provider rows use real brand marks instead of generic glyphs.
- iOS switches to system empty states, SF Symbols, a Liquid Glass FAB, native sheet titles, Things-style rows, and keyboard-aware action bars.
- Loading states show one spinner by default instead of stacking a linear track.
- `expo-audio` handles recording, `marked` handles Markdown, and a local `patchwork-window` module reads fold posture and hinge bounds.

### Fixed

- Jira boards refresh and mark the connection expired when a token is revoked.
- The floating tab bar gets out of the way while typing, except when it holds the search field.
- Android bottom sheets pin to the physical screen on edge-to-edge devices.
- Tasks opened without stack history get a back button to their tab root.
- Voice recordings that are silent, empty, or longer than 15 MB are rejected before a model call.

### Removed

- The old single-board kanban components and per-platform Deck cards.

## [1.4.0] - 2026-11-05

Patchwork 1.4 is the Things-style redesign. Tasks, search, settings, GitHub issues, and AI import now share one to-do language, and home screen widgets arrive on Android.

### Added

- Inline task cards on the Tasks screen: edit the title, live Markdown notes, list, tags, due date, priority, and checklist without opening another page.
- Today, Upcoming, Anytime, and Someday buckets, a list switcher sheet, and tag filter tabs.
- Android home screen widgets for Today, Upcoming, and List, built with `expo-widgets` and the wallpaper Material You palette.
- A full-screen AI review editor for drafts and OCR imports, with list, tags, date, priority, and checklist fields editable before creating.
- A thinking budget for reasoning models (Auto, Low, Medium, High), mapped to Gemini `thinkingLevel` and OpenAI `reasoningEffort`.
- Labels when creating GitHub issues, plus an issue detail page with inline body editing.
- Scoped task and issue results in Search, with filter chips and in-place task opening.

### Changed

- Settings rebuilt on shared inset-grouped iOS and Material 3 Expressive layouts, covering accounts, appearance, notifications, AI providers, and repositories.
- Task detail and the add dialog rebuilt around a breadcrumb, live Markdown notes, a checklist, and one details group for date, priority, list, and Deck.
- Android floating navbar restyled after Google Photos. Every tab is labeled, the active tab gets a tonal pill and icon, and the capsule is 64dp.
- iOS widgets restyled after Things 3 with Liquid Glass backgrounds, an add button, overdue emphasis, and day groups in Upcoming.
- App upgraded to Expo SDK 58 (React Native 0.88, React 19.3).
- AI prompts now receive local time, UTC offset, and weekday so relative dates resolve in the device's zone.
- GitHub issues and tasks share the same checkbox, row, and section components.

### Fixed

- Material You palettes with 8-digit hex values no longer break tinted backgrounds, and off-tone containers are rebuilt from the accent color.
- The splash overlay covers the window during the native splash handoff, and the native splash waits for the overlay to lay out.
- Stacked screens no longer crash from hooks running inside the navigator's `SceneView` when a screen gains the themed header options after mount.
- Android loading states use a single Material 3 indicator instead of a bubble inside a ring.
- The FAB clears the iOS tab bar and is reachable by screen readers on Android.
- Widget helpers survive `expo-widgets` serialization, and Live Activities no longer load on Android.
- Xcode 27 accepts the app icon fill format.

### Breaking changes

- GitHub now connects with a fine-grained personal access token only. Credentials from the old GitHub App sign-in are reported as expired, so paste a token in Settings to reconnect.
- The AI tab is gone. Drafts and photo imports open from the add dialog and review at the root `ai-review` screen.

### Removed

- GitHub App device flow, token refresh, and OAuth availability checks.
- The separate new GitHub issue screen, issue create form, and repository picker.
- The old task list menu and create destination control.
- `react-native-android-widget` in favor of `expo-widgets`.

## [1.3.0] - 2026-09-09

- Rename and delete task lists from the in-app list menu, with confirmation before deleting a list's tasks.
- Redesigned light and dark splash screens, with an in-app animation that continues the native splash and no blank frame between them.
- Startup gives up on saved settings after four seconds and starts on defaults instead of sitting on the splash.
- Native and web API modules are split behind Metro extensions so a missing symbol fails the build instead of appearing as `undefined`.
- Fixed the web health check path and a web color-scheme crash.

## [1.2.0] - 2026-07-27

- Create GitHub issues from the app, with a repository picker, permission-aware create, and assign-to-me support.
- Switch between Task and GitHub issue while drafting, keeping the typed title and body across the swap.
- Tag picker moved to a root sheet so it stays reachable over the create sheet.
- Hardened CalDAV VTODO parsing for multi-value tags, triggers, and timezones.
- Task form priority snapped to the UI buckets and calendar permission requested lazily.

## [1.1.0] - 2026-07-26

- GitHub issues rebuilt with on-device auth, paginated multi-repo sync, rate-limit and partial-sync warnings, and issue close/reopen.
- AI provider settings with a shared model catalog, per-provider screens, and custom OpenAI-compatible endpoints.
- Shared design system for buttons, empty states, loading, sheets, and glass surfaces.
- Material 3 palettes, high contrast, motion tokens, and a master haptics switch.
- Floating pill tab bar on Android and scroll-minimized tab chrome.

## [1.0.0] - 2026-07-25

- First production Android APK, built with EAS and published to GitHub Releases and F-Droid.
