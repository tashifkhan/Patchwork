import type {
  MenuAction,
  MenuComponentProps,
  MenuComponentRef,
} from '@expo/ui/community/menu';
import {
  Box,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPopup,
  type DropdownMenuItemElementColors,
  Host,
  Icon,
  type MenuShapePosition,
  RNHostView,
  SelectableDropdownMenuItem,
  type SelectableDropdownMenuItemColors,
  Spacer,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, height, padding } from '@expo/ui/jetpack-compose/modifiers';
import {
  Fragment,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { Pressable, View, type ImageSourcePropType } from 'react-native';

import { useComposeTheme } from '@/components/theme/compose-theme';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { withAlpha, type ThemeColors } from '@/lib/theme';

export type {
  MenuAction,
  MenuAttributes,
  MenuComponentProps,
  MenuComponentRef,
  MenuState,
  NativeActionEvent,
} from '@expo/ui/community/menu';

const CHECK = require('../../../assets/symbols/check.xml');
const CHEVRON = require('../../../assets/symbols/chevron_right.xml');

/**
 * iOS passes SF Symbol names in `image`. Android can't draw those, so the
 * ones our menus use map to Material symbol drawables. Unknown names show no
 * icon, which is what upstream did for every string.
 */
const SYMBOLS: Record<string, ImageSourcePropType> = {
  'arrow.up': require('../../../assets/symbols/arrow_upward.xml'),
  'arrow.down': require('../../../assets/symbols/arrow_downward.xml'),
  trash: require('../../../assets/symbols/delete.xml'),
  checkmark: CHECK,
  plus: require('../../../assets/symbols/add.xml'),
};

// Clipped popups drop the status bar offset, so edge-to-edge menus near the
// bottom detach from the anchor (same fix as upstream).
const POPUP_PROPERTIES = { clippingEnabled: false };
// MenuDefaults.GroupSpacing.
const GROUP_GAP = 2;
const DISABLED_ALPHA = 0.38;

/** One `DropdownMenuGroup`: a run of plain actions, or one `displayInline` section. */
interface Group {
  key: string;
  title?: string;
  actions: MenuAction[];
}

interface Palette {
  container: string;
  item: DropdownMenuItemElementColors;
  destructive: DropdownMenuItemElementColors;
  selectable: SelectableDropdownMenuItemColors;
  destructiveSelectable: SelectableDropdownMenuItemColors;
  label: string;
}

function actionId(action: MenuAction): string {
  return action.id ?? action.title;
}

function visible(actions: MenuAction[]): MenuAction[] {
  return actions.filter((action) => !action.attributes?.hidden);
}

/**
 * Upstream draws inline sections between dividers. Here each section is its
 * own rounded group with the M3 Expressive gap between groups, and runs of
 * plain actions share a group.
 */
function groupActions(actions: MenuAction[]): Group[] {
  const groups: Group[] = [];
  let run: MenuAction[] = [];
  const flush = () => {
    if (run.length > 0) groups.push({ key: `run:${actionId(run[0])}`, actions: run });
    run = [];
  };
  for (const action of visible(actions)) {
    if (action.displayInline && action.subactions?.length) {
      const subactions = visible(action.subactions);
      if (subactions.length === 0) continue;
      flush();
      groups.push({ key: `inline:${actionId(action)}`, title: action.title, actions: subactions });
    } else {
      run.push(action);
    }
  }
  flush();
  return groups;
}

function iconSource(image: MenuAction['image']): ImageSourcePropType | null {
  if (image == null) return null;
  if (typeof image === 'string') return SYMBOLS[image] ?? null;
  return image;
}

function makePalette(colors: ThemeColors): Palette {
  const disabledText = withAlpha(colors.text, DISABLED_ALPHA);
  const disabledDanger = withAlpha(colors.danger, DISABLED_ALPHA);
  return {
    container: colors.surfaceContainer,
    label: colors.text2,
    item: {
      textColor: colors.text,
      leadingIconColor: colors.text2,
      trailingIconColor: colors.text2,
      disabledTextColor: disabledText,
      disabledLeadingIconColor: disabledText,
      disabledTrailingIconColor: disabledText,
    },
    destructive: {
      textColor: colors.danger,
      leadingIconColor: colors.danger,
      trailingIconColor: colors.danger,
      disabledTextColor: disabledDanger,
      disabledLeadingIconColor: disabledDanger,
      disabledTrailingIconColor: disabledDanger,
    },
    selectable: {
      textColor: colors.text,
      containerColor: colors.surfaceContainer,
      leadingIconColor: colors.text2,
      trailingContentColor: colors.text2,
      disabledTextColor: disabledText,
      disabledContainerColor: colors.surfaceContainer,
      disabledLeadingIconColor: disabledText,
      disabledTrailingContentColor: disabledText,
      selectedTextColor: colors.onSelectionBg,
      selectedContainerColor: colors.selectionBg,
      selectedLeadingIconColor: colors.onSelectionBg,
      selectedTrailingContentColor: colors.onSelectionBg,
    },
    destructiveSelectable: {
      textColor: colors.danger,
      containerColor: colors.surfaceContainer,
      leadingIconColor: colors.danger,
      trailingContentColor: colors.danger,
      disabledTextColor: disabledDanger,
      disabledContainerColor: colors.surfaceContainer,
      disabledLeadingIconColor: disabledDanger,
      disabledTrailingContentColor: disabledDanger,
      selectedTextColor: colors.danger,
      selectedContainerColor: colors.selectionBg,
      selectedLeadingIconColor: colors.danger,
      selectedTrailingContentColor: colors.danger,
    },
  };
}

interface ItemProps {
  action: MenuAction;
  shape: MenuShapePosition;
  palette: Palette;
  onPick: (action: MenuAction) => void;
  dismissAll: () => void;
}

function MenuItem({ action, shape, palette, onPick, dismissAll }: ItemProps) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const destructive = action.attributes?.destructive === true;
  const enabled = !action.attributes?.disabled;
  const source = iconSource(action.image);
  const titleColor = typeof action.titleColor === 'string' ? action.titleColor : undefined;
  const imageColor = typeof action.imageColor === 'string' ? action.imageColor : undefined;
  const elementColors = {
    ...(destructive ? palette.destructive : palette.item),
    ...(titleColor ? { textColor: titleColor } : null),
  };
  const leading = source ? <Icon source={source} size={24} tint={imageColor} /> : null;
  const subactions = action.subactions ? visible(action.subactions) : [];

  if (subactions.length > 0) {
    return (
      <Box modifiers={[fillMaxWidth()]}>
        <DropdownMenuItem
          shape={shape}
          enabled={enabled}
          elementColors={elementColors}
          onClick={() => {
            haptics.selection();
            setSubmenuOpen(true);
          }}>
          <DropdownMenuItem.Text>
            <ComposeText>{action.title}</ComposeText>
          </DropdownMenuItem.Text>
          {leading ? <DropdownMenuItem.LeadingIcon>{leading}</DropdownMenuItem.LeadingIcon> : null}
          <DropdownMenuItem.TrailingIcon>
            <Icon source={CHEVRON} size={24} />
          </DropdownMenuItem.TrailingIcon>
        </DropdownMenuItem>
        <DropdownMenuPopup
          expanded={submenuOpen}
          onDismissRequest={() => setSubmenuOpen(false)}
          properties={POPUP_PROPERTIES}>
          <MenuGroups
            actions={subactions}
            palette={palette}
            onPick={onPick}
            dismissAll={() => {
              setSubmenuOpen(false);
              dismissAll();
            }}
          />
        </DropdownMenuPopup>
      </Box>
    );
  }

  const pick = () => {
    haptics.selection();
    onPick(action);
    dismissAll();
  };

  // Items with a state are choices: the selected one gets the tonal container
  // and a check, M3 Expressive's selectable item.
  if (action.state != null) {
    const colors = destructive ? palette.destructiveSelectable : palette.selectable;
    return (
      <SelectableDropdownMenuItem
        selected={action.state === 'on'}
        shapes={shape}
        enabled={enabled}
        colors={titleColor ? { ...colors, textColor: titleColor, selectedTextColor: titleColor } : colors}
        onClick={pick}>
        <SelectableDropdownMenuItem.Text>
          <ComposeText>{action.title}</ComposeText>
        </SelectableDropdownMenuItem.Text>
        {leading ? (
          <SelectableDropdownMenuItem.LeadingIcon>{leading}</SelectableDropdownMenuItem.LeadingIcon>
        ) : null}
        <SelectableDropdownMenuItem.SelectedLeadingIcon>
          <Icon source={CHECK} size={20} />
        </SelectableDropdownMenuItem.SelectedLeadingIcon>
      </SelectableDropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem shape={shape} enabled={enabled} elementColors={elementColors} onClick={pick}>
      <DropdownMenuItem.Text>
        <ComposeText>{action.title}</ComposeText>
      </DropdownMenuItem.Text>
      {leading ? <DropdownMenuItem.LeadingIcon>{leading}</DropdownMenuItem.LeadingIcon> : null}
    </DropdownMenuItem>
  );
}

function MenuGroups({
  actions,
  palette,
  onPick,
  dismissAll,
}: {
  actions: MenuAction[];
  palette: Palette;
  onPick: (action: MenuAction) => void;
  dismissAll: () => void;
}) {
  const groups = groupActions(actions);
  return groups.map((group, index) => (
    <Fragment key={group.key}>
      {index > 0 ? <Spacer modifiers={[height(GROUP_GAP)]} /> : null}
      <DropdownMenuGroup
        shapes={{ index, count: groups.length }}
        containerColor={palette.container}
        // Tonal elevation tints the surface with the primary color, which is
        // what made the old menu brown on pure black.
        tonalElevation={0}>
        {group.title ? (
          <ComposeText
            color={palette.label}
            style={{ typography: 'labelMedium' }}
            modifiers={[padding(16, 8, 16, 4)]}>
            {group.title}
          </ComposeText>
        ) : null}
        {group.actions.map((action, i) => (
          <MenuItem
            key={actionId(action)}
            action={action}
            shape={{ index: i, count: group.actions.length }}
            palette={palette}
            onPick={onPick}
            dismissAll={dismissAll}
          />
        ))}
      </DropdownMenuGroup>
    </Fragment>
  ));
}

/**
 * Android build of `MenuView` with the same props as
 * `@expo/ui/community/menu`. Upstream draws a stock Material `DropdownMenu`
 * in the system colors with a text check mark. This one is an M3 Expressive
 * grouped menu (`DropdownMenuPopup` + `DropdownMenuGroup`) painted from the
 * in-app theme, AMOLED included.
 *
 * SF Symbol names in `image` map to Material drawables through `SYMBOLS`;
 * `title` and `colorScheme` are ignored, the menu always follows the app.
 */
export function MenuView(props: MenuComponentProps & { ref?: Ref<MenuComponentRef> }) {
  const { ref, actions, onPressAction, onOpenMenu, onCloseMenu, shouldOpenOnLongPress, style, children, testID } =
    props;
  const { colors } = useTheme();
  const composeTheme = useComposeTheme();
  const palette = useMemo(() => makePalette(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  // Flipped eagerly so a second call in the same tick is a no-op, as upstream.
  const expandedRef = useRef(false);

  const open = useCallback(() => {
    if (expandedRef.current) return;
    expandedRef.current = true;
    setExpanded(true);
    onOpenMenu?.();
  }, [onOpenMenu]);

  const dismissAll = useCallback(() => {
    if (!expandedRef.current) return;
    expandedRef.current = false;
    setExpanded(false);
    onCloseMenu?.();
  }, [onCloseMenu]);

  useImperativeHandle(ref, () => ({ show: open }), [open]);

  const onPick = useCallback(
    (action: MenuAction) => onPressAction?.({ nativeEvent: { event: actionId(action) } }),
    [onPressAction],
  );

  return (
    <View style={style} testID={testID}>
      <Host matchContents colorScheme={composeTheme.colorScheme} colorOverrides={composeTheme.colorOverrides}>
        <Box>
          <RNHostView matchContents>
            <Pressable
              onPress={shouldOpenOnLongPress ? undefined : open}
              onLongPress={shouldOpenOnLongPress ? open : undefined}
              // Same as upstream: children declare their own role and feedback.
              android_disableSound
              focusable={false}
              accessible={false}>
              {children}
            </Pressable>
          </RNHostView>
          <DropdownMenuPopup expanded={expanded} onDismissRequest={dismissAll} properties={POPUP_PROPERTIES}>
            <MenuGroups actions={actions} palette={palette} onPick={onPick} dismissAll={dismissAll} />
          </DropdownMenuPopup>
        </Box>
      </Host>
    </View>
  );
}
