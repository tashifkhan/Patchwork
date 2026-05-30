import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { ListAndroidWidget } from './ListWidget';
import { TodayAndroidWidget } from './TodayWidget';
import { UpcomingAndroidWidget } from './UpcomingWidget';
import { emptySnapshot, loadSnapshot } from './storage';

const NAME_MAP = {
  Today: 'today',
  Upcoming: 'upcoming',
  List: 'list',
} as const;

type WidgetName = keyof typeof NAME_MAP;

function renderFor(name: WidgetName, snapshot: ReturnType<typeof emptySnapshot>) {
  switch (name) {
    case 'Today':
      return <TodayAndroidWidget props={snapshot.today} />;
    case 'Upcoming':
      return <UpcomingAndroidWidget props={snapshot.upcoming} />;
    case 'List':
      return <ListAndroidWidget props={snapshot.list} />;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const name = props.widgetInfo.widgetName as WidgetName;
  if (!(name in NAME_MAP)) return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = (await loadSnapshot()) ?? emptySnapshot();
      props.renderWidget(renderFor(name, snapshot));
      break;
    }
    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
    default:
      break;
  }
}
