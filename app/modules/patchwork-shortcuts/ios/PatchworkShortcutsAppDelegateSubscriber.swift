import ExpoModulesCore

/// Home-screen quick actions (long-press the app icon). The items are static,
/// in Info.plist (UIApplicationShortcutItems, written by
/// plugins/with-shortcuts.js), and each carries a `url` in its userInfo.
///
/// Under the scene life cycle `ExpoAppSceneDelegate` forwards both the
/// cold-start item (from the connection options) and the warm one to app
/// delegate subscribers, so this one method covers both. The URL is queued
/// rather than opened: on a cold start JS isn't running yet, and the queue is
/// read once the router has mounted.
public class PatchworkShortcutsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard let url = shortcutItem.userInfo?["url"] as? String else {
      completionHandler(false)
      return
    }
    PendingActionStore.append(["type": "open", "url": url])
    completionHandler(true)
  }
}
