import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { useKeyboardLift } from '@/components/ui/keyboard';
import { ElasticPressable } from '@/components/ui/motion';
import { RollingNumber } from '@/components/ui/rolling-number';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { Text, View } from '@/tw';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Floating toolbar shown while a to-do is open in place, like the Things
 * "Move / Delete / ..." bar, styled as an M3 Expressive *vibrant* floating
 * toolbar: a full-round `primaryContainer` pill with the main action as a
 * filled `primary` button and the rest as icon buttons.
 */
export function TaskActionBar({
  bottom,
  onMove,
  onDelete,
  onDetails,
  deleteLabel = 'Delete',
}: {
  bottom: number;
  onMove: () => void;
  onDelete: () => void;
  /** Omit to hide the "Details" button (e.g. on the detail screen itself). */
  onDetails?: () => void;
  deleteLabel?: string;
}) {
  const { colors } = useTheme();

  return (
    <KeyboardBar bottom={bottom}>
      <BarSurface>
        <ElasticPressable
          variant="control"
          onPress={() => {
            haptics.tap();
            onMove();
          }}
          accessibilityRole="button"
          accessibilityLabel="Move"
          android_ripple={{ color: colors.separator }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 48,
            paddingLeft: 16,
            paddingRight: 20,
            // Expressive shape morph: the pill squares off while held.
            borderRadius: pressed ? 12 : 24,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: colors.accent,
            opacity: pressed && Platform.OS === 'ios' ? 0.85 : 1,
          })}>
          {GLASS ? (
            <SymbolView name="arrow.right" size={18} tintColor={colors.onAccent} weight="semibold" />
          ) : (
            <MaterialCommunityIcons name="arrow-right" size={22} color={colors.onAccent} />
          )}
          <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>Move</Text>
        </ElasticPressable>
        <IconAction
          icon="trash-can-outline"
          sf="trash"
          label={deleteLabel}
          color={GLASS ? colors.danger : colors.onPrimaryContainer}
          onPress={onDelete}
        />
        {onDetails ? (
          <IconAction
            icon="arrow-expand"
            sf="arrow.up.left.and.arrow.down.right"
            label="Details"
            color={GLASS ? colors.text : colors.onPrimaryContainer}
            onPress={onDetails}
          />
        ) : null}
      </BarSurface>
    </KeyboardBar>
  );
}

/**
 * Multi-select toolbar (long-press a to-do to start). Same surface as the
 * single to-do bar: the main action, completing, is the filled pill.
 */
export function SelectionBar({
  bottom,
  count,
  onComplete,
  onMove,
  onPin,
  onMerge,
  onDelete,
  onCancel,
}: {
  bottom: number;
  count: number;
  onComplete: () => void;
  onMove: () => void;
  onPin: () => void;
  /** Hidden below two selected. */
  onMerge: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const iconColor = GLASS ? colors.text : colors.onPrimaryContainer;
  const disabled = count === 0;

  return (
    <KeyboardBar bottom={bottom}>
      <BarSurface>
        <IconAction icon="close" sf="xmark" label="Cancel selection" color={iconColor} onPress={onCancel} />
        <ElasticPressable
          variant="control"
          disabled={disabled}
          onPress={() => {
            haptics.success();
            onComplete();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Complete ${count} selected`}
          android_ripple={{ color: colors.separator }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 48,
            paddingLeft: 14,
            paddingRight: 18,
            borderRadius: pressed ? 12 : 24,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: colors.accent,
            opacity: disabled ? 0.5 : pressed && Platform.OS === 'ios' ? 0.85 : 1,
          })}>
          <MaterialCommunityIcons name="check-all" size={20} color={colors.onAccent} />
          <RollingNumber value={count} style={{ color: colors.onAccent, fontSize: 16, lineHeight: 22, fontWeight: '600' }} />
        </ElasticPressable>
        {disabled ? null : (
          <>
            <IconAction icon="arrow-right" sf="arrow.right" label="Move selected" color={iconColor} onPress={onMove} />
            <IconAction icon="pin-outline" sf="pin" label="Pin or unpin selected" color={iconColor} onPress={onPin} />
            {count > 1 ? (
              <IconAction
                icon="call-merge"
                sf="arrow.triangle.merge"
                label="Merge selected into one to-do"
                color={iconColor}
                onPress={onMerge}
              />
            ) : null}
            <IconAction
              icon="trash-can-outline"
              sf="trash"
              label="Delete selected"
              color={GLASS ? colors.danger : colors.onPrimaryContainer}
              onPress={onDelete}
            />
          </>
        )}
      </BarSurface>
    </KeyboardBar>
  );
}

/**
 * iOS 26+: a Liquid Glass capsule, like the system's floating toolbars.
 * Android (and older iOS): the M3 vibrant floating toolbar.
 */
function KeyboardBar({ bottom, children }: { bottom: number; children: ReactNode }) {
  const lift = useKeyboardLift(bottom);
  return (
    <>
      {lift.marker}
      <Animated.View
        pointerEvents="box-none"
        style={[{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }, lift.style]}>
        <Animated.View
          pointerEvents="box-none"
          entering={ZoomIn.duration(DURATION.short3)}
          exiting={FadeOut.duration(DURATION.short3).easing(EASING.emphasizedAccelerate)}>
          {children}
        </Animated.View>
      </Animated.View>
    </>
  );
}

function BarSurface({ children }: { children: React.ReactNode }) {
  const { colors, scheme } = useTheme();
  const layout = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 32,
    height: 64,
    paddingHorizontal: 8,
    gap: 4,
  };
  if (GLASS) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme} style={layout}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={{
        ...layout,
        backgroundColor: colors.primaryContainer,
        borderCurve: 'continuous',
        // M3 elevation level 3.
        boxShadow: '0 4px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.3)',
      }}>
      {children}
    </View>
  );
}

function IconAction({
  icon,
  sf,
  label,
  color,
  onPress,
}: {
  icon: IconName;
  /** SF Symbol used on the iOS glass bar. */
  sf: SFSymbol;
  label: string;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ElasticPressable
      variant="button"
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.separator, borderless: true, radius: 24 }}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: pressed ? 12 : 24,
        borderCurve: 'continuous',
        opacity: pressed && Platform.OS === 'ios' ? 0.6 : 1,
      })}>
      {GLASS ? (
        <SymbolView name={sf} size={22} tintColor={color} weight="medium" />
      ) : (
        <MaterialCommunityIcons name={icon} size={24} color={color} />
      )}
    </ElasticPressable>
  );
}
