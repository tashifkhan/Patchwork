import { describe, expect, test } from 'bun:test';

import { isNetworkError } from './connectivity';

function shaped(name: string, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(Object.assign(new Error(message), { name }), extra);
}

describe('isNetworkError', () => {
  test('treats a dropped fetch as a network failure', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkError(shaped('AbortError', 'Aborted'))).toBe(true);
  });

  test('uses status 0 for wrapped request errors', () => {
    expect(isNetworkError(shaped('ApiError', 'The server took too long to respond.', { status: 0 }))).toBe(true);
    expect(isNetworkError(shaped('RelayroomError', 'Could not reach RelayRoom', { status: 0 }))).toBe(true);
  });

  test('never queues something the server answered', () => {
    expect(isNetworkError(shaped('ApiError', 'Task list not found', { status: 404 }))).toBe(false);
    // An HTTP status wins over a message that happens to mention the network.
    expect(isNetworkError(shaped('ApiError', 'Network policy denied', { status: 403 }))).toBe(false);
  });

  test('reads GitHub error codes', () => {
    expect(isNetworkError(shaped('GitHubError', 'Network request failed', { code: 'network' }))).toBe(true);
    expect(isNetworkError(shaped('GitHubError', 'Not found', { code: 'not_found', status: 404 }))).toBe(false);
  });

  test('reads Jira connection failures but not API errors', () => {
    expect(isNetworkError(shaped('JiraError', 'Could not reach Jira: Network request failed'))).toBe(true);
    expect(isNetworkError(shaped('JiraError', 'Jira took too long to respond.'))).toBe(true);
    expect(isNetworkError(shaped('JiraError', 'Field summary is required', { status: 400 }))).toBe(false);
  });

  test('ignores non-errors', () => {
    expect(isNetworkError('offline')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
