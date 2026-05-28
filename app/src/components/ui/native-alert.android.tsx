import { AlertDialog, Host, Text, TextButton } from '@expo/ui/jetpack-compose';

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
      {visible ? (
        <AlertDialog onDismissRequest={onDismiss}>
          <AlertDialog.Title>
            <Text>{title}</Text>
          </AlertDialog.Title>
          <AlertDialog.Text>
            <Text>{message}</Text>
          </AlertDialog.Text>
          <AlertDialog.ConfirmButton>
            <TextButton onClick={onConfirm}>
              <Text>{confirmLabel}</Text>
            </TextButton>
          </AlertDialog.ConfirmButton>
          {dismissLabel ? (
            <AlertDialog.DismissButton>
              <TextButton onClick={onDismiss}>
                <Text>{dismissLabel}</Text>
              </TextButton>
            </AlertDialog.DismissButton>
          ) : null}
        </AlertDialog>
      ) : null}
    </Host>
  );
}
