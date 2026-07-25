import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { formatDue } from '../shared/format';
import type { UpcomingProps, WidgetTask } from '../shared/types';

import {
  ANDROID_WIDGET_ACCENT,
  ANDROID_WIDGET_BG,
  ANDROID_WIDGET_DANGER,
  ANDROID_WIDGET_MUTED,
  ANDROID_WIDGET_TEXT,
} from './theme';

export function UpcomingAndroidWidget({ props }: { props: UpcomingProps }) {
  const groups: { label: string; color: string; tasks: WidgetTask[] }[] = [
    { label: 'OVERDUE', color: ANDROID_WIDGET_DANGER, tasks: props.overdue },
    { label: 'TODAY', color: ANDROID_WIDGET_ACCENT, tasks: props.today },
    { label: 'TOMORROW', color: ANDROID_WIDGET_MUTED, tasks: props.tomorrow },
    { label: 'UPCOMING', color: ANDROID_WIDGET_MUTED, tasks: props.upcoming },
  ].filter((g) => g.tasks.length > 0);

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: ANDROID_WIDGET_BG,
        borderRadius: 24,
        padding: 16,
        flexDirection: 'column',
      }}>
      {groups.length === 0 ? (
        <TextWidget
          text="You're all caught up."
          style={{ fontSize: 14, color: ANDROID_WIDGET_MUTED }}
        />
      ) : (
        groups.map((group) => (
          <FlexWidget
            key={group.label}
            style={{ flexDirection: 'column', marginTop: 8, width: 'match_parent' }}>
            <TextWidget
              text={`${group.label} · ${group.tasks.length}`}
              style={{ fontSize: 11, fontWeight: '600', color: group.color }}
            />
            {group.tasks.slice(0, 2).map((task) => (
              <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: `patchwork:///task/${encodeURIComponent(task.uid)}` }}
                key={task.id}
                style={{
                  flexDirection: 'row',
                  width: 'match_parent',
                  marginTop: 4,
                  justifyContent: 'space-between',
                }}>
                <TextWidget
                  text={task.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 13, color: ANDROID_WIDGET_TEXT }}
                />
                <TextWidget
                  text={formatDue(task.due_at)}
                  style={{ fontSize: 10, color: ANDROID_WIDGET_MUTED, marginLeft: 8 }}
                />
              </FlexWidget>
            ))}
          </FlexWidget>
        ))
      )}
    </FlexWidget>
  );
}
