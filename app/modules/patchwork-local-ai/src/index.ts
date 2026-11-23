import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

import { nativeCause } from './errors';

/**
 * - `available`: ready to answer now.
 * - `downloadable`: Android only, AICore can fetch Gemini Nano on request.
 * - `downloading`: the platform is fetching the model.
 * - `unavailable`: the hardware supports it but something is off (Apple
 *   Intelligence turned off, AICore out of date). `detail` says what.
 * - `unsupported`: this device can never run it. Hide the feature.
 * - `error`: the last check or download failed. `detail` says why.
 */
export type LocalAiState = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' | 'error';

/** `gemini-nano` on Android (AICore), `apple-foundation` on iOS (Foundation Models). */
export type LocalAiEngine = 'gemini-nano' | 'apple-foundation';

export interface LocalAiStatus {
  platform: 'android' | 'ios' | 'web';
  engine: LocalAiEngine | null;
  state: LocalAiState;
  /** Ready to show under the switch. */
  detail: string;
  /** The platform's name for the active model, such as `nano-v4`. */
  modelName: string | null;
  supportsImages: boolean;
  /** Input token limit when the platform reports one. */
  contextTokens: number | null;
  downloaded: number | null;
  total: number | null;
}

export interface LocalAiRequest {
  /** Instructions. Sent as a system prompt where the model takes one. */
  system?: string;
  prompt: string;
  /** One image, base64 without a data: prefix. */
  imageBase64?: string;
}

type NativeModule = {
  getStatus(): Promise<LocalAiStatus>;
  download(): Promise<LocalAiStatus>;
  generate(system: string | null, prompt: string, imageBase64: string | null): Promise<string>;
  addListener(
    event: 'onDownloadProgress',
    listener: (e: { downloaded: number; total: number | null }) => void
  ): EventSubscription;
};

// Optional so web, Expo Go and dev clients built before this module existed
// keep running. They report `unsupported`, which hides the switch.
const native = requireOptionalNativeModule<NativeModule>('PatchworkLocalAi');

export const UNSUPPORTED_STATUS: LocalAiStatus = {
  platform: 'web',
  engine: null,
  state: 'unsupported',
  detail: 'On-device AI runs in the iOS and Android apps.',
  modelName: null,
  supportsImages: false,
  contextTokens: null,
  downloaded: null,
  total: null,
};

export function isLocalAiLinked(): boolean {
  return native != null;
}

export async function getLocalAiStatus(): Promise<LocalAiStatus> {
  if (!native) return UNSUPPORTED_STATUS;
  try {
    return normalize(await native.getStatus());
  } catch (error) {
    return {
      ...UNSUPPORTED_STATUS,
      state: 'error',
      detail: error instanceof Error ? error.message : 'Could not check on-device AI.',
    };
  }
}

/** Android: asks AICore to fetch Gemini Nano. iOS manages its own download. */
export async function downloadLocalAi(): Promise<LocalAiStatus> {
  if (!native) return UNSUPPORTED_STATUS;
  return normalize(await native.download());
}

export function addDownloadProgressListener(
  listener: (progress: { downloaded: number; total: number | null }) => void
): EventSubscription | null {
  return native?.addListener('onDownloadProgress', listener) ?? null;
}

/** Runs one prompt on the device. Throws when the model can't answer. */
export async function generateLocal(request: LocalAiRequest): Promise<string> {
  if (!native) throw new Error(UNSUPPORTED_STATUS.detail);
  try {
    return await native.generate(request.system ?? null, request.prompt, request.imageBase64 ?? null);
  } catch (error) {
    throw new Error(nativeCause(error));
  }
}

function normalize(raw: Partial<LocalAiStatus>): LocalAiStatus {
  return {
    ...UNSUPPORTED_STATUS,
    ...raw,
    detail: raw.detail ?? '',
    modelName: raw.modelName ?? null,
    supportsImages: raw.supportsImages === true,
    contextTokens: typeof raw.contextTokens === 'number' ? raw.contextTokens : null,
    downloaded: typeof raw.downloaded === 'number' ? raw.downloaded : null,
    total: typeof raw.total === 'number' ? raw.total : null,
  };
}
