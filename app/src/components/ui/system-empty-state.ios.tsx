import { Button, ContentUnavailableView, Host, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, tint } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';

import type { SystemEmptyStateProps } from './system-empty-state';

/**
 * SwiftUI's ContentUnavailableView, the empty / error view iOS itself uses
 * (Mail, Files, Notes). The first action is a prominent glass button; the
 * rest are plain glass buttons, all in the app accent.
 */
export function SystemEmptyState({ symbol, title, description, actions, style }: SystemEmptyStateProps) {
  const { colors, scheme } = useTheme();
  return (
    // ContentUnavailableView fills its frame and centres itself, so give the
    // host a real frame instead of sizing it to its contents.
    <Host
      colorScheme={scheme === 'dark' ? 'dark' : 'light'}
      style={[{ width: '100%', flexGrow: 1, minHeight: 340 }, style] as StyleProp<ViewStyle>}>
      <ContentUnavailableView
        title={title}
        systemImage={symbol as SFSymbol}
        description={description}
        actions={
          actions && actions.length > 0 ? (
            <VStack spacing={10}>
              {actions.map((action, index) => (
                <Button
                  key={action.label}
                  label={action.label}
                  onPress={() => {
                    haptics.tap();
                    action.onPress();
                  }}
                  modifiers={[
                    buttonStyle(index === 0 ? 'glassProminent' : 'glass'),
                    controlSize('large'),
                    tint(colors.accent),
                  ]}
                />
              ))}
            </VStack>
          ) : undefined
        }
      />
    </Host>
  );
}
