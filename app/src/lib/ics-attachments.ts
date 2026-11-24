import type { TaskAttachment } from '@/api/types';

/**
 * Reading and writing iCalendar `ATTACH` properties on a VTODO.
 *
 * Patchwork writes the same shape Nextcloud Calendar uses for event
 * attachments, so the file lives in Nextcloud Files and the task only carries
 * a link to it:
 *
 *   ATTACH;FMTTYPE=image/jpeg;FILENAME=/Tasks/<uid>/photo.jpg;
 *    X-NC-FILE-ID=4821;X-NC-HAS-PREVIEW=true:https://cloud.example.com/f/4821
 *
 * `FILENAME` is the path inside the user's Files root. Inline base64
 * attachments (`VALUE=BINARY`) are skipped: they bloat every sync and nothing
 * here writes them.
 */

const VALARM_BLOCK = /BEGIN:VALARM\r?\n[\s\S]*?END:VALARM/gi;
const ALARM_SLOT = 'X-PATCHWORK-ATTACH-ALARM-SLOT';

export function parseAttachments(calendarData: string): TaskAttachment[] {
  const unfolded = calendarData.replace(VALARM_BLOCK, '').replace(/\r?\n[ \t]/g, '');
  const attachments: TaskAttachment[] = [];
  for (const line of unfolded.split(/\r?\n/)) {
    if (!/^ATTACH[;:]/i.test(line)) continue;
    const parsed = splitProperty(line);
    if (!parsed) continue;
    const { params, value } = parsed;
    if (params.VALUE?.toUpperCase() === 'BINARY' || params.ENCODING?.toUpperCase() === 'BASE64') continue;
    if (!value) continue;
    const path = params.FILENAME?.startsWith('/') ? params.FILENAME : null;
    attachments.push({
      url: value,
      name: displayName(params.FILENAME ?? value),
      mime: params.FMTTYPE?.toLowerCase() ?? null,
      path,
      file_id: params['X-NC-FILE-ID'] ?? null,
      has_preview: params['X-NC-HAS-PREVIEW']?.toLowerCase() === 'true',
    });
  }
  return attachments;
}

/** Appends one `ATTACH` line to the VTODO, folded to 75 octets. */
export function addAttachment(calendarData: string, attachment: TaskAttachment) {
  const line = foldIcsLine(formatAttachment(attachment));
  return calendarData.replace(/\r?\nEND:VTODO/i, `\r\n${line}\r\nEND:VTODO`);
}

/** Removes every `ATTACH` line pointing at `url`, leaving alarm attachments alone. */
export function removeAttachment(calendarData: string, url: string) {
  const alarms: string[] = [];
  const masked = calendarData.replace(VALARM_BLOCK, (match) => {
    alarms.push(match);
    return `${ALARM_SLOT}:${alarms.length - 1}`;
  });
  const withoutLine = masked.replace(
    /^ATTACH[;:].*(?:\r?\n[ \t].*)*(?:\r?\n|$)/gim,
    (match) => {
      const parsed = splitProperty(match.replace(/\r?\n[ \t]/g, '').replace(/\r?\n$/, ''));
      return parsed?.value === url ? '' : match;
    },
  );
  return withoutLine.replace(
    new RegExp(`^${ALARM_SLOT}:(\\d+)\r?$`, 'gm'),
    (_match, index: string) => alarms[Number(index)] ?? '',
  );
}

export function formatAttachment(attachment: TaskAttachment) {
  const params: string[] = [];
  if (attachment.mime) params.push(`FMTTYPE=${paramValue(attachment.mime)}`);
  params.push(`FILENAME=${paramValue(attachment.path ?? attachment.name)}`);
  if (attachment.file_id) params.push(`X-NC-FILE-ID=${paramValue(attachment.file_id)}`);
  if (attachment.has_preview) params.push('X-NC-HAS-PREVIEW=true');
  return `ATTACH;${params.join(';')}:${attachment.url}`;
}

/** RFC 5545 §3.1: lines longer than 75 octets continue on a line starting with a space. */
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

function utf8Length(char: string) {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

/** Quotes a parameter value when it holds a separator; `"` itself is not allowed. */
function paramValue(value: string) {
  const clean = value.replace(/["\r\n]/g, '');
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
}

/** Splits `NAME;P=V;P="a:b":value`, honouring quoted parameter values. */
function splitProperty(line: string): { params: Record<string, string>; value: string } | null {
  const params: Record<string, string> = {};
  let index = line.search(/[;:]/);
  if (index < 0) return null;
  while (line[index] === ';') {
    let cursor = index + 1;
    let raw = '';
    let quoted = false;
    for (; cursor < line.length; cursor += 1) {
      const char = line[cursor];
      if (char === '"') quoted = !quoted;
      else if (!quoted && (char === ';' || char === ':')) break;
      raw += char;
    }
    const equals = raw.indexOf('=');
    if (equals > 0) {
      params[raw.slice(0, equals).toUpperCase()] = raw.slice(equals + 1).replace(/^"|"$/g, '');
    }
    index = cursor;
  }
  if (line[index] !== ':') return null;
  return { params, value: line.slice(index + 1).trim() };
}

function displayName(pathOrUrl: string) {
  const withoutQuery = pathOrUrl.split(/[?#]/)[0] ?? pathOrUrl;
  const last = withoutQuery.split('/').filter(Boolean).pop() ?? pathOrUrl;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
