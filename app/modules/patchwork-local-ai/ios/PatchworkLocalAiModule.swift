import ExpoModulesCore
import UIKit
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 On-device AI for iOS: Apple's Foundation Models framework, the model behind
 Apple Intelligence. iOS 26 or newer on Apple Intelligence hardware, with
 Apple Intelligence turned on. Images need iOS 27.

 Every status has the same shape as the Android one (see `src/index.ts`).
 `unsupported` means this device can never run the model, so JS hides the
 switch.
 */
public class PatchworkLocalAiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PatchworkLocalAi")

    Events("onDownloadProgress")

    AsyncFunction("getStatus") { () -> [String: Any?] in
      LocalModel.status()
    }

    // iOS downloads the model itself when Apple Intelligence is turned on.
    AsyncFunction("download") { () -> [String: Any?] in
      LocalModel.status()
    }

    AsyncFunction("generate") { (system: String?, prompt: String, imageBase64: String?) async throws -> String in
      try await LocalModel.generate(system: system, prompt: prompt, imageBase64: imageBase64)
    }
  }
}

final class LocalAiException: GenericException<String>, @unchecked Sendable {
  override var code: String { "ERR_LOCAL_AI" }
  override var reason: String { param }
}

private enum LocalModel {
  static func status() -> [String: Any?] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return foundationStatus()
    }
    #endif
    return statusMap(state: "unsupported", detail: "Apple Intelligence needs iOS 26 or newer.")
  }

  static func generate(system: String?, prompt: String, imageBase64: String?) async throws -> String {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return try await foundationGenerate(system: system, prompt: prompt, imageBase64: imageBase64)
    }
    #endif
    throw LocalAiException("Apple Intelligence needs iOS 26 or newer.")
  }

  static func statusMap(
    state: String,
    detail: String,
    modelName: String? = nil,
    supportsImages: Bool = false,
    contextTokens: Int? = nil
  ) -> [String: Any?] {
    [
      "platform": "ios",
      "engine": "apple-foundation",
      "state": state,
      "detail": detail,
      "modelName": modelName,
      "supportsImages": supportsImages,
      "contextTokens": contextTokens,
      "downloaded": nil,
      "total": nil,
    ]
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, *)
  static func foundationStatus() -> [String: Any?] {
    let model = SystemLanguageModel.default
    switch model.availability {
    case .available:
      return statusMap(
        state: "available",
        detail: "Apple Intelligence is ready on this device.",
        modelName: "Apple Foundation Model",
        supportsImages: supportsImages(model),
        contextTokens: model.contextSize
      )
    case .unavailable(.deviceNotEligible):
      return statusMap(state: "unsupported", detail: "This device doesn't support Apple Intelligence.")
    case .unavailable(.appleIntelligenceNotEnabled):
      return statusMap(
        state: "unavailable",
        detail: "Turn on Apple Intelligence in Settings > Apple Intelligence & Siri."
      )
    case .unavailable(.modelNotReady):
      return statusMap(state: "downloading", detail: "Apple Intelligence is still downloading its model.")
    case .unavailable:
      return statusMap(state: "unavailable", detail: "Apple Intelligence isn't ready on this device yet.")
    }
  }

  @available(iOS 26.0, *)
  static func supportsImages(_ model: SystemLanguageModel) -> Bool {
    if #available(iOS 27.0, *) {
      return model.capabilities.contains(.vision)
    }
    return false
  }

  @available(iOS 26.0, *)
  static func foundationGenerate(system: String?, prompt: String, imageBase64: String?) async throws -> String {
    let model = SystemLanguageModel.default
    guard case .available = model.availability else {
      throw LocalAiException(foundationStatus()["detail"] as? String ?? "Apple Intelligence isn't ready.")
    }
    let instructions = system.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
    // One session per request: Patchwork's prompts are one-shot, and a fresh
    // transcript keeps each call inside the 4K context window.
    let session = LanguageModelSession(model: model, instructions: instructions)
    let options = GenerationOptions(temperature: 0.1)

    do {
      if let imageBase64 {
        if #available(iOS 27.0, *), supportsImages(model) {
          let image = try decodeImage(imageBase64)
          let response = try await session.respond(
            to: Prompt {
              Attachment(image)
              prompt
            },
            options: options
          )
          return try nonEmpty(response.content)
        }
        throw LocalAiException("Apple Intelligence reads images on iOS 27 and newer.")
      }
      let response = try await session.respond(to: prompt, options: options)
      return try nonEmpty(response.content)
    } catch let error as LocalAiException {
      throw error
    } catch let error as LanguageModelSession.GenerationError {
      throw LocalAiException(message(for: error))
    } catch {
      throw LocalAiException("Apple Intelligence couldn't answer: \(error.localizedDescription)")
    }
  }

  @available(iOS 26.0, *)
  static func message(for error: LanguageModelSession.GenerationError) -> String {
    switch error {
    case .exceededContextWindowSize:
      return "That's too long for Apple Intelligence (about 4,000 tokens)."
    case .guardrailViolation:
      return "Apple Intelligence declined this request."
    case .unsupportedLanguageOrLocale:
      return "Apple Intelligence doesn't support this language yet."
    case .assetsUnavailable:
      return "Apple Intelligence's model isn't available right now. Try again later."
    case .rateLimited:
      return "Apple Intelligence is busy. Wait a moment and try again."
    default:
      return error.localizedDescription
    }
  }
  #endif

  static func decodeImage(_ base64: String) throws -> CGImage {
    guard
      let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
      let image = UIImage(data: data)?.cgImage
    else {
      throw LocalAiException("Couldn't read that image for Apple Intelligence.")
    }
    return image
  }

  static func nonEmpty(_ text: String) throws -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { throw LocalAiException("Apple Intelligence returned nothing.") }
    return trimmed
  }
}
