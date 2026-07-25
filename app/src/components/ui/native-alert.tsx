import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

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
  const shownRef = useRef(false);
  const callbacksRef = useRef({ onDismiss, onConfirm });

  useEffect(() => {
    callbacksRef.current = { onDismiss, onConfirm };
  }, [onDismiss, onConfirm]);

  useEffect(() => {
    if (!visible) {
      shownRef.current = false;
      return;
    }
    if (shownRef.current) return;
    shownRef.current = true;

    Alert.alert(title, message, [
      ...(dismissLabel ? [{ text: dismissLabel, style: 'cancel' as const, onPress: () => callbacksRef.current.onDismiss() }] : []),
      { text: confirmLabel, onPress: () => callbacksRef.current.onConfirm() },
    ], { cancelable: true, onDismiss: () => callbacksRef.current.onDismiss() });
  }, [confirmLabel, dismissLabel, message, title, visible]);

  return null;
}
