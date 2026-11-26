import ExpoModulesCore

/// Actions that reach the app from outside JS (a home-screen quick action, a
/// Siri / Shortcuts App Intent) wait here until JS asks for them.
///
/// The App Intents in the main app target (see app-intents/ in this module,
/// copied in by plugins/with-shortcuts.js) write the same UserDefaults key and
/// post the same notification. They can't import this pod, so the key and
/// notification name are plain strings that both sides repeat.
enum PendingActionStore {
  static let key = "patchwork.shortcuts.pending"
  static let notification = Notification.Name("PatchworkShortcutsPendingAction")

  static func append(_ action: [String: Any]) {
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

  static func drain() -> [[String: Any]] {
    let defaults = UserDefaults.standard
    let queue = defaults.stringArray(forKey: key) ?? []
    if queue.isEmpty { return [] }
    defaults.removeObject(forKey: key)
    return queue.compactMap { json in
      guard let data = json.data(using: .utf8) else { return nil }
      return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
  }
}

public class PatchworkShortcutsModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("PatchworkShortcuts")

    Events("onPendingAction")

    Function("consumePendingActions") { () -> [[String: Any]] in
      PendingActionStore.drain()
    }

    // Pinned shortcuts and AppFunctions are Android features. These keep the
    // JS API the same on both platforms.
    Function("canPinShortcuts") { false }

    AsyncFunction("pinShortcut") { (_: [String: Any]) -> Bool in
      false
    }

    Function("setAssistantSnapshot") { (_: String) in }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: PendingActionStore.notification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onPendingAction", [:])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }
  }
}
