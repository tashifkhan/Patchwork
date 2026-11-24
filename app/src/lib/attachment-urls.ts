import type { AttachmentAccess, TaskAttachment } from '@/api/types';

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i;

export function isImageAttachment(attachment: TaskAttachment) {
  return attachment.mime?.startsWith('image/') ?? IMAGE_EXTENSION.test(attachment.name);
}

/** WebDAV URL of the original file, or null when it is not in this account's Files. */
export function attachmentFileUri(access: AttachmentAccess, attachment: TaskAttachment) {
  if (attachment.path) {
    const path = attachment.path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
    return `${access.filesRoot}${path}`;
  }
  // A direct WebDAV link on the same server can load with the account's auth.
  // Anything else (a share page, another host) must never get the auth header.
  if (attachment.url.startsWith(access.filesRoot)) return attachment.url;
  return null;
}

/** Server-rendered thumbnail. Falls back to the original file when there is no file id. */
export function attachmentPreviewUri(access: AttachmentAccess, attachment: TaskAttachment, size: number) {
  if (attachment.file_id) {
    const px = Math.round(size);
    return `${access.serverRoot}index.php/core/preview?fileId=${encodeURIComponent(attachment.file_id)}&x=${px}&y=${px}&a=1`;
  }
  return attachmentFileUri(access, attachment);
}
