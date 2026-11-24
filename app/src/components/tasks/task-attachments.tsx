import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AttachmentAccess, TaskAttachment } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { attachmentFileUri, attachmentPreviewUri, isImageAttachment } from '@/lib/attachment-urls';
import { haptics } from '@/lib/haptics';
import { DURATION, SPRING } from '@/lib/motion';
import { Text, View } from '@/tw';

const TILE = 88;
const RADIUS = 16;

const SPATIAL = LinearTransition.springify()
  .damping(SPRING.spatialSlow.damping)
  .stiffness(SPRING.spatialSlow.stiffness);

/**
 * Thumbnail row for a task's image attachments. Images live in the account's
 * Nextcloud Files; thumbnails come from the server's preview endpoint so the
 * row never downloads full-size photos.
 */
export function TaskAttachments({
  access,
  attachments,
  uploading,
  onPick,
  onRemove,
}: {
  access: AttachmentAccess;
  attachments: TaskAttachment[];
  /** Local URIs of images still uploading. */
  uploading: string[];
  onPick: (source: 'library' | 'camera') => void;
  onRemove: (attachment: TaskAttachment) => void;
}) {
  const { colors } = useTheme();
  const [viewing, setViewing] = useState<TaskAttachment | null>(null);

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
        {uploading.map((uri) => (
          <View
            key={uri}
            accessibilityLabel="Uploading image"
            style={{ width: TILE, height: TILE, borderRadius: RADIUS, overflow: 'hidden', borderCurve: 'continuous' }}>
            <Image source={{ uri }} style={{ width: TILE, height: TILE, opacity: 0.45 }} contentFit="cover" />
            <View
              style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <ActivityIndicator color={colors.text} />
            </View>
          </View>
        ))}
        <AddTile icon="image-plus" label="Photos" onPress={() => onPick('library')} />
        <AddTile icon="camera-outline" label="Camera" onPress={() => onPick('camera')} />
      </Animated.View>

      <AttachmentViewer
        access={access}
        attachment={viewing}
        onClose={() => setViewing(null)}
        onRemove={(attachment) => {
          setViewing(null);
          onRemove(attachment);
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
  access: AttachmentAccess;
  attachment: TaskAttachment;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { scale } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  const image = isImageAttachment(attachment);
  // The preview endpoint can be off (previews disabled, unsupported format);
  // the original file is the fallback.
  const uri = image
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
      accessibilityRole="imagebutton"
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
      {uri ? (
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
        <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 6 }}>
          <MaterialCommunityIcons name="file-outline" size={24} color={colors.text2} />
          <Text numberOfLines={2} style={{ fontSize: 11, color: colors.text2, textAlign: 'center' }}>
            {attachment.name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function AddTile({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === 'Camera' ? 'Take a photo' : 'Attach a photo'}
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
  onRemove,
}: {
  access: AttachmentAccess;
  attachment: TaskAttachment | null;
  onClose: () => void;
  onRemove: (attachment: TaskAttachment) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [confirming, setConfirming] = useState(false);
  const full = attachment ? attachmentFileUri(access, attachment) : null;
  const placeholder = attachment ? attachmentPreviewUri(access, attachment, 256) : null;

  return (
    <Modal
      visible={attachment != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
        {full ? (
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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ color: '#fff', textAlign: 'center' }} selectable>
              {attachment?.url}
            </Text>
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
          <ViewerButton icon="trash-can-outline" label="Remove attachment" onPress={() => setConfirming(true)} />
        </View>
      </View>
      <NativeAlert
        visible={confirming}
        title="Remove image"
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
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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
      <MaterialCommunityIcons name={icon} size={22} color="#fff" />
    </Pressable>
  );
}
