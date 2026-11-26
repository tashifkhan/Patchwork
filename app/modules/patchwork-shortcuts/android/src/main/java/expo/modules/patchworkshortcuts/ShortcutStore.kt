package expo.modules.patchworkshortcuts

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import java.util.concurrent.CopyOnWriteArraySet
import org.json.JSONArray
import org.json.JSONObject

/**
 * Requests that arrive while JS may not be running (an assistant calling an
 * AppFunction), kept in SharedPreferences until JS drains them on launch or
 * when the app comes back to the foreground.
 */
internal object PendingActions {
  private const val PREFS = "patchwork_shortcuts"
  private const val KEY = "pending"

  private val listeners = CopyOnWriteArraySet<() -> Unit>()

  fun addListener(listener: () -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: () -> Unit) {
    listeners.remove(listener)
  }

  @Synchronized
  fun add(context: Context, action: JSONObject) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val queue = runCatching { JSONArray(prefs.getString(KEY, "[]")) }.getOrElse { JSONArray() }
    queue.put(action)
    // commit, not apply: the service may be torn down right after returning.
    prefs.edit().putString(KEY, queue.toString()).commit()
    listeners.forEach { runCatching { it() } }
  }

  @Synchronized
  fun drain(context: Context): List<Map<String, Any?>> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY, null) ?: return emptyList()
    prefs.edit().remove(KEY).commit()
    val queue = runCatching { JSONArray(raw) }.getOrElse { return emptyList() }
    return (0 until queue.length()).mapNotNull { index ->
      val item = queue.optJSONObject(index) ?: return@mapNotNull null
      item.keys().asSequence().associateWith { key -> item.opt(key)?.takeUnless { it == JSONObject.NULL } }
    }
  }
}

/**
 * The to-dos JS last showed in the Today widget, plus list names, written by
 * src/widgets/snapshot.ts each time the widgets refresh. AppFunctions read it
 * because the tasks themselves live in JS (CalDAV, on-device storage).
 */
internal object AssistantSnapshot {
  private const val PREFS = "patchwork_shortcuts"
  private const val KEY = "assistant_snapshot"

  fun save(context: Context, json: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }

  fun read(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
    return runCatching { JSONObject(raw) }.getOrNull()
  }
}

/** Intents into MainActivity with a `patchwork://` deep link, which expo-router handles. */
internal object DeepLinks {
  fun intent(context: Context, url: String): Intent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    return Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      launch?.component?.let { component = it } ?: setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }

  fun pendingIntent(context: Context, url: String): PendingIntent =
    PendingIntent.getActivity(
      context,
      url.hashCode(),
      intent(context, url),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
}
