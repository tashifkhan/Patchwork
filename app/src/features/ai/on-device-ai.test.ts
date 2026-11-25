import { describe, expect, test } from 'bun:test';

import type { AiModelSelection } from '@/features/ai/ai-models';
import { extractJsonText } from '@/features/ai/ai-json';
import {
  ON_DEVICE_PROVIDER_ID,
  downloadPercent,
  onDeviceOffered,
  onDeviceSelection,
  onDeviceSubtitle,
  syncOnDevice,
  withOnDevice,
  withoutOnDevice,
} from '@/features/ai/on-device-ai';
import { nativeCause } from '../../../modules/patchwork-local-ai/src/errors';
import type { LocalAiStatus } from '../../../modules/patchwork-local-ai/src';

const nano: LocalAiStatus = {
  platform: 'android',
  engine: 'gemini-nano',
  state: 'available',
  detail: 'Gemini Nano is ready on this phone.',
  modelName: 'nano-v4',
  supportsImages: true,
  contextTokens: 4000,
  downloaded: null,
  total: null,
};

const apple: LocalAiStatus = {
  ...nano,
  platform: 'ios',
  engine: 'apple-foundation',
  modelName: 'Apple Foundation Model',
  supportsImages: false,
};

const gemini: AiModelSelection = { providerId: 'google', modelId: 'gemini-flash', input: ['text', 'image', 'audio'] };

describe('on-device chain entry', () => {
  test('goes first, once', () => {
    const once = withOnDevice([gemini], nano);
    expect(once.map((s) => s.providerId)).toEqual([ON_DEVICE_PROVIDER_ID, 'google']);
    const twice = withOnDevice(once, nano);
    expect(twice.map((s) => s.providerId)).toEqual([ON_DEVICE_PROVIDER_ID, 'google']);
  });

  test('turning off removes it and keeps cloud models', () => {
    expect(withoutOnDevice(withOnDevice([gemini], nano))).toEqual([gemini]);
  });

  test('never claims audio, so dictation skips it', () => {
    expect(onDeviceSelection(nano).input).toEqual(['text', 'image']);
    expect(onDeviceSelection(apple).input).toEqual(['text']);
    expect(onDeviceSelection(apple).modelName).toBe('Apple Intelligence');
  });

  test('sync picks up new image support and leaves an unchanged chain alone', () => {
    const chain = withOnDevice([gemini], apple);
    expect(syncOnDevice(chain, apple)).toBe(chain);
    const updated = syncOnDevice(chain, { ...apple, supportsImages: true });
    expect(updated[0]?.input).toEqual(['text', 'image']);
    expect(updated[1]).toBe(gemini);
  });

  test('sync does nothing when the switch is off', () => {
    const chain = [gemini];
    expect(syncOnDevice(chain, nano)).toBe(chain);
  });
});

describe('on-device status copy', () => {
  test('hides the switch only on devices that can never run it', () => {
    expect(onDeviceOffered({ state: 'unsupported' })).toBe(false);
    expect(onDeviceOffered({ state: 'unavailable' })).toBe(true);
    expect(onDeviceOffered({ state: 'downloadable' })).toBe(true);
  });

  test('download percent', () => {
    expect(downloadPercent({ downloaded: 50, total: 200 })).toBe(25);
    expect(downloadPercent({ downloaded: 10, total: null })).toBeNull();
    expect(onDeviceSubtitle({ ...nano, state: 'downloading', downloaded: 1, total: 2 })).toBe('Downloading · 50%');
  });

  test('ready line names the model and what it reads', () => {
    expect(onDeviceSubtitle(nano)).toBe('Ready · nano-v4 · Text and photos');
    expect(onDeviceSubtitle(apple)).toBe('Ready · Apple Foundation Model · Text only');
  });
});

describe('extractJsonText', () => {
  test('passes clean JSON through', () => {
    expect(extractJsonText('{"tasks":[]}')).toBe('{"tasks":[]}');
  });

  test('unwraps a fence with chatter around it', () => {
    expect(extractJsonText('Sure! Here you go:\n```json\n{"tasks":[{"title":"A"}]}\n```\nLet me know.')).toBe(
      '{"tasks":[{"title":"A"}]}'
    );
  });

  test('finds a bare object after a sentence', () => {
    expect(extractJsonText('Here are the tasks: {"tasks":[]} Hope that helps')).toBe('{"tasks":[]}');
  });

  test('finds a bare array', () => {
    expect(extractJsonText('Tasks: [{"title":"A"}]')).toBe('[{"title":"A"}]');
  });

  test('returns the reply when there is no JSON, so the caller reports it', () => {
    expect(extractJsonText('no json here')).toBe('no json here');
  });
});

describe('nativeCause', () => {
  test('drops the Expo wrapper on iOS', () => {
    const error = new Error(
      "Calling the 'generate' function has failed\n→ Caused by: Apple Intelligence couldn't answer: The operation couldn’t be completed."
    );
    expect(nativeCause(error)).toBe("Apple Intelligence couldn't answer: The operation couldn’t be completed.");
  });

  test('drops the Expo wrapper on Android', () => {
    const error = new Error(
      "Call to function 'PatchworkLocalAi.generate' has been rejected.\n→ Caused by: Gemini Nano is busy. Wait a moment and try again."
    );
    expect(nativeCause(error)).toBe('Gemini Nano is busy. Wait a moment and try again.');
  });

  test('passes a plain message through', () => {
    expect(nativeCause(new Error('Too long'))).toBe('Too long');
  });
});
