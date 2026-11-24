package expo.modules.patchworkwindow

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Streams the window's fold (hinge) to JS.
 *
 * Each `onFoldChange` event carries the first FoldingFeature in the current
 * window layout, or null when the window doesn't span a fold (folded cover
 * screen, a regular phone, a tablet, or an app window that sits on one side
 * of the hinge in split screen). Bounds are window-relative, in dp, so JS
 * can compare them with `useWindowDimensions()` directly.
 */
private const val TIMER_CHANNEL_ID = "patchwork-focus-timer"
private const val TIMER_NOTIFICATION_ID = 4107

class PatchworkWindowModule : Module() {
  private var job: Job? = null
  private var latest: Map<String, Any?>? = null

  override fun definition() = ModuleDefinition {
    Name("PatchworkWindow")

    Events("onFoldChange")

    Function("getFold") { latest }

    // Live timer notification for the focus timer and stopwatch. A
    // chronometer that the system ticks itself, so JS never has to update
    // it. On Android 16+ it asks to be promoted to a Live Update, which puts
    // the running time in a status bar chip.
    Function("showTimerNotification") { options: Map<String, Any?> ->
      showTimer(options)
    }

    Function("hideTimerNotification") {
      val context = appContext.reactContext ?: return@Function null
      NotificationManagerCompat.from(context).cancel(TIMER_NOTIFICATION_ID)
      null
    }

    OnStartObserving { start() }

    OnStopObserving {
      job?.cancel()
      job = null
    }

    OnActivityEntersForeground { if (job == null) start() }

    OnDestroy { job?.cancel() }
  }

  private fun showTimer(options: Map<String, Any?>) {
    val context = appContext.reactContext ?: return
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    ensureTimerChannel(context)

    val title = options["title"] as? String ?: "Focus"
    val text = options["text"] as? String ?: ""
    val base = (options["baseTime"] as? Number)?.toLong() ?: System.currentTimeMillis()
    val countDown = options["countDown"] as? Boolean ?: false
    val paused = options["paused"] as? Boolean ?: false

    val open = Intent(Intent.ACTION_VIEW, Uri.parse("patchwork://pomodoro")).apply {
      setPackage(context.packageName)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val contentIntent = PendingIntent.getActivity(
      context,
      TIMER_NOTIFICATION_ID,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = NotificationCompat.Builder(context, TIMER_CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(if (countDown) NotificationCompat.CATEGORY_PROGRESS else NotificationCompat.CATEGORY_STOPWATCH)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

    if (!paused) {
      builder.setWhen(base).setShowWhen(true).setUsesChronometer(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) builder.setChronometerCountDown(countDown)
      // A countdown removes itself at zero instead of ticking into negative
      // time; the "block done" notification from JS takes over from there.
      val timeoutAt = (options["timeoutAt"] as? Number)?.toLong()
      if (timeoutAt != null) builder.setTimeoutAfter(maxOf(1_000L, timeoutAt - System.currentTimeMillis()))
    } else {
      builder.setShowWhen(false)
    }

    // Live Updates (API 36). The extra is what NotificationCompat's
    // setRequestPromotedOngoing writes, set directly so this builds against
    // older androidx.core too. Needs POST_PROMOTED_NOTIFICATIONS in the manifest.
    builder.extras.putBoolean("android.requestPromotedOngoing", true)

    try {
      manager.notify(TIMER_NOTIFICATION_ID, builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS not granted: the in-app timer still runs.
    }
  }

  private fun ensureTimerChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val system = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (system.getNotificationChannel(TIMER_CHANNEL_ID) != null) return
    val channel = NotificationChannel(TIMER_CHANNEL_ID, "Focus timer", NotificationManager.IMPORTANCE_LOW).apply {
      description = "The running focus timer or stopwatch"
      setShowBadge(false)
    }
    system.createNotificationChannel(channel)
  }

  private fun start() {
    val activity = appContext.currentActivity ?: return
    // ReactActivity is a ComponentActivity, so it owns a lifecycle.
    val owner = activity as? LifecycleOwner ?: return
    job?.cancel()
    job = owner.lifecycleScope.launch {
      owner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        WindowInfoTracker.getOrCreate(activity)
          .windowLayoutInfo(activity)
          .collect { info -> emit(activity, info) }
      }
    }
  }

  private fun emit(activity: Activity, info: WindowLayoutInfo) {
    val density = activity.resources.displayMetrics.density
    val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
    val payload: Map<String, Any?>? = fold?.let {
      mapOf(
        // FLAT = fully open, HALF_OPENED = tabletop / book posture.
        "state" to if (it.state == FoldingFeature.State.HALF_OPENED) "halfOpened" else "flat",
        "orientation" to if (it.orientation == FoldingFeature.Orientation.VERTICAL) "vertical" else "horizontal",
        // True when the fold splits the window into two logical areas: a
        // physical hinge, or a flexible screen that is half opened.
        "isSeparating" to it.isSeparating,
        "occludes" to (it.occlusionType == FoldingFeature.OcclusionType.FULL),
        "bounds" to mapOf(
          "x" to it.bounds.left / density,
          "y" to it.bounds.top / density,
          "width" to it.bounds.width() / density,
          "height" to it.bounds.height() / density
        )
      )
    }
    latest = payload
    sendEvent("onFoldChange", mapOf("fold" to payload))
  }
}
