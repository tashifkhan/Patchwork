import { api } from './client';
import type { AiRefineRequest, AiTasksResponse, TaskList } from './types';

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
