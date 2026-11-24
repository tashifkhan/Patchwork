import type { AiModelSelection } from './ai-models';
import type { LocalAiStatus } from '../../modules/patchwork-local-ai/src';

/**
 * The on-device model is one step in the AI fallback chain, like a cloud
 * model, under this provider id. It needs no key and nothing leaves the phone.
 */
export const ON_DEVICE_PROVIDER_ID = 'on-device';

export function isOnDevice(selection: Pick<AiModelSelection, 'providerId'>): boolean {
  return selection.providerId === ON_DEVICE_PROVIDER_ID;
}

/** Name for the engine, as people know it on each platform. */
export function onDeviceEngineName(status: Pick<LocalAiStatus, 'engine'>): string {
  return status.engine === 'apple-foundation' ? 'Apple Intelligence' : 'Gemini Nano';
}

/** Whether to show the switch at all. A device that can never run it gets nothing. */
export function onDeviceOffered(status: Pick<LocalAiStatus, 'state'>): boolean {
  return status.state !== 'unsupported';
}

/** The chain entry for this device's model. Input mirrors what it can read today. */
export function onDeviceSelection(status: LocalAiStatus): AiModelSelection {
  return {
    providerId: ON_DEVICE_PROVIDER_ID,
    modelId: status.engine ?? 'gemini-nano',
    modelName: onDeviceEngineName(status),
    // Neither engine hears audio, so dictation always skips it.
    input: status.supportsImages ? ['text', 'image'] : ['text'],
    output: ['text'],
    reasoning: false,
  };
}

/** Puts the on-device model first, once. It's free and private, so it goes before paid models. */
export function withOnDevice(selections: AiModelSelection[], status: LocalAiStatus): AiModelSelection[] {
  return [onDeviceSelection(status), ...selections.filter((selection) => !isOnDevice(selection))];
}

export function withoutOnDevice(selections: AiModelSelection[]): AiModelSelection[] {
  return selections.filter((selection) => !isOnDevice(selection));
}

/**
 * Refreshes the saved entry when the device's abilities change (an OS update
 * adds image input, say). Returns the same array when nothing changed so the
 * store doesn't write.
 */
export function syncOnDevice(selections: AiModelSelection[], status: LocalAiStatus): AiModelSelection[] {
  const index = selections.findIndex(isOnDevice);
  if (index < 0 || !status.engine) return selections;
  const current = selections[index]!;
  const next = onDeviceSelection(status);
  const same =
    current.modelId === next.modelId &&
    current.modelName === next.modelName &&
    (current.input ?? []).join(',') === (next.input ?? []).join(',');
  if (same) return selections;
  const copy = [...selections];
  copy[index] = { ...current, ...next };
  return copy;
}

/** One-line status for the settings row. */
export function onDeviceSubtitle(status: LocalAiStatus): string {
  switch (status.state) {
    case 'available': {
      const parts = [status.modelName ? `Ready · ${status.modelName}` : 'Ready'];
      parts.push(status.supportsImages ? 'Text and photos' : 'Text only');
      return parts.join(' · ');
    }
    case 'downloading': {
      const percent = downloadPercent(status);
      return percent != null ? `Downloading · ${percent}%` : status.detail || 'Downloading';
    }
    default:
      return status.detail;
  }
}

export function downloadPercent(status: Pick<LocalAiStatus, 'downloaded' | 'total'>): number | null {
  if (!status.total || status.total <= 0 || status.downloaded == null) return null;
  return Math.max(0, Math.min(100, Math.round((status.downloaded / status.total) * 100)));
}
