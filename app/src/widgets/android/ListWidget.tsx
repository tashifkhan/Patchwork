import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { formatDue } from '../shared/format';
import type { ListProps } from '../shared/types';

import { ANDROID_WIDGET_BG, ANDROID_WIDGET_MUTED, ANDROID_WIDGET_TEXT } from './theme';

export function ListAndroidWidget({ props }: { props: ListProps }) {
  const visible = props.tasks.slice(0, 5);

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
      <TextWidget
        text={props.listName || 'No list selected'}
        style={{ fontSize: 13, fontWeight: '600', color: ANDROID_WIDGET_MUTED }}
      />
      {visible.length === 0 ? (
        <TextWidget
          text={props.listId ? 'No open tasks.' : 'Open a list in the app to fill this widget.'}
          style={{ marginTop: 12, fontSize: 13, color: ANDROID_WIDGET_MUTED }}
        />
      ) : (
        visible.map((task) => (
          <FlexWidget
            key={task.id}
            style={{
              flexDirection: 'row',
              width: 'match_parent',
              marginTop: 6,
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
        ))
      )}
    </FlexWidget>
  );
}
