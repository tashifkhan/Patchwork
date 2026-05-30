import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { generateText } from 'ai';

import { ApiError } from './client';
import type { AiDraftRequest, AiGeneratedTask, AiRefineRequest, AiTasksResponse, TaskList } from './types';
import { DEFAULT_AI_MODELS, buildProvidersWithCustom, providerById, supportsImage, type AiModelSelection } from '@/lib/ai-models';
import { getAiApiKey } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';

type ImageInput = { mimeType: string; data: string };

export interface OcrUploadInput {
  uri: string;
  mimeType: string;
  fileName?: string;
  availableLists?: TaskList[];
  availableTags?: string[];
}

export async function ocrUploadImage(input: OcrUploadInput): Promise<AiTasksResponse> {
  const imageResponse = await fetch(input.uri);
  const imageBytes = await imageResponse.arrayBuffer();
  if (imageBytes.byteLength === 0) {
    throw new ApiError(400, 'Image is empty');
  }

  const prompt = buildOcrPrompt(input.availableLists ?? [], input.availableTags ?? []);
  const responseText = await generateModelJson(prompt, {
    mimeType: input.mimeType,
    data: bytesToBase64(imageBytes),
  });
  return { tasks: parseTaskJson(responseText) };
}

export async function draftTasks(payload: AiDraftRequest): Promise<AiTasksResponse> {
  const responseText = await generateModelJson(buildDraftPrompt(payload));
  return { tasks: parseTaskJson(responseText) };
}

export async function refineTasks(payload: AiRefineRequest): Promise<AiTasksResponse> {
  const responseText = await generateModelJson(buildRefinePrompt(payload));
  return { tasks: parseTaskJson(responseText) };
}

async function generateModelJson(prompt: string, image?: ImageInput) {
  const settings = useSettingsStore.getState();
  const configured = settings.aiModelSelections.length > 0 ? settings.aiModelSelections : DEFAULT_AI_MODELS;
  const selections = image ? configured.filter(supportsImage) : configured;
  if (selections.length === 0) {
    throw new ApiError(400, image
      ? 'No selected AI model supports image input. Pick an image-capable model in Settings.'
      : 'No AI model is selected. Pick at least one model in Settings.');
  }

  const providers = buildProvidersWithCustom([], settings.aiCustomProviders);
  const failures: string[] = [];
  for (const selection of selections) {
    try {
      const model = await languageModelFor(selection, settings.aiBaseUrlOverrides, providers);
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user',
            content: image
              ? [
                  { type: 'text', text: prompt },
                  { type: 'image', image: base64ToBytes(image.data), mediaType: image.mimeType },
                ]
              : [{ type: 'text', text: prompt }],
          },
        ],
      });
      if (result.text.trim()) return result.text;
      failures.push(`${selection.providerId}/${selection.modelId}: empty response`);
    } catch (error) {
      failures.push(`${selection.providerId}/${selection.modelId}: ${error instanceof Error ? error.message : 'request failed'}`);
    }
  }

  throw new ApiError(502, `All selected AI models failed. ${failures.join(' | ')}`);
}

async function languageModelFor(
  selection: AiModelSelection,
  baseUrlOverrides: Partial<Record<AiModelSelection['providerId'], string>>,
  customProviders: ReturnType<typeof buildProvidersWithCustom>
): Promise<LanguageModel> {
  const provider = providerById(selection.providerId, customProviders);
  if (!provider) throw new Error(`Unknown provider: ${selection.providerId}`);
  const apiKey = await getAiApiKey(provider.id);
  if (!apiKey) throw new Error(`${provider.name} API key is not configured on this device.`);

  if (provider.kind === 'openai') {
    return createOpenAI({ apiKey })(selection.modelId);
  }
  if (provider.kind === 'google') {
    return createGoogleGenerativeAI({ apiKey })(selection.modelId);
  }
  if (provider.kind === 'anthropic') {
    return createAnthropic({ apiKey })(selection.modelId);
  }
  const baseURL = baseUrlOverrides[provider.id]?.trim() || provider.defaultBaseUrl;
  if (!baseURL) throw new Error(`${provider.name} base URL is required.`);
  return createOpenAICompatible({ name: provider.id, apiKey, baseURL })(selection.modelId);
}

function buildOcrPrompt(availableLists: TaskList[], availableTags: string[]) {
  return `You are an OCR and task parsing assistant for a Nextcloud CalDAV todo app.
Read the uploaded handwritten note, photo, or screenshot and extract actionable tasks.

Current date/time: ${new Date().toISOString()}
Available lists: ${listContext(availableLists)}
Available tags: ${JSON.stringify(availableTags)}

Return STRICT JSON only. Do not wrap it in markdown.
Return either an array of tasks or an object with a "tasks" array.

Schema:
{
  "tasks": [
    {
      "title": "string, required, concise action item",
      "description": "string or null, supports GitHub-flavored Markdown",
      "list_id": "string or null, must match an available list id when obvious",
      "tags": ["strings matching existing tags when possible"],
      "due_at": "ISO-8601 datetime string or null",
      "reminder_at": "ISO-8601 datetime string or null",
      "priority": "integer 0-9 or null",
      "subtasks": [{"title": "string", "description": "string or null"}]
    }
  ]
}

Rules:
- Do not invent due dates, reminders, lists, or tags unless the image clearly implies them.
- Preserve uncertain context in description instead of guessing.
- Use subtasks for indented checklist items or clearly nested items.
- Keep Markdown syntax from screenshots when useful.
- The app will show these in a staging editor; optimize for editable draft tasks.`;
}

function buildRefinePrompt(request: AiRefineRequest) {
  return `You are editing staged tasks before they are saved to Nextcloud.
Apply the user's instruction to the current staged tasks and return the full updated task list.

Current date/time: ${new Date().toISOString()}
Instruction: ${request.instruction}
Available lists: ${listContext(request.available_lists ?? [])}
Available tags: ${JSON.stringify(request.available_tags ?? [])}
Current tasks JSON: ${JSON.stringify(request.tasks)}

Return STRICT JSON only. Do not wrap it in markdown.
Return either an array of tasks or an object with a "tasks" array.

Rules:
- You may edit, add, remove, split, merge, or reorder staged tasks if the instruction asks for it.
- Preserve user edits unless the instruction explicitly changes them.
- Use only available list IDs when assigning list_id.
- Prefer existing tags. Only create a new tag if the instruction explicitly asks for it.
- Do not save anything; this response is still only a staging draft.`;
}

function buildDraftPrompt(request: AiDraftRequest) {
  return `You are a task planning assistant for a Nextcloud CalDAV todo app.
Turn the user's natural-language request into staged tasks for review.

Current date/time: ${new Date().toISOString()}
Instruction: ${request.instruction}
Available lists: ${listContext(request.available_lists ?? [])}
Available tags: ${JSON.stringify(request.available_tags ?? [])}

Return STRICT JSON only. Do not wrap it in markdown.
Return either an array of tasks or an object with a "tasks" array.

Schema:
{
  "tasks": [
    {
      "title": "string, required, concise action item",
      "description": "string or null, supports GitHub-flavored Markdown",
      "list_id": "string or null, must match an available list id when obvious",
      "tags": ["strings matching existing tags when possible"],
      "due_at": "ISO-8601 datetime string or null",
      "reminder_at": "ISO-8601 datetime string or null",
      "priority": "integer 0-9 or null",
      "subtasks": [{"title": "string", "description": "string or null"}]
    }
  ]
}

Rules:
- Create only tasks implied by the instruction.
- Use subtasks for checklists, steps, or clearly nested work.
- Use only available list IDs when assigning list_id.
- Do not save anything; this response is still only a staging draft.`;
}

function parseTaskJson(responseText: string): AiGeneratedTask[] {
  const cleaned = stripMarkdownFence(responseText);
  let payload: unknown;
  try {
    payload = JSON.parse(cleaned);
  } catch (error) {
    throw new ApiError(502, 'AI model returned invalid JSON', error);
  }

  const tasks = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && 'tasks' in payload
      ? (payload as { tasks: unknown }).tasks
      : null;

  if (!Array.isArray(tasks)) {
    throw new ApiError(502, 'AI JSON must be a task array or an object with a tasks array');
  }

  return tasks.map(normalizeGeneratedTask).filter((task): task is AiGeneratedTask => task !== null);
}

function normalizeGeneratedTask(value: unknown): AiGeneratedTask | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || !item.title.trim()) return null;
  return {
    title: item.title,
    description: typeof item.description === 'string' ? item.description : null,
    list_id: typeof item.list_id === 'string' ? item.list_id : null,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    due_at: typeof item.due_at === 'string' ? item.due_at : null,
    reminder_at: typeof item.reminder_at === 'string' ? item.reminder_at : null,
    priority: typeof item.priority === 'number' ? item.priority : null,
    subtasks: Array.isArray(item.subtasks)
      ? item.subtasks.flatMap((subtask) => {
          if (typeof subtask !== 'object' || subtask === null) return [];
          const record = subtask as Record<string, unknown>;
          return typeof record.title === 'string'
            ? [{ title: record.title, description: typeof record.description === 'string' ? record.description : null }]
            : [];
        })
      : [],
  };
}

function stripMarkdownFence(value: string) {
  const stripped = value.trim();
  if (!stripped.startsWith('```')) return stripped;
  const lines = stripped.split(/\r?\n/);
  return lines.length >= 3 && lines.at(-1)?.trim() === '```'
    ? lines.slice(1, -1).join('\n').trim()
    : stripped;
}

function listContext(availableLists: TaskList[]) {
  return JSON.stringify(availableLists.map((list) => ({ id: list.id, name: list.name })));
}

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
