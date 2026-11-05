package expo.modules.patchworkwindow

import android.app.Activity
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
class PatchworkWindowModule : Module() {
  private var job: Job? = null
  private var latest: Map<String, Any?>? = null

  override fun definition() = ModuleDefinition {
    Name("PatchworkWindow")

    Events("onFoldChange")

    Function("getFold") { latest }

    OnStartObserving { start() }

    OnStopObserving {
      job?.cancel()
      job = null
    }

    OnActivityEntersForeground { if (job == null) start() }

    OnDestroy { job?.cancel() }
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
