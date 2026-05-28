import { AlertDialog, Host, Text, TextButton } from '@expo/ui/jetpack-compose';

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
      {visible ? (
        <AlertDialog onDismissRequest={onDismiss}>
          <AlertDialog.Title>
            <Text>{title}</Text>
          </AlertDialog.Title>
          <AlertDialog.Text>
            <Text>{message}</Text>
          </AlertDialog.Text>
          <AlertDialog.ConfirmButton>
            <TextButton onClick={onDismiss}>
              <Text>{confirmLabel}</Text>
            </TextButton>
          </AlertDialog.ConfirmButton>
        </AlertDialog>
      ) : null}
    </Host>
  );
}
