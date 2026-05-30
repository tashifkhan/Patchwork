import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import { formatDuration } from './shared/format';

export interface FocusActivityProps {
  taskTitle: string;
  startedAt: number;
  durationSeconds: number;
  paused: boolean;
}

function remainingSeconds(props: FocusActivityProps, now: number = Date.now()): number {
  const elapsed = Math.max(0, Math.floor((now - props.startedAt) / 1000));
  return Math.max(0, props.durationSeconds - elapsed);
}

const FocusActivityLayout = (props: FocusActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  const accent = env.colorScheme === 'dark' ? '#FFFFFF' : '#208AEF';
  const remaining = remainingSeconds(props);
  const label = formatDuration(remaining);

  return {
    banner: (
      <HStack modifiers={[padding({ all: 12 })]}>
        <Image systemName={props.paused ? 'pause.circle.fill' : 'timer'} color={accent} />
        <VStack modifiers={[padding({ leading: 8 })]}>
          <Text modifiers={[font({ weight: 'semibold', size: 14 }), foregroundStyle(accent)]}>
            {props.taskTitle}
          </Text>
          <Text modifiers={[font({ size: 12 })]}>
            {props.paused ? 'Paused' : `${label} left`}
          </Text>
        </VStack>
        <Spacer />
        <Text modifiers={[font({ weight: 'bold', size: 24 })]}>{label}</Text>
      </HStack>
    ),
    compactLeading: <Image systemName="timer" color={accent} />,
    compactTrailing: <Text>{label}</Text>,
    minimal: <Image systemName="timer" color={accent} />,
    expandedLeading: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Image systemName="timer" color={accent} />
        <Text modifiers={[font({ size: 11 })]}>Focus</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 20 })]}>{label}</Text>
        <Text modifiers={[font({ size: 11 })]}>left</Text>
      </VStack>
    ),
    expandedBottom: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: 'semibold', size: 13 })]}>{props.taskTitle}</Text>
      </VStack>
    ),
  };
};

export default createLiveActivity('FocusActivity', FocusActivityLayout);
