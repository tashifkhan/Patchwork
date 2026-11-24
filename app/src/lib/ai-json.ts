/**
 * The JSON part of a model reply. Large models follow "STRICT JSON only".
 * Gemini Nano and Apple's on-device model often add a fence, a sentence
 * before it, or a note after it. Tries the whole reply first, then a fenced
 * block, then the outermost object or array.
 */
export function extractJsonText(reply: string): string {
  const trimmed = reply.trim();
  if (isJson(trimmed)) return trimmed;

  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  if (fenced && isJson(fenced)) return fenced;

  // Whichever bracket opens first is the outer value: `[{...}]` is an array.
  const pairs = (
    [
      ['{', '}'],
      ['[', ']'],
    ] as const
  )
    .filter(([open]) => trimmed.includes(open))
    .sort(([a], [b]) => trimmed.indexOf(a) - trimmed.indexOf(b));
  for (const [open, close] of pairs) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      if (isJson(candidate)) return candidate;
    }
  }
  return fenced ?? trimmed;
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
