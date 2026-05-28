import { Alert, Button, Host } from '@expo/ui/swift-ui';

interface NativeAlertProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onDismiss: () => void;
}

export function NativeAlert({ visible, title, message, confirmLabel = 'OK', onDismiss }: NativeAlertProps) {
  return (
    <Host matchContents>
      <Alert title={title} message={message} isPresented={visible} onIsPresentedChange={(next) => {
        if (!next) onDismiss();
      }}>
        <Alert.Actions>
          <Button label={confirmLabel} onPress={onDismiss} />
        </Alert.Actions>
      </Alert>
    </Host>
  );
}
