import AppIntents
import Foundation

// Siri and Shortcuts actions for Patchwork.
//
// plugins/with-shortcuts.js copies this file into the main app target at
// prebuild. It can't live in the PatchworkShortcuts pod: Xcode only extracts
// App Intents metadata (the phrases Siri listens for) from the app target
// itself, not from a static library linked into it.
//
// Every intent opens the app and leaves an action in UserDefaults. The
// PatchworkShortcuts module hands the queue to JS, which navigates or creates
// the to-do with the same code the app's own screens use. The key and the
// notification name must match PendingActionStore in
// modules/patchwork-shortcuts/ios/PatchworkShortcutsModule.swift.

private enum PatchworkPendingActions {
  static let key = "patchwork.shortcuts.pending"
  static let notification = Notification.Name("PatchworkShortcutsPendingAction")

  static func send(_ action: [String: Any]) {
    guard
      let data = try? JSONSerialization.data(withJSONObject: action),
      let json = String(data: data, encoding: .utf8)
    else { return }
    let defaults = UserDefaults.standard
    var queue = defaults.stringArray(forKey: key) ?? []
    queue.append(json)
    defaults.set(queue, forKey: key)
    NotificationCenter.default.post(name: notification, object: nil)
  }

  static func open(_ url: String) {
    send(["type": "open", "url": url])
  }
}

@available(iOS 16.0, *)
struct AddTodoIntent: AppIntent {
  static var title: LocalizedStringResource { "Add To-Do" }
  static var description: IntentDescription {
    IntentDescription("Adds a to-do to Patchwork, in the list open on the Tasks screen or your first list.")
  }
  static var openAppWhenRun: Bool { true }

  @Parameter(title: "To-do", requestValueDialog: "What's the to-do?")
  var todo: String

  @Parameter(title: "Notes")
  var notes: String?

  @Parameter(title: "Due")
  var due: Date?

  @Parameter(title: "List", description: "The name of a Patchwork list. A partial name works.")
  var list: String?

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let title = todo.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty else {
      throw $todo.needsValueError("What's the to-do?")
    }
    var action: [String: Any] = ["type": "createTask", "title": title]
    if let notes, !notes.isEmpty { action["notes"] = notes }
    if let due { action["dueAt"] = ISO8601DateFormatter().string(from: due) }
    if let list, !list.isEmpty { action["list"] = list }
    PatchworkPendingActions.send(action)
    return .result(dialog: "Adding \(title) to Patchwork.")
  }
}

@available(iOS 16.0, *)
struct BrainDumpIntent: AppIntent {
  static var title: LocalizedStringResource { "Brain Dump" }
  static var description: IntentDescription {
    IntentDescription("Opens a brain dump in Patchwork to empty your head before sorting it.")
  }
  static var openAppWhenRun: Bool { true }

  @MainActor
  func perform() async throws -> some IntentResult {
    PatchworkPendingActions.open("patchwork:///brain-dump")
    return .result()
  }
}

@available(iOS 16.0, *)
struct OpenTodayIntent: AppIntent {
  static var title: LocalizedStringResource { "Open Today" }
  static var description: IntentDescription {
    IntentDescription("Opens Patchwork on the to-dos due today.")
  }
  static var openAppWhenRun: Bool { true }

  @MainActor
  func perform() async throws -> some IntentResult {
    PatchworkPendingActions.open("patchwork:///?smart=today")
    return .result()
  }
}

@available(iOS 16.0, *)
struct DictateTodoIntent: AppIntent {
  static var title: LocalizedStringResource { "Dictate To-Dos" }
  static var description: IntentDescription {
    IntentDescription("Opens Patchwork's voice dictation, which turns what you say into to-dos.")
  }
  static var openAppWhenRun: Bool { true }

  @MainActor
  func perform() async throws -> some IntentResult {
    PatchworkPendingActions.open("patchwork:///?dictate=1")
    return .result()
  }
}

@available(iOS 16.0, *)
struct PatchworkAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddTodoIntent(),
      phrases: [
        "Add a to-do in \(.applicationName)",
        "Add a task in \(.applicationName)",
        "New \(.applicationName) to-do",
      ]
    )
    AppShortcut(
      intent: BrainDumpIntent(),
      phrases: [
        "Brain dump in \(.applicationName)",
        "Start a brain dump in \(.applicationName)",
      ]
    )
    AppShortcut(
      intent: OpenTodayIntent(),
      phrases: [
        "Open my Today in \(.applicationName)",
        "What's due today in \(.applicationName)",
        "Show today in \(.applicationName)",
      ]
    )
    AppShortcut(
      intent: DictateTodoIntent(),
      phrases: [
        "Dictate to-dos in \(.applicationName)",
        "Dictate in \(.applicationName)",
      ]
    )
  }
}
