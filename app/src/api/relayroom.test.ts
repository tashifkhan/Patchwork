import { afterEach, describe, expect, test } from 'bun:test';

// Exercises the real @relayroom/client package with a mocked fetch.

import { RelayroomError, fetchRelayroomCatalog, relayroomGenerate, relayroomTarget } from './relayroom';

const conn = { baseUrl: 'http://127.0.0.1:8317/v1/', apiKey: 'test-key' };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(routes: Record<string, unknown>, calls: { url: string; init?: RequestInit }[] = []) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace('http://127.0.0.1:8317/v1', '');
    const key = Object.keys(routes).find((route) => path.startsWith(route));
    if (!key) return new Response('{"error":{"type":"not_found","message":"no"}}', { status: 404 });
    const value = routes[key];
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value), { status: 200 });
  }) as typeof fetch;
  return calls;
}

describe('relayroomTarget', () => {
  test('aliases have no provider; full names split at the first slash', () => {
    expect(relayroomTarget('opus')).toEqual({ model: 'opus' });
    expect(relayroomTarget('vercel/moonshotai/kimi-k2')).toEqual({ provider: 'vercel', model: 'moonshotai/kimi-k2' });
  });
});

describe('fetchRelayroomCatalog', () => {
  test('lists aliases first, then live models of configured providers', async () => {
    const calls = mockFetch({
      '/providers': {
        data: [
          { id: 'google', configured: true, live_count: 2, modes: ['auto', 'sub', 'api'] },
          { id: 'nvidia', configured: false, live_count: 0, modes: ['auto', 'api'] },
        ],
      },
      '/models': { data: [{ id: 'fast', owned_by: 'alias', routed_to: 'google/gemini-3.8-flash' }, { id: 'x', owned_by: 'google' }] },
      '/catalog/models?provider=google': {
        data: [
          {
            id: 'gemini-3.8-flash',
            name: 'Gemini 3.8 Flash',
            provider: 'google',
            available: true,
            capabilities: { input: ['text', 'image', 'audio'], reasoning: true },
            modes: ['auto', 'api'],
          },
          { id: 'retired', provider: 'google', available: false },
        ],
      },
    });
    const models = await fetchRelayroomCatalog(conn);
    expect(models.map((model) => model.id)).toEqual(['fast', 'google/gemini-3.8-flash']);
    expect(models[0]).toMatchObject({ alias: true, routedTo: 'google/gemini-3.8-flash' });
    expect(models[1]).toMatchObject({ input: ['text', 'image', 'audio'], reasoning: true, modes: ['auto', 'api'] });
    // Unconfigured providers are never queried; the key goes as a bearer token.
    expect(calls.some((call) => call.url.includes('provider=nvidia'))).toBe(false);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });
});

describe('relayroomGenerate', () => {
  test('sends provider, mode, reasoning, attachment, JSON output and tags', async () => {
    const calls = mockFetch({
      '/generate': {
        provider: 'google',
        gateway_model: 'google/api/gemini-3.8-flash',
        output: { type: 'json', json: { tasks: [{ title: 'Buy milk' }] } },
        usage: { total_tokens: 30, cost: 0.0001 },
      },
    });
    const result = await relayroomGenerate(conn, {
      model: 'google/gemini-3.8-flash',
      mode: 'api',
      prompt: 'Make tasks',
      attachment: { kind: 'audio', mimeType: 'audio/aac', data: 'AAAA' },
      reasoning: 'low',
      json: true,
      tags: { feature: 'dictation' },
    });
    const body = JSON.parse(String(calls[0].init?.body));
    // The client adds its own fields (e.g. `stream: false`); check what the app sets.
    expect(body).toMatchObject({
      provider: 'google',
      model: 'gemini-3.8-flash',
      mode: 'api',
      prompt: 'Make tasks',
      attachments: [{ kind: 'audio', mime_type: 'audio/aac', data: 'data:audio/aac;base64,AAAA' }],
      config: { reasoning: 'low' },
      output: { format: 'json' },
      tags: { app: 'patchwork', feature: 'dictation' },
    });
    expect(JSON.parse(result.text)).toEqual({ tasks: [{ title: 'Buy milk' }] });
    expect(result.gatewayModel).toBe('google/api/gemini-3.8-flash');
  });

  test('auto mode and aliases send no mode or provider', async () => {
    const calls = mockFetch({ '/generate': { provider: 'anthropic', gateway_model: 'x', output: { text: 'hi' } } });
    await relayroomGenerate(conn, { model: 'opus', mode: 'auto', prompt: 'p' });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.provider).toBeUndefined();
    expect(body.mode).toBeUndefined();
    expect(body.model).toBe('opus');
  });

  test('typed relay errors become readable messages', async () => {
    mockFetch({
      '/generate': new Response(JSON.stringify({ error: { type: 'mode_not_permitted', message: 'sub blocked' } }), {
        status: 403,
      }),
    });
    const error = await relayroomGenerate(conn, { model: 'google/x', mode: 'sub', prompt: 'p' }).catch((e) => e);
    expect(error).toBeInstanceOf(RelayroomError);
    expect(error.type).toBe('mode_not_permitted');
    expect(error.message).toContain('Switch the model to Auto');
  });
});
