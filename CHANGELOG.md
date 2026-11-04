# Changelog

All notable changes to Patchwork. Versions follow semver, and each section is the source for that tag's GitHub release body.

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
