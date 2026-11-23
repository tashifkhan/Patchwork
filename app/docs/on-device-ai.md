# On-device AI

Patchwork can run AI import on the phone itself. Android uses Gemini Nano
through AICore and ML Kit's Prompt API. iOS uses Apple's Foundation Models
framework, the model behind Apple Intelligence. There's no API key, no request
leaves the device, and nothing is billed per call.

The models are small: about 4,000 tokens of context on both platforms. So the
on-device model is one step in the fallback chain, not a replacement for it.
Turning it on puts it first. When it fails (too long, still downloading, busy,
reply isn't JSON) the next model in the chain runs, the same way a cloud model
failure moves down the chain.

## Where it shows up

Settings > AI import > On-device AI. The group is hidden when the device can
never run a local model:

| Platform | Shown when | Hidden when |
| --- | --- | --- |
| Android | AICore reports Gemini Nano as available, downloadable or downloading, or AICore needs an update | Android 7 or older, emulator, no AICore, phone not on Google's list |
| iOS | iOS 26+ on Apple Intelligence hardware, including when Apple Intelligence is turned off (the row says how to turn it on) | iOS 25 or older, or `deviceNotEligible` |
| Web | never | always |

If the model is already in the chain, the switch stays visible even when the
device says unsupported (after restoring a backup on an older phone, say), so
you can still turn it off.

## What it can read

| Input | Android (Gemini Nano) | iOS (Foundation Models) |
| --- | --- | --- |
| Typed request, refine | Yes | Yes |
| Photo of a note | Yes, one image, scaled to 1568 px | iOS 27 and newer, when the model reports `.vision` |
| Voice dictation | No | No |

The chain entry's `input` mirrors this, so photo import and dictation skip the
on-device step on their own. The settings hook re-syncs it when the OS gains
image input.

## How it's wired

- `modules/patchwork-local-ai` is a local Expo module with `getStatus`,
  `download` and `generate`, plus an `onDownloadProgress` event. The status
  has the same shape on both platforms.
- `android/.../NanoEngine.kt` is a trimmed copy of Paisa's
  `MlKitLocalAiEngine`. It uses `genai-prompt:1.0.0-beta4`, because beta5
  needs Kotlin 2.4 and the app builds with 2.2. Inference runs behind a mutex
  because AICore answers BUSY to a second concurrent call.
- The ML Kit AARs declare minSdk 26 and the app keeps 24.
  `plugins/with-android-local-ai.js` adds `tools:overrideLibrary` to the app
  manifest, and the module only loads the engine on API 26 and newer.
- `ios/PatchworkLocalAiModule.swift` weak-links `FoundationModels` and checks
  `#available(iOS 26.0, *)`, so iOS 16.4 to 25 still launch. Each request gets
  a fresh `LanguageModelSession`, so one import can't fill the next one's
  context.
- `src/lib/on-device-ai.ts` holds the pure chain edits (`withOnDevice`,
  `withoutOnDevice`, `syncOnDevice`) and the status copy.
- `src/hooks/use-on-device-ai.ts` polls status while the model downloads,
  re-checks when the app comes back to the foreground, and starts the
  Gemini Nano download when you turn the switch on.
- `src/api/ai.native.ts` sends `on-device` selections to the module instead
  of the AI SDK. `src/lib/ai-json.ts` pulls the JSON out of replies that come
  wrapped in prose or code fences, which small models do often.

## Limits

- Android only allows inference while Patchwork is the foreground app.
- AICore enforces per-app inference and battery quotas.
- The Android emulator has no AICore, so the group never shows there. Test on
  a supported phone (Pixel 9 or newer, recent Galaxy S, and others on
  [Google's list](https://developers.google.com/ml-kit/genai)).
- The iOS Simulator borrows the Mac's model, so Apple Intelligence has to be
  on in the Mac's System Settings. If it's off, the simulator still reports
  the model as available, but every request fails with
  `com.apple.SensitiveContentAnalysisML error 15`. The chain then falls
  through to the next model, which is the right behavior but hides the cause.

## Testing

```bash
bun test src/lib/on-device-ai.test.ts
cd android && ./gradlew :patchwork-local-ai:compileDebugKotlin
```

On a supported phone, check:

1. Settings > AI import shows "Use Gemini Nano" (or "Use Apple Intelligence").
2. Turning it on starts the download if needed, and the row shows progress.
3. Once it's ready, a typed AI import produces drafts with no API key saved.
4. With a cloud model second in the chain, a request that's too long for the
   small model still works, because the cloud model answers.
