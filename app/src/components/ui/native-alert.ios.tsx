import { Alert, Button, Host } from '@expo/ui/swift-ui';

interface NativeAlertProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  dismissLabel?: string;
  onDismiss: () => void;
  onConfirm?: () => void;
}

export function NativeAlert({
  visible,
  title,
  message,
  confirmLabel = 'OK',
  dismissLabel,
  onDismiss,
  onConfirm = onDismiss,
}: NativeAlertProps) {
  return (
    <Host matchContents>
      <Alert title={title} message={message} isPresented={visible} onIsPresentedChange={(next) => {
        if (!next) onDismiss();
      }}>
        <Alert.Actions>
          {dismissLabel ? <Button label={dismissLabel} onPress={onDismiss} /> : null}
          <Button label={confirmLabel} onPress={onConfirm} />
        </Alert.Actions>
      </Alert>
    </Host>
  );
}
