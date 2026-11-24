import { create } from 'zustand';

import { useSettingsStore } from '@/stores/settings-store';

/**
 * UI sounds and confetti. Both are opt-in through Settings: sounds
 * default off, confetti on. Sounds respect the iOS silent switch because we
 * never change the audio session (dictation owns it).
 */

export type SoundName = 'complete' | 'add' | 'delete' | 'celebrate' | 'timer';

const SOURCES: Record<SoundName, number> = {
  complete: require('../../assets/sounds/complete.wav'),
  add: require('../../assets/sounds/add.wav'),
  delete: require('../../assets/sounds/delete.wav'),
  celebrate: require('../../assets/sounds/celebrate.wav'),
  timer: require('../../assets/sounds/timer.wav'),
};

type Player = { play: () => void; seekTo: (seconds: number) => Promise<void> | void };
const players = new Map<SoundName, Player>();

export function playSound(name: SoundName) {
  if (process.env.EXPO_OS === 'web' || !useSettingsStore.getState().uiSounds) return;
  void (async () => {
    try {
      let player = players.get(name);
      if (!player) {
        const { createAudioPlayer } = await import('expo-audio');
        player = createAudioPlayer(SOURCES[name]) as Player;
        players.set(name, player);
      }
      await player.seekTo(0);
      player.play();
    } catch {
      // A missing audio module or a busy session shouldn't break a tap.
    }
  })();
}

interface CelebrationState {
  /** Bumped once per burst; the host animates a fresh set of pieces for each value. */
  burst: number;
  /** The last burst that finished playing. */
  settled: number;
}

export const useCelebrationStore = create<CelebrationState>(() => ({ burst: 0, settled: 0 }));

/** Confetti and a chime, when the user has them on. */
export function celebrate() {
  const { celebrations } = useSettingsStore.getState();
  if (celebrations) useCelebrationStore.setState((state) => ({ burst: state.burst + 1 }));
  playSound('celebrate');
}
