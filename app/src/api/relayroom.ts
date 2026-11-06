/**
 * RelayRoom, through the gateway's JSON HTTP API.
 *
 * This used to depend on a local `@relayroom/client` checkout. That works on
 * the author's machine but not in CI or an EAS builder, so the four calls the
 * app needs live here: providers, the live catalog, one route's options, and
 * generate. The gateway API is plain JSON with a bearer key.
 *
 * This module adapts it to the app: a flat model list for the picker, the
 * route's exact options, and one JSON generate call.
 */

export const RELAYROOM_DEFAULT_URL = 'http://127.0.0.1:8317/v1';

export type RelayMode = 'auto' | 'sub' | 'api';

/** One model the gateway can route, flattened for the model picker. */
export interface RelayroomModel {
  /** What the app stores and sends: an alias (`opus`) or `<provider>/<model>`. */
  id: string;
  name: string;
  /** Upstream provider id (`google`, `anthropic`, …); undefined for aliases. */
  provider?: string;
  providerName?: string;
  /** Bare model id the provider uses. */
  model: string;
  alias: boolean;
  /** For aliases: the first step of the ladder. */
  routedTo?: string;
  input: string[];
  output: string[];
  reasoning: boolean;
  tools: boolean;
  modes: RelayMode[];
  contextWindow?: number;
}

export interface RelayroomModelOptions {
  gatewayId?: string;
  mode?: string;
  available: boolean;
  inputTypes: string[];
  /** Exact effort strings the route accepts; send one verbatim. */
  reasoningLevels: string[];
  reasoningDefault?: string;
  jsonNative: boolean;
  responseFormats: string[];
  attachments: { kind: string; mimeTypes: string[] }[];
}

/** A RelayRoom failure, worded for a person. `type` is the relay's error type. */
export class RelayroomError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type?: string
  ) {
    super(message);
    this.name = 'RelayroomError';
  }
}

interface Connection {
  baseUrl: string;
  apiKey: string;
}

/** Long enough for a thinking model on a voice note; the relay streams nothing back here. */
const TIMEOUT_MS = 120_000;

/** The relay's typed errors, in words a person can act on. */
const ERROR_HINTS: Record<string, string> = {
  mode_not_supported: 'That provider has no route for the chosen mode. Switch the model to Auto.',
  mode_not_permitted: "Your gateway key isn't allowed that mode. Switch the model to Auto.",
  provider_blocked: 'Your gateway key is blocked from that provider.',
  model_not_found: 'RelayRoom has no live route for that model any more. Pick another one.',
  provider_not_found: 'RelayRoom does not know that provider.',
  alias_unavailable: "None of the alias's steps can serve your gateway key right now.",
};

interface GatewayErrorBody {
  error?: { type?: string; message?: string };
}

interface ProviderRecord {
  id: string;
  name?: string;
  configured?: boolean;
  live_count?: number;
  modes?: string[];
}

interface ModelRecord {
  id: string;
  name?: string;
  provider_name?: string;
  available?: boolean;
  capabilities?: { input?: string[]; output?: string[]; reasoning?: boolean; tools?: boolean };
  modes?: string[];
  limit?: { context?: number };
}

interface GenerateRequest {
  provider?: string;
  model: string;
  mode?: RelayMode;
  prompt?: string;
  attachments?: { kind?: string; mime_type: string; data?: string }[];
  config?: { reasoning?: string };
  output?: { format?: 'text' | 'json' };
  stream?: boolean;
  tags?: Record<string, string>;
}

interface GenerateResponse {
  provider: string;
  gateway_model: string;
  alias?: string;
  output: { text?: string; json?: unknown };
  usage?: { total_tokens?: number; cost?: number };
}

function gatewayUrl(conn: Connection, path: string) {
  return `${conn.baseUrl.trim().replace(/\/+$/, '')}${path}`;
}

/** One JSON request to the gateway, with the same error wording everywhere. */
async function requestJson<T>(
  conn: Connection,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await globalThis.fetch(gatewayUrl(conn, path), {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${conn.apiKey}`,
        'X-Client': 'patchwork',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    const timedOut = controller.signal.aborted;
    throw new RelayroomError(
      timedOut
        ? 'RelayRoom took too long to respond.'
        : `Could not reach RelayRoom at ${conn.baseUrl}. Check the gateway is running and the URL is reachable from this device.`,
      0,
      timedOut ? 'timeout' : 'unreachable'
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new RelayroomError('RelayRoom sent a response that is not JSON.', response.status);
    }
  }

  if (!response.ok) {
    const error = (payload as GatewayErrorBody | null)?.error;
    const type = typeof error?.type === 'string' ? error.type : undefined;
    const message =
      typeof error?.message === 'string' ? error.message : `RelayRoom returned ${response.status}.`;
    if (response.status === 401) {
      throw new RelayroomError(
        'RelayRoom rejected the gateway key. Paste a key from the console under API keys.',
        401,
        type
      );
    }
    const hint = type ? ERROR_HINTS[type] : undefined;
    throw new RelayroomError(hint ? `${hint} (${message})` : message, response.status, type);
  }

  return payload as T;
}

// ── Catalog ────────────────────────────────────────────────────────────

const RELAY_MODES: RelayMode[] = ['auto', 'sub', 'api'];

function relayModes(values: readonly string[] | undefined): RelayMode[] {
  const modes = (values ?? ['auto']).filter((mode): mode is RelayMode => (RELAY_MODES as string[]).includes(mode));
  return modes.length > 0 ? modes : ['auto'];
}

function list(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
}

/**
 * Operator aliases from the OpenAI-compatible `/v1/models` (`owned_by:
 * "alias"`). The typed client has no alias listing, so this one call is
 * plain fetch with the same key.
 */
async function fetchAliases(conn: Connection): Promise<RelayroomModel[]> {
  try {
    const response = await globalThis.fetch(gatewayUrl(conn, '/models'), {
      headers: { Accept: 'application/json', Authorization: `Bearer ${conn.apiKey}` },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: { id: string; owned_by?: string; routed_to?: string }[] };
    return (payload.data ?? [])
      .filter((model) => model.owned_by === 'alias')
      .map((model) => ({
        id: model.id,
        name: model.id,
        model: model.id,
        alias: true,
        routedTo: model.routed_to,
        // Filled from model-options once picked; an alias can fan out anywhere.
        input: ['text'],
        output: ['text'],
        reasoning: false,
        tools: false,
        modes: ['auto'] as RelayMode[],
      }));
  } catch {
    return [];
  }
}

/**
 * Every model the gateway can route right now: your aliases first, then each
 * configured provider's live catalog with capabilities and modes.
 */
export async function fetchRelayroomCatalog(conn: Connection): Promise<RelayroomModel[]> {
  const [providerList, aliases] = await Promise.all([
    requestJson<{ data?: ProviderRecord[] }>(conn, 'GET', '/providers'),
    fetchAliases(conn),
  ]);
  const live = (providerList.data ?? []).filter(
    (provider) => provider.configured && (provider.live_count ?? 0) > 0
  );
  const catalogs = await Promise.all(
    live.map((provider) =>
      requestJson<{ data?: ModelRecord[] }>(
        conn,
        'GET',
        `/catalog/models?provider=${encodeURIComponent(provider.id)}`
      )
        .then((result) => ({ provider, models: result.data ?? [] }))
        .catch(() => ({ provider, models: [] as ModelRecord[] }))
    )
  );
  const models = catalogs.flatMap(({ provider, models: records }) =>
    records
      .filter((record) => record.available)
      .map((record): RelayroomModel => {
        const caps = record.capabilities ?? {};
        return {
          id: `${provider.id}/${record.id}`,
          name: record.name ?? record.id,
          provider: provider.id,
          providerName: record.provider_name ?? provider.name ?? provider.id,
          model: record.id,
          alias: false,
          input: list(caps.input, ['text']),
          output: list(caps.output, ['text']),
          reasoning: caps.reasoning === true,
          tools: caps.tools === true,
          modes: relayModes(record.modes ?? provider.modes),
          contextWindow: typeof record.limit?.context === 'number' ? record.limit.context : undefined,
        };
      })
  );
  return [...aliases, ...models];
}

/** What one route accepts. Spends no tokens. */
export async function fetchRelayroomModelOptions(
  conn: Connection,
  target: { provider?: string; model: string; mode?: RelayMode }
): Promise<RelayroomModelOptions> {
  const query = new URLSearchParams();
  if (target.provider) query.set('provider', target.provider);
  query.set('model', target.model);
  if (target.mode && target.mode !== 'auto') query.set('mode', target.mode);

  const options = await requestJson<{
    gateway_id?: string;
    mode?: string;
    available?: boolean;
    input_types?: string[];
    reasoning?: { levels?: string[]; default?: string };
    structured_output_native?: boolean;
    response_formats?: string[];
    attachments?: { kind: string; mime_types: string[] }[];
  }>(conn, 'GET', `/model-options?${query}`);

  return {
    gatewayId: options.gateway_id,
    mode: options.mode,
    available: options.available !== false,
    inputTypes: options.input_types ?? ['text'],
    reasoningLevels: options.reasoning?.levels ?? [],
    reasoningDefault: options.reasoning?.default ?? undefined,
    jsonNative: !!options.structured_output_native,
    responseFormats: options.response_formats ?? ['text'],
    attachments: (options.attachments ?? []).map((entry) => ({ kind: entry.kind, mimeTypes: entry.mime_types })),
  };
}

// ── Generate ───────────────────────────────────────────────────────────

export interface RelayroomGenerateInput {
  /** Alias, or `<provider>/<model>` as stored by the picker. */
  model: string;
  mode?: RelayMode;
  prompt: string;
  attachment?: { kind: 'image' | 'audio'; mimeType: string; data: string };
  reasoning?: string;
  /** Ask for JSON natively; the relay enforces it per route. */
  json?: boolean;
  /** Shows up in the RelayRoom Usage view, e.g. `{ feature: 'dictation' }`. */
  tags?: Record<string, string>;
}

export interface RelayroomGenerateResult {
  text: string;
  provider: string;
  gatewayModel: string;
  alias?: string;
  usage?: { total_tokens?: number; cost?: number };
}

/** Split a stored id into the request's provider + model (aliases have no provider). */
export function relayroomTarget(id: string): { provider?: string; model: string } {
  const slash = id.indexOf('/');
  if (slash <= 0) return { model: id };
  return { provider: id.slice(0, slash), model: id.slice(slash + 1) };
}

export async function relayroomGenerate(conn: Connection, input: RelayroomGenerateInput): Promise<RelayroomGenerateResult> {
  const request: GenerateRequest = {
    ...relayroomTarget(input.model),
    // `auto` is the gateway default, so leave it out of the body.
    ...(input.mode && input.mode !== 'auto' ? { mode: input.mode } : {}),
    prompt: input.prompt,
    ...(input.attachment
      ? {
          attachments: [
            {
              kind: input.attachment.kind,
              mime_type: input.attachment.mimeType,
              // Audio must be base64; a data URL works for every kind.
              data: `data:${input.attachment.mimeType};base64,${input.attachment.data}`,
            },
          ],
        }
      : {}),
    ...(input.reasoning ? { config: { reasoning: input.reasoning } } : {}),
    ...(input.json ? { output: { format: 'json' as const } } : {}),
    stream: false,
    tags: { app: 'patchwork', ...input.tags },
  };
  const response = await requestJson<GenerateResponse>(conn, 'POST', '/generate', request);
  const output = response.output;
  const text =
    output.json !== undefined && output.json !== null ? JSON.stringify(output.json) : (output.text ?? '');
  return {
    text,
    provider: response.provider,
    gatewayModel: response.gateway_model,
    alias: response.alias ?? undefined,
    usage: response.usage,
  };
}
