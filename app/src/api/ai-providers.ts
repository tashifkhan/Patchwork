import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { JSONValue, LanguageModel } from 'ai';

import { providerById, type buildProvidersWithCustom, type AiModelSelection } from '@/features/ai/ai-models';
import { getAiApiKey } from '@/lib/credentials';
import { assertSafeAiBaseUrl } from '@/lib/secure-url';

/**
 * Map the selection's reasoning effort onto each provider's own option. The
 * chain only offers levels models.dev lists for the model, so values pass
 * through as-is; the few the SDK types can't express are clamped. Unset
 * leaves the provider default.
 */
export function reasoningOptions(
  selection: AiModelSelection,
  providers: ReturnType<typeof buildProvidersWithCustom>
): Record<string, Record<string, JSONValue>> | undefined {
  const effort = selection.reasoningEffort;
  if (!effort) return undefined;
  const provider = providerById(selection.providerId, providers);
  if (!provider) return undefined;
  switch (provider.kind) {
    case 'google':
      if (effort === 'none') return { google: { thinkingConfig: { thinkingBudget: 0 } } };
      return {
        google: {
          thinkingConfig: {
            thinkingLevel: effort === 'xhigh' || effort === 'max' ? 'high' : effort,
          },
        },
      };
    case 'openai':
      return { openai: { reasoningEffort: effort === 'max' ? 'xhigh' : effort } };
    case 'anthropic':
      if (effort === 'none') return { anthropic: { thinking: { type: 'disabled' } } };
      return {
        anthropic: {
          effort: effort === 'minimal' ? 'low' : effort,
        },
      };
    default:
      // OpenAI-compatible endpoints read `reasoning_effort`; the SDK keys
      // provider options by the name passed to createOpenAICompatible.
      return { [provider.id]: { reasoningEffort: effort } };
  }
}

export async function languageModelFor(
  selection: AiModelSelection,
  baseUrlOverrides: Partial<Record<AiModelSelection['providerId'], string>>,
  customProviders: ReturnType<typeof buildProvidersWithCustom>
): Promise<LanguageModel> {
  const provider = providerById(selection.providerId, customProviders);
  if (!provider) throw new Error(`Unknown provider: ${selection.providerId}`);
  const apiKey = await getAiApiKey(provider.id);
  if (!apiKey) throw new Error(`${provider.name} API key is not configured on this device.`);

  if (provider.kind === 'openai') {
    return createOpenAI({ apiKey })(selection.modelId);
  }
  if (provider.kind === 'google') {
    return createGoogleGenerativeAI({ apiKey })(selection.modelId);
  }
  if (provider.kind === 'anthropic') {
    return createAnthropic({ apiKey })(selection.modelId);
  }
  const rawBaseURL = baseUrlOverrides[provider.id]?.trim() || provider.defaultBaseUrl;
  if (!rawBaseURL) throw new Error(`${provider.name} base URL is required.`);
  const baseURL = assertSafeAiBaseUrl(rawBaseURL);
  return createOpenAICompatible({ name: provider.id, apiKey, baseURL })(selection.modelId);
}
