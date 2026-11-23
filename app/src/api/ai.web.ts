import { api } from './client';
import type { AiDraftRequest, AiRefineRequest, AiTasksResponse, TaskList } from './types';

export interface OcrUploadInput {
  uri: string;
  mimeType: string;
  fileName?: string;
  availableLists?: TaskList[];
  availableTags?: string[];
}

export function ocrUploadImage(input: OcrUploadInput) {
  const form = new FormData();
  form.append('file', {
    uri: input.uri,
    name: input.fileName ?? 'capture.jpg',
    type: input.mimeType,
  } as unknown as Blob);

  if (input.availableLists?.length) {
    form.append('available_lists', JSON.stringify(input.availableLists));
  }
  if (input.availableTags?.length) {
    form.append('available_tags', JSON.stringify(input.availableTags));
  }

  return api.post<AiTasksResponse>('/api/ai/ocr-upload', form);
}

export function refineTasks(payload: AiRefineRequest) {
  return api.post<AiTasksResponse>('/api/ai/refine-tasks', payload);
}

export function draftTasks(payload: AiDraftRequest) {
  return api.post<AiTasksResponse>('/api/ai/draft-tasks', payload);
}

export interface DictationInput {
  uri: string;
  mimeType: string;
  availableLists?: TaskList[];
  availableTags?: string[];
}

/** Dictation runs against your own AI key, which only the iOS and Android apps hold. */
export async function dictateTasks(_input: DictationInput): Promise<AiTasksResponse> {
  throw new Error('Voice dictation is available in the iOS and Android apps.');
}

export interface DictationBlocker {
  reason: 'no-models' | 'no-voice-models' | 'unsupported';
  message: string;
}

export function dictationBlocker(): DictationBlocker | null {
  return { reason: 'unsupported', message: 'Voice dictation is available in the iOS and Android apps.' };
}

export interface VoiceDumpInput {
  uri: string;
  mimeType: string;
}

export interface VoiceDumpResult {
  transcript: string;
  refined: string;
}

/** Voice capture runs against your own AI key, which only the iOS and Android apps hold. */
export async function transcribeBrainDump(_input: VoiceDumpInput): Promise<VoiceDumpResult> {
  throw new Error('Voice brain dumps are available in the iOS and Android apps.');
}

export interface BrainDumpInput {
  text: string;
  available_lists?: TaskList[];
  available_tags?: string[];
}

export interface BrainDumpResult {
  tasks: AiTasksResponse['tasks'];
  note: { title: string; markdown: string } | null;
}

/** The proxy has no brain-dump endpoint: draft the to-dos and leave the note to the caller. */
export async function sortBrainDump(input: BrainDumpInput): Promise<BrainDumpResult> {
  const response = await draftTasks({
    instruction: input.text,
    available_lists: input.available_lists,
    available_tags: input.available_tags,
  });
  return { tasks: response.tasks, note: null };
}
