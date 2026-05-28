import { Alert, Modal, Pressable } from 'react-native';

import { Text, View } from '@/tw';

interface NativeAlertProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  dismissLabel?: string;
  onDismiss: () => void;
  onConfirm?: () => void;
}

export function NativeAlert({ visible, title, message, confirmLabel = 'OK', dismissLabel, onDismiss, onConfirm = onDismiss }: NativeAlertProps) {
  if (visible) {
    Alert.alert(title, message, [
      ...(dismissLabel ? [{ text: dismissLabel, style: 'cancel' as const, onPress: onDismiss }] : []),
      { text: confirmLabel, onPress: onConfirm },
    ]);
  }

  return (
    <Modal visible={false} transparent>
      <View>
        <Pressable onPress={onDismiss}>
          <Text>{confirmLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
