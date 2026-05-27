import { Host, Image, Popover, Text, VStack } from '@expo/ui/swift-ui';
import { fixedSize, font, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';

import { useTheme } from '@/components/theme/context';

import { CONNECTION_HELP_PARAGRAPHS, CONNECTION_HELP_TITLE } from './connection-help-content';

/** Info button that reveals connection instructions in a native SwiftUI popover. */
export function ConnectionHelp() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Host matchContents>
      <Popover isPresented={open} onIsPresentedChange={setOpen} arrowEdge="top">
        <Popover.Trigger>
          <Image
            systemName="info.circle"
            size={22}
            color={colors.accent}
            onPress={() => setOpen(true)}
          />
        </Popover.Trigger>
        <Popover.Content>
          <VStack
            alignment="leading"
            spacing={12}
            modifiers={[padding({ all: 20 }), frame({ width: 300 })]}>
            <Text
              modifiers={[
                font({ size: 18, weight: 'semibold' }),
                fixedSize({ horizontal: false, vertical: true }),
              ]}>
              {CONNECTION_HELP_TITLE}
            </Text>
            {CONNECTION_HELP_PARAGRAPHS.map((paragraph) => (
              <Text
                key={paragraph}
                modifiers={[
                  font({ size: 14 }),
                  fixedSize({ horizontal: false, vertical: true }),
                ]}>
                {paragraph}
              </Text>
            ))}
          </VStack>
        </Popover.Content>
      </Popover>
    </Host>
  );
}
