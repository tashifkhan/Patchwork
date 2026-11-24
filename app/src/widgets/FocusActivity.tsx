import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export interface FocusActivityProps {
  taskTitle: string;
  /** `focus` / `break` count down to `endsAt`; `stopwatch` counts up from `startedAt`. */
  mode: 'focus' | 'break' | 'stopwatch';
  startedAt: number;
  endsAt: number;
  paused: boolean;
  pausedLabel: string;
}

const FocusActivityLayout = (props: FocusActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  // Helpers live inside the layout: expo-widgets serializes only this function's body.
  const accent = props.mode === 'break' ? '#34C759' : env.colorScheme === 'dark' ? '#FFFFFF' : '#208AEF';
  const icon = props.paused ? 'pause.circle.fill' : props.mode === 'stopwatch' ? 'stopwatch' : props.mode === 'break' ? 'cup.and.saucer.fill' : 'timer';
  const caption = props.mode === 'stopwatch' ? 'Tracking' : props.mode === 'break' ? 'Break' : 'Focus';
  // SwiftUI timer text ticks on its own: down to endsAt, or up from startedAt.
  const clock = (size: number) =>
    props.paused ? (
      <Text modifiers={[font({ weight: 'bold', size }), monospacedDigit()]}>{props.pausedLabel}</Text>
    ) : props.mode === 'stopwatch' ? (
      <Text
        date={new Date(props.startedAt)}
        dateStyle="timer"
        modifiers={[font({ weight: 'bold', size }), monospacedDigit()]}
      />
    ) : (
      <Text
        timerInterval={{ lower: new Date(props.startedAt), upper: new Date(props.endsAt) }}
        countsDown
        modifiers={[font({ weight: 'bold', size }), monospacedDigit()]}
      />
    );

  return {
    banner: (
      <HStack modifiers={[padding({ all: 12 })]}>
        <Image systemName={icon} color={accent} />
        <VStack modifiers={[padding({ leading: 8 })]}>
          <Text modifiers={[font({ weight: 'semibold', size: 14 }), foregroundStyle(accent)]}>
            {props.taskTitle}
          </Text>
          <Text modifiers={[font({ size: 12 })]}>{props.paused ? 'Paused' : caption}</Text>
        </VStack>
        <Spacer />
        {clock(24)}
      </HStack>
    ),
    compactLeading: <Image systemName={icon} color={accent} />,
    compactTrailing: clock(14),
    minimal: <Image systemName={icon} color={accent} />,
    expandedLeading: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Image systemName={icon} color={accent} />
        <Text modifiers={[font({ size: 11 })]}>{caption}</Text>
      </VStack>
    ),
    expandedTrailing: <VStack modifiers={[padding({ all: 12 })]}>{clock(20)}</VStack>,
    expandedBottom: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: 'semibold', size: 13 })]}>{props.taskTitle}</Text>
      </VStack>
    ),
  };
};

export default createLiveActivity('FocusActivity', FocusActivityLayout);
