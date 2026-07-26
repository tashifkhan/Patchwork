import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';

import { useTheme } from '@/components/theme/context';
import type { ThemeColors } from '@/lib/theme';
import { View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Per-provider glyph + hue. Every provider used to render the same grey key,
 * which made the list impossible to scan; the icon now carries the identity and
 * the ring carries the "key saved" state.
 */
const PROVIDER_ICONS: Record<string, { icon: IconName; tint: keyof ThemeColors }> = {
  openai: { icon: 'robot-outline', tint: 'green' },
  anthropic: { icon: 'creation', tint: 'orange' },
  google: { icon: 'google', tint: 'accent' },
  deepseek: { icon: 'dolphin', tint: 'purple' },
  openrouter: { icon: 'transit-connection-variant', tint: 'accent' },
  nvidia: { icon: 'chip', tint: 'green' },
  opencode: { icon: 'memory', tint: 'purple' },
  // Same family as OpenCode Zen — shared tint, faster glyph.
  'opencode-go': { icon: 'run-fast', tint: 'purple' },
};

const CUSTOM = { icon: 'server-network' as IconName, tint: 'gray' as keyof ThemeColors };

export function aiProviderIconName(providerId: string, custom?: boolean): IconName {
  if (custom) return CUSTOM.icon;
  return PROVIDER_ICONS[providerId]?.icon ?? 'api';
}

export function useAiProviderTint(providerId: string, custom?: boolean): string {
  const { colors } = useTheme();
  const entry = custom ? CUSTOM : PROVIDER_ICONS[providerId];
  return colors[entry?.tint ?? 'accent'] as string;
}

export interface AiProviderIconProps {
  providerId: string;
  custom?: boolean;
  /** A key is stored for this provider — fills the bubble with its tint. */
  configured?: boolean;
  size?: number;
}

/** Circular provider avatar. Tinted-solid when configured, soft when not. */
export function AiProviderIcon({
  providerId,
  custom,
  configured,
  size = 44,
}: AiProviderIconProps) {
  const { colors } = useTheme();
  const tint = useAiProviderTint(providerId, custom);
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: configured ? tint : colors.primaryContainer,
      }}>
      <MaterialCommunityIcons
        name={aiProviderIconName(providerId, custom)}
        size={Math.round(size * 0.5)}
        color={configured ? colors.onAccent : colors.onPrimaryContainer}
      />
    </View>
  );
}
