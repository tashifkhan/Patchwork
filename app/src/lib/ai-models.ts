import AsyncStorage from '@react-native-async-storage/async-storage';

export type AiProviderKind = 'openai' | 'google' | 'anthropic' | 'openai-compatible';
export type AiProviderId = string;

export interface AiModelInfo {
  id: string;
  name: string;
  input: string[];
  output: string[];
  reasoning?: boolean;
  toolCall?: boolean;
  contextWindow?: number;
}

export interface AiProviderInfo {
  id: AiProviderId;
  name: string;
  kind: AiProviderKind;
  env: string;
  defaultBaseUrl?: string;
  docs: string;
  models: AiModelInfo[];
  /** True for user-defined OpenAI-compatible providers. */
  custom?: boolean;
}

export interface AiCustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  /** Optional list of model IDs the user wants available for selection. */
  modelIds?: string[];
}

export interface AiModelSelection {
  providerId: AiProviderId;
  modelId: string;
  modelName?: string;
  input?: string[];
  output?: string[];
  reasoning?: boolean;
}

const MODELS_DEV_CACHE_KEY = 'patchwork.ai.models-dev-cache';
const MODELS_DEV_URL = 'https://models.dev/api.json';

export const BUILTIN_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'openrouter',
  'nvidia',
  'opencode',
  'opencode-go',
] as const;

/**
 * Providers that authenticate with the same upstream credential. The key is
 * stored once under the target id, so pasting an OpenCode key on either screen
 * configures both.
 */
export const AI_KEY_ALIASES: Record<string, string> = {
  'opencode-go': 'opencode',
};

/** Keychain slot a provider's API key lives in. */
export function aiCredentialId(providerId: AiProviderId): AiProviderId {
  return AI_KEY_ALIASES[providerId] ?? providerId;
}

const BUILTIN_PROVIDER_META: Record<(typeof BUILTIN_PROVIDER_IDS)[number], Omit<AiProviderInfo, 'models'>> = {
  openai: { id: 'openai', name: 'OpenAI', kind: 'openai', env: 'OPENAI_API_KEY', docs: 'https://platform.openai.com/docs' },
  anthropic: { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', env: 'ANTHROPIC_API_KEY', docs: 'https://docs.anthropic.com' },
  google: { id: 'google', name: 'Google', kind: 'google', env: 'GEMINI_API_KEY', docs: 'https://ai.google.dev' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', kind: 'openai-compatible', env: 'DEEPSEEK_API_KEY', defaultBaseUrl: 'https://api.deepseek.com', docs: 'https://api-docs.deepseek.com' },
  openrouter: { id: 'openrouter', name: 'OpenRouter', kind: 'openai-compatible', env: 'OPENROUTER_API_KEY', defaultBaseUrl: 'https://openrouter.ai/api/v1', docs: 'https://openrouter.ai/docs' },
  nvidia: { id: 'nvidia', name: 'NVIDIA', kind: 'openai-compatible', env: 'NVIDIA_API_KEY', defaultBaseUrl: 'https://integrate.api.nvidia.com/v1', docs: 'https://docs.api.nvidia.com' },
  opencode: { id: 'opencode', name: 'OpenCode Zen', kind: 'openai-compatible', env: 'OPENCODE_API_KEY', defaultBaseUrl: 'https://opencode.ai/zen/v1', docs: 'https://opencode.ai/docs/zen' },
  'opencode-go': { id: 'opencode-go', name: 'OpenCode Go', kind: 'openai-compatible', env: 'OPENCODE_API_KEY', defaultBaseUrl: 'https://opencode.ai/zen/go/v1', docs: 'https://opencode.ai/docs/zen' },
};

export const AI_PROVIDERS: AiProviderInfo[] = BUILTIN_PROVIDER_IDS.map((id) => ({ ...BUILTIN_PROVIDER_META[id], models: [] }));
export const DEFAULT_AI_MODELS: AiModelSelection[] = [];

export interface LoadProvidersResult {
  providers: AiProviderInfo[];
  source: 'network' | 'cache' | 'fallback';
  error?: string;
  fetchedAt?: number;
}

export async function loadAiProviders(): Promise<LoadProvidersResult> {
  try {
    const response = await fetchWithTimeout(MODELS_DEV_URL, 12000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const providers = normalizeModelsDev(payload);
    const fetchedAt = Date.now();
    await AsyncStorage.setItem(MODELS_DEV_CACHE_KEY, JSON.stringify({ providers, fetchedAt }));
    return { providers, source: 'network', fetchedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load models.dev';
    const cached = await readCache();
    if (cached) return { providers: cached.providers, source: 'cache', error: message, fetchedAt: cached.fetchedAt };
    return { providers: AI_PROVIDERS, source: 'fallback', error: message };
  }
}

async function readCache(): Promise<{ providers: AiProviderInfo[]; fetchedAt?: number } | null> {
  const raw = await AsyncStorage.getItem(MODELS_DEV_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { providers: parsed as AiProviderInfo[] };
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.providers)) {
      return { providers: parsed.providers as AiProviderInfo[], fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : undefined };
    }
  } catch {}
  return null;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function buildProvidersWithCustom(
  base: AiProviderInfo[],
  custom: AiCustomProvider[]
): AiProviderInfo[] {
  const customInfos: AiProviderInfo[] = custom.map((entry) => ({
    id: entry.id,
    name: entry.name || entry.id,
    kind: 'openai-compatible',
    env: 'API_KEY',
    defaultBaseUrl: entry.baseUrl,
    docs: '',
    custom: true,
    models: (entry.modelIds ?? []).map((id) => ({
      id,
      name: id,
      input: ['text'],
      output: ['text'],
    })),
  }));
  return [...base, ...customInfos];
}

export function providerById(providerId: AiProviderId, providers: AiProviderInfo[] = AI_PROVIDERS): AiProviderInfo | null {
  const found = providers.find((provider) => provider.id === providerId);
  if (found) return found;
  const builtin = BUILTIN_PROVIDER_IDS.find((id) => id === providerId);
  if (builtin) return { ...BUILTIN_PROVIDER_META[builtin], models: [] };
  return null;
}

export function modelById(selection: AiModelSelection, providers: AiProviderInfo[] = AI_PROVIDERS) {
  return providerById(selection.providerId, providers)?.models.find((model) => model.id === selection.modelId) ?? null;
}

export function supportsImage(selection: AiModelSelection) {
  return selection.input?.includes('image') ?? true;
}

export function capabilityLabel(model: AiModelInfo | AiModelSelection) {
  const input = model.input?.length ? model.input : ['text'];
  const output = model.output?.length ? model.output : ['text'];
  const labels = [`In: ${input.join('/')}`, `Out: ${output.join('/')}`];
  if (model.reasoning) labels.push('Reasoning');
  return labels.join(' · ');
}

export function modelBadges(model: AiModelInfo | AiModelSelection): string[] {
  const badges: string[] = [];
  if (model.input?.includes('image')) badges.push('Vision');
  if (model.input?.includes('audio')) badges.push('Audio');
  if (model.reasoning) badges.push('Reasoning');
  if ('toolCall' in model && model.toolCall) badges.push('Tools');
  return badges;
}

function normalizeModelsDev(payload: unknown): AiProviderInfo[] {
  if (typeof payload !== 'object' || payload === null) return AI_PROVIDERS;
  const root = payload as Record<string, unknown>;
  return BUILTIN_PROVIDER_IDS.map((id) => {
    const raw = typeof root[id] === 'object' && root[id] !== null ? (root[id] as Record<string, unknown>) : {};
    const fallback = BUILTIN_PROVIDER_META[id];
    const npm = typeof raw.npm === 'string' ? raw.npm : '';
    const api = typeof raw.api === 'string' ? raw.api : fallback.defaultBaseUrl;
    const models = typeof raw.models === 'object' && raw.models !== null ? (raw.models as Record<string, unknown>) : {};
    return {
      id,
      name: typeof raw.name === 'string' ? raw.name : fallback.name,
      kind:
        id === 'openai'
          ? 'openai'
          : id === 'google'
            ? 'google'
            : id === 'anthropic'
              ? 'anthropic'
              : npm.includes('openai-compatible') || api
                ? 'openai-compatible'
                : fallback.kind,
      env: Array.isArray(raw.env) && typeof raw.env[0] === 'string' ? raw.env[0] : fallback.env,
      defaultBaseUrl: api,
      docs: typeof raw.doc === 'string' ? raw.doc : fallback.docs,
      models: Object.values(models)
        .map(normalizeModel)
        .filter((model): model is AiModelInfo => model !== null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

function normalizeModel(value: unknown): AiModelInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;
  const modalities = typeof raw.modalities === 'object' && raw.modalities !== null ? (raw.modalities as Record<string, unknown>) : {};
  const limit = typeof raw.limit === 'object' && raw.limit !== null ? (raw.limit as Record<string, unknown>) : {};
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : id,
    input: Array.isArray(modalities.input) ? modalities.input.filter((item): item is string => typeof item === 'string') : ['text'],
    output: Array.isArray(modalities.output) ? modalities.output.filter((item): item is string => typeof item === 'string') : ['text'],
    reasoning: typeof raw.reasoning === 'boolean' ? raw.reasoning : undefined,
    toolCall: typeof raw.tool_call === 'boolean' ? raw.tool_call : undefined,
    contextWindow: typeof limit.context === 'number' ? limit.context : undefined,
  };
}
