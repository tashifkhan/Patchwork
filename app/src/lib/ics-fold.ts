/**
 * RFC 5545 §3.1 line folding. Content lines longer than 75 octets continue on
 * the next line, which starts with a single space.
 */

/** Folds one unfolded content line. */
export function foldIcsLine(line: string) {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = utf8Length(char);
    // Continuation lines spend one octet on the leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * Refolds a whole calendar object: unfolds whatever is there, folds every
 * line to 75 octets, and writes CRLF line ends. Safe to run more than once.
 */
export function foldIcs(calendarData: string) {
  return calendarData
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .map(foldIcsLine)
    .join('\r\n');
}

function utf8Length(char: string) {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}
