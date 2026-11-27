import { AlertDialog, Host, Text, TextButton } from '@expo/ui/jetpack-compose';

import { useComposeTheme } from '@/components/theme/compose-theme';
import { useTheme } from '@/components/theme/context';

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
  const { colors } = useTheme();
  const composeTheme = useComposeTheme();
  const buttonColors = { contentColor: colors.accent };
  return (
    <Host matchContents colorScheme={composeTheme.colorScheme} colorOverrides={composeTheme.colorOverrides}>
      {visible ? (
        <AlertDialog
          onDismissRequest={onDismiss}
          // Same elevated surface as menus, and no tonal tint, so AMOLED
          // dialogs stay neutral instead of picking up a palette wash.
          tonalElevation={0}
          colors={{
            containerColor: colors.surfaceContainerHigh,
            titleContentColor: colors.text,
            textContentColor: colors.text2,
          }}>
          <AlertDialog.Title>
            <Text>{title}</Text>
          </AlertDialog.Title>
          <AlertDialog.Text>
            <Text>{message}</Text>
          </AlertDialog.Text>
          <AlertDialog.ConfirmButton>
            <TextButton onClick={onConfirm} colors={buttonColors}>
              <Text>{confirmLabel}</Text>
            </TextButton>
          </AlertDialog.ConfirmButton>
          {dismissLabel ? (
            <AlertDialog.DismissButton>
              <TextButton onClick={onDismiss} colors={buttonColors}>
                <Text>{dismissLabel}</Text>
              </TextButton>
            </AlertDialog.DismissButton>
          ) : null}
        </AlertDialog>
      ) : null}
    </Host>
  );
}
