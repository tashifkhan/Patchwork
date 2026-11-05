import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import { providerLogoSvg } from '@/components/settings/ai-provider-logos';
import { useTheme } from '@/components/theme/context';
import { base64Encode } from '@/lib/base64';
import { View } from '@/tw';

export interface AiProviderIconProps {
  providerId: string;
  custom?: boolean;
  /** A key is stored for this provider. Android rings the avatar in the accent. */
  configured?: boolean;
  size?: number;
}

/**
 * Provider avatar with the company's real logo. Colored marks (Google,
 * DeepSeek, NVIDIA) keep their brand colors; monochrome marks (OpenAI,
 * Anthropic, OpenRouter, OpenCode) draw in the theme's text color. Custom
 * OpenAI-compatible servers have no logo and get a server glyph.
 *
 * iOS: a neutral rounded tile like an app icon in Settings.
 * Android: a tonal circle, ringed in the accent once a key is saved.
 */
export function AiProviderIcon({ providerId, custom, configured, size = 44 }: AiProviderIconProps) {
  const { colors, scheme } = useTheme();
  const isIOS = Platform.OS === 'ios';
  const dark = scheme === 'dark';

  const glyphColor = colors.text;
  const uri = useMemo(() => {
    if (custom) return null;
    const svg = providerLogoSvg(providerId, glyphColor);
    return svg ? `data:image/svg+xml;base64,${base64Encode(svg)}` : null;
  }, [custom, providerId, glyphColor]);

  const background = isIOS ? (dark ? colors.bg3 : '#FFFFFF') : colors.bg3;
  const glyph = Math.round(size * (isIOS ? 0.62 : 0.52));

  return (
    <View
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: isIOS ? Math.round(size * 0.23) : size / 2,
        borderCurve: 'continuous',
        backgroundColor: background,
        // A white tile on the white iOS grouped cell needs an edge.
        borderWidth: isIOS ? 0.5 : configured ? 2 : 0,
        borderColor: isIOS ? colors.separator : colors.accent,
      }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: glyph, height: glyph }}
          contentFit="contain"
          cachePolicy="memory"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <MaterialCommunityIcons
          name={custom ? 'server-network' : 'api'}
          size={glyph}
          color={colors.text2}
        />
      )}
    </View>
  );
}
