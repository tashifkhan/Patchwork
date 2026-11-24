package expo.modules.patchworklocalai

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Base64
import androidx.annotation.RequiresApi
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Candidate
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerateContentResponse
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.content
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Gemini Nano through AICore, using ML Kit's Prompt API. AICore owns the
 * model and shares it across apps, so Patchwork ships no weights and nothing
 * here touches the network.
 *
 * Same engine as Paisa's `MlKitLocalAiEngine`, trimmed to what Patchwork
 * sends: one text prompt, optionally with one image.
 */
@RequiresApi(Build.VERSION_CODES.O)
internal class NanoEngine {
  private val model: GenerativeModel by lazy { Generation.getClient() }

  /** AICore runs one inference per app and answers BUSY to the rest. */
  private val inference = Mutex()
  private val downloading = Mutex()

  suspend fun status(): Map<String, Any?> = withContext(Dispatchers.Default) {
    if (isEmulator()) {
      return@withContext statusMap("unsupported", "The Android emulator has no AICore, so Gemini Nano can't run here.")
    }
    try {
      when (model.checkStatus()) {
        FeatureStatus.AVAILABLE -> statusMap(
          state = "available",
          detail = "Gemini Nano is ready on this phone.",
          modelName = runCatching { model.getBaseModelName() }.getOrNull(),
          // The Prompt API takes images on every Nano version it supports.
          supportsImages = true,
          contextTokens = runCatching { model.getTokenLimit() }.getOrNull(),
        )
        FeatureStatus.DOWNLOADABLE -> statusMap("downloadable", "Gemini Nano can be downloaded to this phone.")
        FeatureStatus.DOWNLOADING -> statusMap("downloading", "Gemini Nano is downloading.")
        else -> statusMap("unsupported", "This phone doesn't support Gemini Nano.")
      }
    } catch (e: CancellationException) {
      throw e
    } catch (e: GenAiException) {
      when (e.errorCode) {
        // The phone has the hardware but AICore or Android is behind.
        GenAiException.ErrorCode.NEEDS_SYSTEM_UPDATE,
        GenAiException.ErrorCode.AICORE_INCOMPATIBLE,
        GenAiException.ErrorCode.NOT_ENOUGH_DISK_SPACE,
        GenAiException.ErrorCode.BUSY -> statusMap("unavailable", message(e))
        else -> statusMap("unsupported", message(e))
      }
    } catch (e: Throwable) {
      // No AICore at all, or a phone ML Kit doesn't know.
      statusMap("unsupported", e.message?.take(240) ?: "This phone doesn't support Gemini Nano.")
    }
  }

  /** Asks AICore to fetch the model. Returns the status once it ends. */
  suspend fun download(onProgress: (downloaded: Long, total: Long?) -> Unit): Map<String, Any?> =
    withContext(Dispatchers.Default) {
      downloading.withLock {
        val current = status()
        if (current["state"] != "downloadable" && current["state"] != "downloading") return@withLock current
        var total: Long? = null
        var failure: String? = null
        try {
          model.download().collect { event ->
            when (event) {
              is DownloadStatus.DownloadStarted -> {
                total = event.bytesToDownload
                onProgress(0, total)
              }
              is DownloadStatus.DownloadProgress -> onProgress(event.totalBytesDownloaded, total)
              DownloadStatus.DownloadCompleted -> onProgress(total ?: 0, total)
              is DownloadStatus.DownloadFailed -> failure = message(event.e)
            }
          }
        } catch (e: CancellationException) {
          throw e
        } catch (e: GenAiException) {
          failure = message(e)
        } catch (e: Throwable) {
          failure = e.message?.take(240) ?: "The Gemini Nano download failed."
        }
        failure?.let { statusMap("error", it) } ?: status()
      }
    }

  suspend fun generate(system: String?, prompt: String, imageBase64: String?): String {
    if (model.checkStatus() != FeatureStatus.AVAILABLE) {
      throw LocalAiException("Gemini Nano isn't downloaded on this phone yet.")
    }
    val instructions = system?.takeIf { it.isNotBlank() }
    val systemPrompts = instructions != null && runCatching { model.isSystemPromptAvailable() }.getOrDefault(false)
    val text = if (instructions != null && !systemPrompts) "$instructions\n\n$prompt" else prompt
    val image = imageBase64?.let(::decodeImage)

    val builder = GenerateContentRequest.Builder(
      listOf(
        content {
          if (image != null) image(image)
          text(text)
        }
      )
    )
    if (instructions != null && systemPrompts) builder.systemInstruction = SystemInstruction(instructions)
    builder.temperature = 0.1f
    builder.candidateCount = 1
    builder.maxOutputTokens = OUTPUT_TOKEN_LIMIT

    val response = try {
      inference.withLock { withBusyRetry(builder.build()) }
    } catch (e: CancellationException) {
      throw e
    } catch (e: GenAiException) {
      throw LocalAiException(message(e), e)
    } catch (e: Throwable) {
      throw LocalAiException(e.message?.take(240) ?: "Gemini Nano failed.", e)
    }
    val candidate = response.candidates.firstOrNull() ?: throw LocalAiException("Gemini Nano returned nothing.")
    if (candidate.finishReason == Candidate.FinishReason.MAX_TOKENS) {
      throw LocalAiException("Gemini Nano's reply was cut off. Try a shorter request.")
    }
    return candidate.text.trim().ifEmpty { throw LocalAiException("Gemini Nano returned nothing.") }
  }

  /** BUSY means another app holds the model. One quiet retry is usually enough. */
  private suspend fun withBusyRetry(request: GenerateContentRequest): GenerateContentResponse {
    var attempt = 0
    while (true) {
      try {
        return model.generateContent(request)
      } catch (e: GenAiException) {
        if (e.errorCode != GenAiException.ErrorCode.BUSY || attempt >= 1) throw e
        attempt++
        delay(1_500)
      }
    }
  }

  private fun decodeImage(base64: String): Bitmap {
    val bytes = try {
      Base64.decode(base64, Base64.DEFAULT)
    } catch (_: IllegalArgumentException) {
      throw LocalAiException("Couldn't read that image for Gemini Nano.")
    }
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      ?: throw LocalAiException("Couldn't read that image for Gemini Nano.")
    val side = maxOf(bitmap.width, bitmap.height)
    if (side <= MAX_IMAGE_SIDE) return bitmap
    // Big photos cost tokens and memory. 1568 px keeps handwriting readable.
    val ratio = MAX_IMAGE_SIDE.toFloat() / side
    val scaled = Bitmap.createScaledBitmap(
      bitmap,
      (bitmap.width * ratio).toInt().coerceAtLeast(1),
      (bitmap.height * ratio).toInt().coerceAtLeast(1),
      true,
    )
    if (scaled !== bitmap) bitmap.recycle()
    return scaled
  }

  private fun message(error: GenAiException): String = when (error.errorCode) {
    GenAiException.ErrorCode.BACKGROUND_USE_BLOCKED ->
      "Gemini Nano only runs while Patchwork is open. Keep the app in front and try again."
    GenAiException.ErrorCode.REQUEST_TOO_LARGE ->
      "That's too long for Gemini Nano (about 4,000 tokens)."
    GenAiException.ErrorCode.PER_APP_BATTERY_USE_QUOTA_EXCEEDED ->
      "Patchwork reached this phone's on-device AI limit for now. Try again later."
    GenAiException.ErrorCode.BUSY -> "Gemini Nano is busy. Wait a moment and try again."
    GenAiException.ErrorCode.NOT_ENOUGH_DISK_SPACE -> "There isn't enough free space for Gemini Nano."
    GenAiException.ErrorCode.NEEDS_SYSTEM_UPDATE -> "Android needs an update before Gemini Nano can run."
    GenAiException.ErrorCode.AICORE_INCOMPATIBLE ->
      "AICore on this phone is too old. Update it from the Play Store."
    GenAiException.ErrorCode.NOT_AVAILABLE, GenAiException.ErrorCode.NOT_SUPPORTED ->
      "This phone doesn't support Gemini Nano."
    else -> error.message?.take(240) ?: "AICore returned an error (${error.errorCode})."
  }

  private fun isEmulator(): Boolean =
    Build.FINGERPRINT.startsWith("generic") ||
      Build.FINGERPRINT.contains("emulator", ignoreCase = true) ||
      Build.MODEL.contains("Emulator", ignoreCase = true) ||
      Build.MODEL.contains("sdk_gphone", ignoreCase = true) ||
      Build.PRODUCT.contains("sdk", ignoreCase = true)

  private companion object {
    const val OUTPUT_TOKEN_LIMIT = 4_096
    const val MAX_IMAGE_SIDE = 1_568
  }
}
