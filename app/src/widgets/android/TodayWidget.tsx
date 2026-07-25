import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { formatDue } from '../shared/format';
import type { TodayProps } from '../shared/types';

import {
  ANDROID_WIDGET_ACCENT,
  ANDROID_WIDGET_BG,
  ANDROID_WIDGET_MUTED,
  ANDROID_WIDGET_TEXT,
} from './theme';

export function TodayAndroidWidget({ props }: { props: TodayProps }) {
  const visible = props.tasks.slice(0, 5);
  const remaining = Math.max(0, props.totalToday - visible.length);

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
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          justifyContent: 'space-between',
        }}>
        <TextWidget
          text={props.totalOverdue > 0 ? `${props.totalOverdue} overdue · Today` : 'Today'}
          style={{ fontSize: 13, fontWeight: '600', color: ANDROID_WIDGET_MUTED }}
        />
        <TextWidget
          text={String(props.totalToday)}
          style={{ fontSize: 20, fontWeight: '700', color: ANDROID_WIDGET_TEXT }}
        />
      </FlexWidget>
      {visible.length === 0 ? (
        <TextWidget
          text="Nothing due today."
          style={{ marginTop: 12, fontSize: 13, color: ANDROID_WIDGET_MUTED }}
        />
      ) : (
        visible.map((task) => (
          <FlexWidget
            key={task.id}
            clickAction="OPEN_URI"
            clickActionData={{ uri: `patchwork:///task/${encodeURIComponent(task.uid)}` }}
            style={{
              flexDirection: 'row',
              width: 'match_parent',
              marginTop: 8,
              justifyContent: 'space-between',
            }}>
            <TextWidget
              text={task.title}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 14, color: ANDROID_WIDGET_TEXT }}
            />
            <TextWidget
              text={formatDue(task.due_at)}
              style={{ fontSize: 11, color: ANDROID_WIDGET_MUTED, marginLeft: 8 }}
            />
          </FlexWidget>
        ))
      )}
      {remaining > 0 ? (
        <TextWidget
          text={`+${remaining} more`}
          style={{ marginTop: 8, fontSize: 12, color: ANDROID_WIDGET_ACCENT }}
        />
      ) : null}
    </FlexWidget>
  );
}
