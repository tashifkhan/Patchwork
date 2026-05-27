import { BottomSheet, Column as UIColumn, Host, Text as UIText } from '@expo/ui';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Text } from '@/tw';

import { CONNECTION_HELP_PARAGRAPHS, CONNECTION_HELP_TITLE } from './connection-help-content';

/** Web/fallback: an info button that opens connection instructions in a sheet. */
export function ConnectionHelp() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Text style={{ color: colors.accent, fontSize: 22 }}>{'ⓘ'}</Text>
      </Pressable>
      <Host style={{ position: 'absolute', width: 0, height: 0 }}>
        <BottomSheet isPresented={open} onDismiss={() => setOpen(false)}>
          <UIColumn spacing={12} style={{ padding: 24 }}>
            <UIText textStyle={{ fontSize: 20, fontWeight: '700', color: colors.text }}>
              {CONNECTION_HELP_TITLE}
            </UIText>
            {CONNECTION_HELP_PARAGRAPHS.map((paragraph) => (
              <UIText key={paragraph} textStyle={{ fontSize: 14, color: colors.text2 }}>
                {paragraph}
              </UIText>
            ))}
          </UIColumn>
        </BottomSheet>
      </Host>
    </>
  );
}
