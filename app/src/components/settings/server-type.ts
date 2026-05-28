import type { ServerType } from '@/lib/credentials';

export interface ServerTypeMenuProps {
  value: ServerType;
  onChange: (value: ServerType) => void;
}

export const SERVER_TYPES: { value: ServerType; label: string }[] = [
  { value: 'mailbox', label: 'Mailbox.org' },
  { value: 'nextcloud', label: 'Nextcloud' },
  { value: 'openxchange', label: 'Open-Xchange' },
  { value: 'owncloud', label: 'ownCloud' },
  { value: 'sabredav', label: 'sabre/dav' },
  { value: 'synology', label: 'Synology Calendar' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
];

export function serverTypeLabel(value: ServerType): string {
  return SERVER_TYPES.find((option) => option.value === value)?.label ?? 'Unknown';
}
