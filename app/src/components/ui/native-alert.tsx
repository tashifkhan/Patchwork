import { Alert, Modal, Pressable } from 'react-native';

import { Text, View } from '@/tw';

interface NativeAlertProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onDismiss: () => void;
}

export function NativeAlert({ visible, title, message, confirmLabel = 'OK', onDismiss }: NativeAlertProps) {
  if (visible) {
    Alert.alert(title, message, [{ text: confirmLabel, onPress: onDismiss }]);
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
