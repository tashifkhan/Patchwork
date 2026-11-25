import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AttachmentAccess, AttachmentUpload, TaskAttachment } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { attachmentFileUri, attachmentPreviewUri, isImageAttachment } from '@/lib/attachment-urls';
import { haptics } from '@/lib/haptics';
import { DURATION, SPRING } from '@/lib/motion';
import type { OutboxAttachmentEntry } from '@/features/sync/outbox';
import { Text, View } from '@/tw';

const TILE = 88;
const RADIUS = 16;

const SPATIAL = LinearTransition.springify()
  .damping(SPRING.spatialSlow.damping)
  .stiffness(SPRING.spatialSlow.stiffness);

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type AttachmentSource = 'library' | 'camera' | 'files';

/**
 * Tile row for a task's attachments. Files live in the account's Nextcloud
 * Files; image thumbnails come from the server's preview endpoint so the row
 * never downloads full-size photos.
 *
 * With no `access` (an account that isn't Nextcloud) the row is read-only and
 * attachments open as links.
 */
export function TaskAttachments({
  access,
  attachments,
  queued,
  uploading,
  onPick,
  onRemove,
  onDiscardQueued,
  onOpen,
}: {
  access: AttachmentAccess | null;
  attachments: TaskAttachment[];
  /** Picked offline, waiting in the outbox. */
  queued: OutboxAttachmentEntry[];
  /** Picked files still uploading. */
  uploading: AttachmentUpload[];
  onPick: (source: AttachmentSource) => void;
  onRemove: (attachment: TaskAttachment) => void;
  onDiscardQueued: (entry: OutboxAttachmentEntry) => void;
  /** Hand a non-image (or a link) to another app. */
  onOpen: (attachment: TaskAttachment) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [viewing, setViewing] = useState<TaskAttachment | null>(null);
  const [discarding, setDiscarding] = useState<OutboxAttachmentEntry | null>(null);

  return (
    <>
      <Animated.View
        layout={SPATIAL}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {attachments.map((attachment) => (
          <Animated.View key={attachment.url} entering={FadeIn.duration(DURATION.medium1)} layout={SPATIAL}>
            <AttachmentTile access={access} attachment={attachment} onPress={() => setViewing(attachment)} />
          </Animated.View>
        ))}
        {queued.map((entry) => (
          <Animated.View key={entry.id} entering={FadeIn.duration(DURATION.medium1)} layout={SPATIAL}>
            <LocalTile
              file={entry.file}
              label={`${entry.file.name}, waiting to upload`}
              onPress={() => {
                haptics.tap();
                setDiscarding(entry);
              }}>
              <View
                style={{
                  position: 'absolute',
                  right: 6,
                  bottom: 6,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: entry.lastError ? colors.danger : colors.bg,
                }}>
                <MaterialCommunityIcons
                  name={entry.lastError ? 'cloud-alert-outline' : 'cloud-upload-outline'}
                  size={16}
                  color={entry.lastError ? '#fff' : colors.text2}
                />
              </View>
            </LocalTile>
          </Animated.View>
        ))}
        {uploading.map((file) => (
          <LocalTile key={file.uri} file={file} label={`Uploading ${file.name}`} dimmed>
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.text} />
            </View>
          </LocalTile>
        ))}
        {access ? (
          <>
            <AddTile icon="image-plus" label="Photos" hint="Attach a photo" onPress={() => onPick('library')} />
            <AddTile icon="camera-outline" label="Camera" hint="Take a photo" onPress={() => onPick('camera')} />
            <AddTile icon="paperclip" label="Files" hint="Attach a file" onPress={() => onPick('files')} />
          </>
        ) : null}
      </Animated.View>

      <AttachmentViewer
        access={access}
        attachment={viewing}
        onClose={() => setViewing(null)}
        onOpen={onOpen}
        onRemove={(attachment) => {
          setViewing(null);
          onRemove(attachment);
        }}
      />

      <NativeAlert
        visible={discarding != null}
        title="Waiting to upload"
        message={
          discarding?.lastError
            ? `${discarding.lastError} Discard it, or keep it and use Sync now in Settings → Offline.`
            : 'It uploads when you are back online. Discard it to drop the file from this device.'
        }
        confirmLabel="Discard"
        dismissLabel="Keep"
        onDismiss={() => setDiscarding(null)}
        onConfirm={() => {
          const entry = discarding;
          setDiscarding(null);
          if (entry) onDiscardQueued(entry);
        }}
      />
    </>
  );
}

function AttachmentTile({
  access,
  attachment,
  onPress,
}: {
  access: AttachmentAccess | null;
  attachment: TaskAttachment;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { scale } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  // The preview endpoint can be off (previews disabled, unsupported format);
  // the original file is the fallback.
  const uri =
    access && isImageAttachment(attachment)
      ? failed
        ? attachmentFileUri(access, attachment)
        : attachmentPreviewUri(access, attachment, TILE * scale)
      : null;

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole={uri ? 'imagebutton' : 'button'}
      accessibilityLabel={`Open ${attachment.name}`}
      style={({ pressed }) => ({
        width: TILE,
        height: TILE,
        borderRadius: RADIUS,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: colors.bg2,
        opacity: pressed ? 0.7 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      {uri && access ? (
        <Image
          source={{ uri, headers: access.headers }}
          recyclingKey={attachment.url}
          style={{ width: TILE, height: TILE }}
          contentFit="cover"
          transition={DURATION.short4}
          cachePolicy="disk"
          onError={() => setFailed(true)}
        />
      ) : (
        <FileLabel icon={fileIcon(attachment.mime, attachment.name, !attachment.path)} name={attachment.name} />
      )}
    </Pressable>
  );
}

/** A file that only exists on this device so far: uploading, or queued. */
function LocalTile({
  file,
  label,
  dimmed,
  onPress,
  children,
}: {
  file: AttachmentUpload;
  label: string;
  dimmed?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const image = file.mime.startsWith('image/');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: TILE,
        height: TILE,
        borderRadius: RADIUS,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: colors.bg2,
        opacity: pressed ? 0.7 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      {image ? (
        <Image
          source={{ uri: file.uri }}
          style={{ width: TILE, height: TILE, opacity: dimmed ? 0.45 : 1 }}
          contentFit="cover"
        />
      ) : (
        <View style={{ opacity: dimmed ? 0.45 : 1 }}>
          <FileLabel icon={fileIcon(file.mime, file.name, false)} name={file.name} />
        </View>
      )}
      {children}
    </Pressable>
  );
}

function FileLabel({ icon, name }: { icon: IconName; name: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 6 }}>
      <MaterialCommunityIcons name={icon} size={26} color={colors.text2} />
      <Text numberOfLines={2} style={{ fontSize: 11, color: colors.text2, textAlign: 'center' }}>
        {name}
      </Text>
    </View>
  );
}

function AddTile({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint}
      style={({ pressed }) => ({
        width: TILE,
        height: TILE,
        borderRadius: pressed ? TILE / 2 : RADIUS,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.gray2,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      })}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.text2} />
      <Text style={{ fontSize: 13, color: colors.text2 }}>{label}</Text>
    </Pressable>
  );
}

function AttachmentViewer({
  access,
  attachment,
  onClose,
  onOpen,
  onRemove,
}: {
  access: AttachmentAccess | null;
  attachment: TaskAttachment | null;
  onClose: () => void;
  onOpen: (attachment: TaskAttachment) => Promise<void>;
  onRemove: (attachment: TaskAttachment) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const image = attachment != null && isImageAttachment(attachment);
  const full = access && attachment && image ? attachmentFileUri(access, attachment) : null;
  const placeholder = access && attachment && image ? attachmentPreviewUri(access, attachment, 256) : null;
  const inFiles = Boolean(access && attachment && attachmentFileUri(access, attachment));

  async function open() {
    if (!attachment || opening) return;
    haptics.tap();
    setOpening(true);
    try {
      await onOpen(attachment);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : 'Try opening the attachment again.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <Modal
      visible={attachment != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
        {full && access ? (
          <Image
            source={{ uri: full, headers: access.headers }}
            placeholder={placeholder ? { uri: placeholder, headers: access.headers } : undefined}
            placeholderContentFit="contain"
            style={{ flex: 1, width }}
            contentFit="contain"
            transition={DURATION.medium1}
            cachePolicy="disk"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
            <MaterialCommunityIcons
              name={fileIcon(attachment?.mime ?? null, attachment?.name ?? '', !inFiles)}
              size={64}
              color="#fff"
            />
            <Text style={{ color: '#fff', textAlign: 'center', fontSize: 17, fontWeight: '600' }}>
              {attachment?.name}
            </Text>
            {!inFiles ? (
              <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center' }} selectable>
                {attachment?.url}
              </Text>
            ) : null}
            <Pressable
              onPress={() => void open()}
              accessibilityRole="button"
              accessibilityLabel={inFiles ? `Open ${attachment?.name ?? 'file'}` : 'Open link'}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 20,
                height: 44,
                borderRadius: 22,
                backgroundColor: pressed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.18)',
              })}>
              {opening ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <MaterialCommunityIcons name={inFiles ? 'export-variant' : 'open-in-new'} size={20} color="#fff" />
              )}
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                {inFiles ? 'Open in…' : 'Open link'}
              </Text>
            </Pressable>
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 12,
            right: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
          <ViewerButton icon="close" label="Close" onPress={onClose} />
          <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' }}>
            {attachment?.name}
          </Text>
          {full && inFiles ? (
            <ViewerButton icon="export-variant" label="Share" busy={opening} onPress={() => void open()} />
          ) : null}
          {access ? (
            <ViewerButton icon="trash-can-outline" label="Remove attachment" onPress={() => setConfirming(true)} />
          ) : null}
        </View>
      </View>
      <NativeAlert
        visible={openError != null}
        title="Could not open attachment"
        message={openError ?? ''}
        onDismiss={() => setOpenError(null)}
      />
      <NativeAlert
        visible={confirming}
        title="Remove attachment"
        message="It comes off this to-do. If Patchwork uploaded it, the file is deleted from Nextcloud Files too."
        confirmLabel="Remove"
        dismissLabel="Cancel"
        onDismiss={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          if (attachment) onRemove(attachment);
        }}
      />
    </Modal>
  );
}

function ViewerButton({
  icon,
  label,
  busy,
  onPress,
}: {
  icon: IconName;
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
      })}>
      {busy ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name={icon} size={22} color="#fff" />}
    </Pressable>
  );
}

function fileIcon(mime: string | null, name: string, link: boolean): IconName {
  if (link) return 'link-variant';
  const type = mime?.toLowerCase() ?? '';
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (type.startsWith('image/')) return 'file-image-outline';
  if (type === 'application/pdf' || extension === 'pdf') return 'file-pdf-box';
  if (type.startsWith('video/')) return 'file-video-outline';
  if (type.startsWith('audio/')) return 'file-music-outline';
  if (/zip|compressed|tar|gzip/.test(type) || ['zip', 'gz', 'tar', '7z', 'rar'].includes(extension)) {
    return 'folder-zip-outline';
  }
  if (/sheet|excel|csv/.test(type) || ['xlsx', 'xls', 'csv', 'ods'].includes(extension)) return 'file-table-outline';
  if (/presentation|powerpoint/.test(type) || ['pptx', 'ppt', 'odp', 'key'].includes(extension)) {
    return 'file-presentation-box';
  }
  if (type.startsWith('text/') || /word|document/.test(type) || ['doc', 'docx', 'odt', 'txt', 'md'].includes(extension)) {
    return 'file-document-outline';
  }
  return 'file-outline';
}
