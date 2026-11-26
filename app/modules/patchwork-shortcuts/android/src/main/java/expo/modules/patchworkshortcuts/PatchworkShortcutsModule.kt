package expo.modules.patchworkshortcuts

import android.content.Context
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Pinned home-screen shortcuts for a list or a board, the queue of requests
 * from assistants, and the snapshot AppFunctions answer from.
 *
 * The launcher's long-press shortcuts are static (res/xml/patchwork_shortcuts.xml,
 * written by plugins/with-shortcuts.js) and open deep links directly, so they
 * don't go through this module.
 */
class PatchworkShortcutsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val notifyJs: () -> Unit = { sendEvent("onPendingAction", emptyMap<String, Any>()) }

  override fun definition() = ModuleDefinition {
    Name("PatchworkShortcuts")

    Events("onPendingAction")

    Function("consumePendingActions") {
      PendingActions.drain(context)
    }

    Function("canPinShortcuts") {
      ShortcutManagerCompat.isRequestPinShortcutSupported(context)
    }

    // Asks the launcher to pin a shortcut. The launcher shows its own
    // confirmation, so `true` means the request went out, not that it landed.
    AsyncFunction("pinShortcut") { options: Map<String, Any?> ->
      val id = options["id"] as? String ?: return@AsyncFunction false
      val label = (options["label"] as? String)?.takeIf { it.isNotBlank() } ?: return@AsyncFunction false
      val url = options["url"] as? String ?: return@AsyncFunction false
      if (!ShortcutManagerCompat.isRequestPinShortcutSupported(context)) return@AsyncFunction false
      val icon = when (options["icon"]) {
        "board" -> R.drawable.pw_shortcut_board
        else -> R.drawable.pw_shortcut_list
      }
      val info = ShortcutInfoCompat.Builder(context, id)
        .setShortLabel(label.take(24))
        .setLongLabel(label)
        .setIcon(IconCompat.createWithResource(context, icon))
        .setIntent(DeepLinks.intent(context, url))
        .build()
      ShortcutManagerCompat.requestPinShortcut(context, info, null)
    }

    Function("setAssistantSnapshot") { json: String ->
      AssistantSnapshot.save(context, json)
    }

    OnStartObserving {
      PendingActions.addListener(notifyJs)
    }

    OnStopObserving {
      PendingActions.removeListener(notifyJs)
    }
  }
}
