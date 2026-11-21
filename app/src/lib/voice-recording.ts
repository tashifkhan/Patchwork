import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import { Platform } from 'react-native';

/*
 * Shared by every voice capture (to-do dictation, spoken brain dumps), so
 * both send the AI the same small speech files.
 */

/**
 * Loudest level (dBFS) a recording must reach to count as speech. Room noise
 * sits well below this; a silent mic reads about -90. Models invent content
 * from silence, so quiet recordings never leave the phone.
 */
export const SPEECH_DB = -42;

/** Long enough for a rambling list, short enough to stay under inline upload limits. */
export const MAX_SECONDS = 5 * 60;

/**
 * Small mono speech files in formats the audio models accept: AAC (ADTS) on
 * Android, 16-bit WAV on iOS. 16 kHz mono is what speech models resample to anyway.
 */
export const RECORDING: RecordingOptions = {
  extension: Platform.OS === 'ios' ? '.wav' : '.aac',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
  isMeteringEnabled: true,
  android: { extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MEDIUM,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm' },
};

export const RECORDING_MIME_TYPE = Platform.OS === 'ios' ? 'audio/wav' : 'audio/aac';

/** Metering is dBFS (about -60 silent to 0 loud); map to 0..1 for level displays. */
export function meterToLevel(metering?: number) {
  if (metering == null) return 0.15;
  return Math.max(0, Math.min(1, (metering + 55) / 50));
}

export function formatRecordingClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
