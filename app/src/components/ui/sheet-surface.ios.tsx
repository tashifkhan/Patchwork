import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';
import { Text } from '@/tw';

import type { SheetSurfaceProps } from './sheet-surface';

/**
 * iOS sheet surface: a solid sheet, not Liquid Glass. The host `Stack.Screen`
 * sets `contentStyle.backgroundColor` to `transparent`, so this view paints
 * the whole sheet, under the native header too, and the system glass never
 * shows through. The colour is what iOS uses for an elevated sheet:
 * systemBackground in light, secondarySystemBackground in dark, the same as
 * the in-app picker sheets (`useSheetPanel`).
 *
 * The sheet title is handed to the native header rather than drawn in the body.
 */
export function SheetSurface({ children, title, subtitle, bottomInset }: SheetSurfaceProps) {
  const { colors, scheme } = useTheme();
  const background = scheme === 'dark' ? colors.bg2 : colors.bg;
  const insets = useSafeAreaInsets();
  const padBottom = bottomInset ?? Math.max(insets.bottom, 12);
  // The sheet's native header is translucent and floats over the body, so
  // anything not in an auto-inset scroll view (the subtitle, a fixed top row)
  // ended up under it. Start the body below the header instead; scroll views
  // there then see no overlap and add no inset of their own.
  const headerHeight = useHeaderHeight();

  const body = (
    <View style={{ flex: 1, paddingTop: title ? headerHeight : 0 }}>
      {/*
        Every sheet route has the native header, so the title goes there (one
        centred title, like Reminders). Drawing it here as well stacked two
        titles on top of each other.
      */}
      {title ? <Stack.Screen options={{ title }} /> : null}
      {subtitle ? (
        <Text
          style={{ fontSize: 13, color: colors.text2, textAlign: 'center', paddingHorizontal: 20, paddingTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}
      <View style={{ flex: 1, paddingBottom: padBottom }}>{children}</View>
    </View>
  );

  return <View style={{ flex: 1, backgroundColor: background }}>{body}</View>;
}
