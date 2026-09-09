// Live Activities are iOS-only. Metro would otherwise follow `focus.ts` into
// `@expo/ui/swift-ui`, which throws on web before the app can mount.

export async function startFocus(
  _taskUid: string,
  _taskTitle: string,
  _durationSeconds: number
) {}

export async function pauseFocus() {}

export async function resumeFocus() {}

export async function endFocus() {}
