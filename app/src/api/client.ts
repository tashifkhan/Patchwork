// Low-level fetch wrapper for the FastAPI proxy.
//
// The base URL defaults to EXPO_PUBLIC_PROXY_URL (or localhost) but can be
// overridden at runtime from the Settings screen. The settings store calls
// setApiBaseUrl() on hydration and whenever the user changes it, so this module
// stays decoupled from the store (no circular import).

const DEFAULT_BASE_URL =
  process.env.EXPO_PUBLIC_PROXY_URL?.replace(/\/+$/, '') ?? 'http://localhost:8000';

let apiBaseUrl = DEFAULT_BASE_URL;

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isConflict() {
    return this.status === 409;
  }

  get isNotImplemented() {
    return this.status === 501;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const parsed = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === 'object' && 'detail' in parsed
        ? (parsed as { detail: unknown }).detail
        : parsed;
    const message =
      typeof detail === 'string' ? detail : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, detail);
  }

  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
