import type { ReactNode } from 'react';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import {
  ToolbarIconButton,
  ToolbarPrimaryButton,
  ToolbarSurface,
} from '@/components/ui/floating-toolbar';
import { useKeyboardLift } from '@/components/ui/keyboard';
import { RollingNumber } from '@/components/ui/rolling-number';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';

/**
 * Floating toolbar shown while a to-do is open in place, like the Things
 * "Move / Delete / ..." bar. Same surface as the to-do page's bar (see
 * `ToolbarSurface`): Liquid Glass on iOS 26, a dark `bg3` pill elsewhere.
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
      <ToolbarSurface>
        <ToolbarIconButton icon="trash-can-outline" sf="trash" label={deleteLabel} color={colors.red} onPress={onDelete} />
        {onDetails ? (
          <ToolbarIconButton
            icon="arrow-expand"
            sf="arrow.up.left.and.arrow.down.right"
            label="Details"
            onPress={onDetails}
          />
        ) : null}
        <ToolbarPrimaryButton
          icon="arrow-right"
          sf="arrow.right"
          label="Move"
          onPress={() => {
            haptics.tap();
            onMove();
          }}
        />
      </ToolbarSurface>
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
  const disabled = count === 0;

  return (
    <KeyboardBar bottom={bottom}>
      <ToolbarSurface dense>
        <ToolbarIconButton dense icon="close" sf="xmark" label="Cancel selection" onPress={onCancel} />
        {disabled ? null : (
          <>
            <ToolbarIconButton dense icon="arrow-right" sf="arrow.right" label="Move selected" onPress={onMove} />
            <ToolbarIconButton dense icon="pin-outline" sf="pin" label="Pin or unpin selected" onPress={onPin} />
            {count > 1 ? (
              <ToolbarIconButton dense
                icon="call-merge"
                sf="arrow.triangle.merge"
                label="Merge selected into one to-do"
                onPress={onMerge}
              />
            ) : null}
            <ToolbarIconButton dense
              icon="trash-can-outline"
              sf="trash"
              label="Delete selected"
              color={colors.red}
              onPress={onDelete}
            />
          </>
        )}
        <ToolbarPrimaryButton
          dense
          icon="check-all"
          sf="checkmark"
          accessibilityLabel={`Complete ${count} selected`}
          disabled={disabled}
          onPress={() => {
            haptics.success();
            onComplete();
          }}>
          <RollingNumber
            value={count}
            style={{ color: colors.onAccent, fontSize: 16, lineHeight: 22, fontWeight: '700' }}
          />
        </ToolbarPrimaryButton>
      </ToolbarSurface>
    </KeyboardBar>
  );
}

/** Rides on top of the keyboard and zooms in when it appears. */
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
