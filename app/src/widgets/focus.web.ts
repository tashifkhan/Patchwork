// Live timers are native only. Metro would otherwise follow `focus.ts` into
// `@expo/ui/swift-ui`, which throws on web before the app can mount.
import type { LiveTimer } from './live-timer';

export async function showLiveTimer(_timer: LiveTimer) {}

export async function endLiveTimer() {}
