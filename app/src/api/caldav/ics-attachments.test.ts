import { describe, expect, test } from 'bun:test';

import type { AttachmentAccess, TaskAttachment } from '@/api/types';
import { attachmentFileUri, attachmentPreviewUri, isImageAttachment } from '@/lib/attachment-urls';
import { addAttachment, foldIcsLine, parseAttachments, removeAttachment } from '@/api/caldav/ics-attachments';

const VTODO = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VTODO',
  'UID:abc',
  'SUMMARY:Fix the sink',
  'BEGIN:VALARM',
  'ACTION:AUDIO',
  'ATTACH:https://example.com/ding.wav',
  'TRIGGER:20261123T090000Z',
  'END:VALARM',
  'END:VTODO',
  'END:VCALENDAR',
  '',
].join('\r\n');

const photo: TaskAttachment = {
  url: 'https://cloud.example.com/f/4821',
  name: 'sink leak; $& before.jpg',
  mime: 'image/jpeg',
  path: '/Tasks/abc/sink leak; $& before.jpg',
  file_id: '4821',
  has_preview: true,
};

const access: AttachmentAccess = {
  serverRoot: 'https://cloud.example.com/',
  filesRoot: 'https://cloud.example.com/remote.php/dav/files/taf/',
  origin: 'https://cloud.example.com',
  headers: {},
};

describe('ics attachments', () => {
  test('round-trips an attachment and ignores the alarm sound', () => {
    const written = addAttachment(VTODO, photo);
    expect(parseAttachments(written)).toEqual([photo]);
    expect(written).toContain('ATTACH:https://example.com/ding.wav');
  });

  test('folds long lines at 75 octets', () => {
    const written = addAttachment(VTODO, { ...photo, path: `/Tasks/abc/${'x'.repeat(200)}.jpg` });
    for (const line of written.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(parseAttachments(written)[0]?.path).toBe(`/Tasks/abc/${'x'.repeat(200)}.jpg`);
  });

  test('folding never splits a multi-byte character', () => {
    const folded = foldIcsLine(`ATTACH;FILENAME=${'é'.repeat(80)}:x`);
    expect(folded.replace(/\r\n /g, '')).toBe(`ATTACH;FILENAME=${'é'.repeat(80)}:x`);
  });

  test('skips inline base64 attachments', () => {
    const inline = VTODO.replace(
      'END:VTODO',
      'ATTACH;FMTTYPE=image/png;ENCODING=BASE64;VALUE=BINARY:iVBORw0KGgo=\r\nEND:VTODO',
    );
    expect(parseAttachments(inline)).toEqual([]);
  });

  test('removes only the matching link', () => {
    const other = { ...photo, url: 'https://cloud.example.com/f/9', name: 'b.jpg', path: '/Tasks/abc/b.jpg', file_id: '9' };
    const both = addAttachment(addAttachment(VTODO, photo), other);
    const removed = removeAttachment(both, photo.url);
    expect(parseAttachments(removed)).toEqual([other]);
    expect(removed).toContain('ATTACH:https://example.com/ding.wav');
  });

  test('reads attachments written by Nextcloud Calendar', () => {
    const nextcloud = VTODO.replace(
      'END:VTODO',
      'ATTACH;FMTTYPE=image/png;FILENAME=/Calendar/shot.png;X-NC-FILE-ID=77;X-NC-HAS\r\n -PREVIEW=true:https://cloud.example.com/f/77\r\nEND:VTODO',
    );
    expect(parseAttachments(nextcloud)).toEqual([
      {
        url: 'https://cloud.example.com/f/77',
        name: 'shot.png',
        mime: 'image/png',
        path: '/Calendar/shot.png',
        file_id: '77',
        has_preview: true,
      },
    ]);
  });
});

describe('attachment urls', () => {
  test('builds preview and WebDAV urls', () => {
    expect(attachmentPreviewUri(access, photo, 256)).toBe(
      'https://cloud.example.com/index.php/core/preview?fileId=4821&x=256&y=256&a=1',
    );
    expect(attachmentFileUri(access, photo)).toBe(
      'https://cloud.example.com/remote.php/dav/files/taf/Tasks/abc/sink%20leak%3B%20%24%26%20before.jpg',
    );
  });

  test('never sends auth to a link outside Files', () => {
    const external = { ...photo, path: null, file_id: null, url: 'https://evil.example.com/a.jpg' };
    expect(attachmentPreviewUri(access, external, 256)).toBeNull();
    expect(isImageAttachment({ ...external, mime: null })).toBe(true);
  });
});
