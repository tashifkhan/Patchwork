/**
 * Expo wraps native errors as "Calling the 'generate' function has failed
 * → Caused by: <reason>" (iOS) or "Call to function ... has been rejected.
 * → Caused by: <reason>" (Android). Keep the reason the native side wrote.
 */
export function nativeCause(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const parts = message.split(/→\s*Caused by:\s*/);
  return (parts.at(-1) ?? message).trim() || 'The on-device model failed.';
}
