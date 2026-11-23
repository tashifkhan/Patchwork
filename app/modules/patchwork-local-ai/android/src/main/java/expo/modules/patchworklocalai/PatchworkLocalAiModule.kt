package expo.modules.patchworklocalai

import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * On-device AI for Android: Gemini Nano through AICore.
 *
 * Every status this module returns has the same shape as the iOS one (see
 * `src/index.ts`). `unsupported` means this phone can never run the model, so
 * JS hides the switch. Anything else means it can, now or after a download.
 */
class PatchworkLocalAiModule : Module() {
  /** Null below Android 8.0, where the ML Kit GenAI classes must not load. */
  private val nano: NanoEngine? by lazy {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) NanoEngine() else null
  }

  override fun definition() = ModuleDefinition {
    Name("PatchworkLocalAi")

    Events("onDownloadProgress")

    AsyncFunction("getStatus") Coroutine { ->
      nano?.status() ?: tooOld()
    }

    AsyncFunction("download") Coroutine { ->
      val engine = nano ?: return@Coroutine tooOld()
      engine.download { downloaded, total ->
        sendEvent("onDownloadProgress", mapOf("downloaded" to downloaded, "total" to total))
      }
    }

    AsyncFunction("generate") Coroutine { system: String?, prompt: String, imageBase64: String? ->
      val engine = nano ?: throw LocalAiException("On-device AI needs Android 8.0 or newer.")
      engine.generate(system, prompt, imageBase64)
    }
  }

  private fun tooOld(): Map<String, Any?> =
    statusMap(
      state = "unsupported",
      detail = "On-device AI needs Android 8.0 or newer.",
    )
}

internal class LocalAiException(message: String, cause: Throwable? = null) :
  CodedException("ERR_LOCAL_AI", message, cause)

/** The status shape shared with iOS. */
internal fun statusMap(
  state: String,
  detail: String,
  modelName: String? = null,
  supportsImages: Boolean = false,
  contextTokens: Int? = null,
  downloaded: Long? = null,
  total: Long? = null,
): Map<String, Any?> = mapOf(
  "platform" to "android",
  "engine" to "gemini-nano",
  "state" to state,
  "detail" to detail,
  "modelName" to modelName,
  "supportsImages" to supportsImages,
  "contextTokens" to contextTokens,
  "downloaded" to downloaded,
  "total" to total,
)
