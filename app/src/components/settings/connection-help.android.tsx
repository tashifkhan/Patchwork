import {
  Host,
  IconButton,
  Text,
  TooltipBox,
  type TooltipBoxRef,
} from '@expo/ui/jetpack-compose';
import { useRef } from 'react';

import { useTheme } from '@/components/theme/context';

import { CONNECTION_HELP_PARAGRAPHS, CONNECTION_HELP_TITLE } from './connection-help-content';

/**
 * Info button that reveals connection instructions in a Material 3 rich tooltip
 * (the Android analog of a popover), shown on tap and dismissed by tapping away.
 */
export function ConnectionHelp() {
  const { colors } = useTheme();
  const ref = useRef<TooltipBoxRef>(null);

  return (
    <Host matchContents>
      <TooltipBox ref={ref} isPersistent>
        <TooltipBox.RichTooltip
          containerColor={colors.bg3}
          contentColor={colors.text2}
          titleContentColor={colors.text}>
          <TooltipBox.RichTooltip.Title>
            <Text style={{ fontWeight: '600' }}>{CONNECTION_HELP_TITLE}</Text>
          </TooltipBox.RichTooltip.Title>
          <TooltipBox.RichTooltip.Text>
            <Text>{CONNECTION_HELP_PARAGRAPHS.join('\n\n')}</Text>
          </TooltipBox.RichTooltip.Text>
        </TooltipBox.RichTooltip>
        <IconButton onClick={() => ref.current?.show()} colors={{ contentColor: colors.accent }}>
          <Text color={colors.accent} style={{ fontSize: 22 }}>
            {'ⓘ'}
          </Text>
        </IconButton>
      </TooltipBox>
    </Host>
  );
}
