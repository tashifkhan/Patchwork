import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { JSONValue, LanguageModel } from 'ai';
import { generateText } from 'ai';

import { ApiError } from './client';
import type { AiDraftRequest, AiGeneratedTask, AiRefineRequest, AiTasksResponse, TaskList } from './types';
import { DEFAULT_AI_MODELS, buildProvidersWithCustom, providerById, supportsImage, type AiModelSelection } from '@/lib/ai-models';
import { getAiApiKey } from '@/lib/credentials';
import { assertSafeAiBaseUrl } from '@/lib/secure-url';
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
  if (imageBytes.byteLength > 8 * 1024 * 1024) {
    throw new ApiError(413, 'Image is larger than 8 MB. Crop it or choose a smaller image.');
  }

  const prompt = buildOcrPrompt(input.availableLists ?? [], input.availableTags ?? []);
  const responseText = await generateModelJson(prompt, {
    mimeType: input.mimeType,
    data: bytesToBase64(imageBytes),
  });
  return { tasks: parseTaskJson(responseText, input.availableLists, input.availableTags) };
}

export async function draftTasks(payload: AiDraftRequest): Promise<AiTasksResponse> {
  const responseText = await generateModelJson(buildDraftPrompt(payload));
  return { tasks: parseTaskJson(responseText, payload.available_lists, payload.available_tags) };
}

export async function refineTasks(payload: AiRefineRequest): Promise<AiTasksResponse> {
  const responseText = await generateModelJson(buildRefinePrompt(payload));
  return { tasks: parseTaskJson(responseText, payload.available_lists, payload.available_tags) };
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
        providerOptions: reasoningOptions(selection, providers),
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

/**
 * Map the selection's reasoning effort onto each provider's own option.
 * Gemini 3 takes a `thinkingLevel`; OpenAI (and compatible endpoints that
 * accept it) take `reasoningEffort`. Unset leaves the provider default.
 */
function reasoningOptions(
  selection: AiModelSelection,
  providers: ReturnType<typeof buildProvidersWithCustom>
): Record<string, Record<string, JSONValue>> | undefined {
  const effort = selection.reasoningEffort;
  if (!effort) return undefined;
  const kind = providerById(selection.providerId, providers)?.kind;
  if (kind === 'google') return { google: { thinkingConfig: { thinkingLevel: effort } } };
  if (kind === 'openai') return { openai: { reasoningEffort: effort } };
  return undefined;
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
  const rawBaseURL = baseUrlOverrides[provider.id]?.trim() || provider.defaultBaseUrl;
  if (!rawBaseURL) throw new Error(`${provider.name} base URL is required.`);
  const baseURL = assertSafeAiBaseUrl(rawBaseURL);
  return createOpenAICompatible({ name: provider.id, apiKey, baseURL })(selection.modelId);
}

function buildOcrPrompt(availableLists: TaskList[], availableTags: string[]) {
  return `You are an OCR and task parsing assistant for Patchwork, a Nextcloud CalDAV task app.
Read the uploaded handwritten note, photo, or screenshot and extract actionable tasks.

${localTimeContext()}
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

${localTimeContext()}
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
  return `You are a task planning assistant for Patchwork, a Nextcloud CalDAV task app.
Turn the user's natural-language request into staged tasks for review.

${localTimeContext()}
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

function parseTaskJson(
  responseText: string,
  availableLists: TaskList[] = [],
  availableTags: string[] = []
): AiGeneratedTask[] {
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

  const listIds = new Set(availableLists.map((list) => list.id));
  const canonicalTags = new Map(availableTags.map((tag) => [tag.toLocaleLowerCase(), tag]));
  return tasks
    .map((task) => normalizeGeneratedTask(task, listIds, canonicalTags))
    .filter((task): task is AiGeneratedTask => task !== null);
}

function normalizeGeneratedTask(
  value: unknown,
  listIds: Set<string>,
  canonicalTags: Map<string, string>
): AiGeneratedTask | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || !item.title.trim()) return null;
  return {
    draft_id: typeof item.draft_id === 'string' && item.draft_id ? item.draft_id : randomDraftId(),
    title: item.title.trim(),
    description: typeof item.description === 'string' ? item.description.trim() || null : null,
    list_id: typeof item.list_id === 'string' && listIds.has(item.list_id) ? item.list_id : null,
    tags: Array.isArray(item.tags)
      ? [...new Set(item.tags.flatMap((tag) => {
          if (typeof tag !== 'string' || !tag.trim()) return [];
          const trimmed = tag.trim();
          return [canonicalTags.get(trimmed.toLocaleLowerCase()) ?? trimmed];
        }))]
      : [],
    due_at: validIsoDate(item.due_at),
    reminder_at: validIsoDate(item.reminder_at),
    priority: typeof item.priority === 'number' && Number.isInteger(item.priority) && item.priority >= 0 && item.priority <= 9
      ? item.priority
      : null,
    subtasks: Array.isArray(item.subtasks)
      ? item.subtasks.flatMap((subtask) => {
          if (typeof subtask !== 'object' || subtask === null) return [];
          const record = subtask as Record<string, unknown>;
          return typeof record.title === 'string' && record.title.trim()
            ? [{ title: record.title.trim(), description: typeof record.description === 'string' ? record.description.trim() || null : null }]
            : [];
        })
      : [],
  };
}

function validIsoDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function randomDraftId() {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

/**
 * The user's local "now", with its UTC offset and weekday. Giving the model a
 * bare UTC timestamp made "Friday at 10am" come back as 10:00 UTC (3:30 PM in
 * India), so spell out the local zone and require the offset on every date.
 */
function localTimeContext(now: Date = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offset = `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
  const local =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:00${offset}`;
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [
    `Current local date/time: ${local} (${weekday}, time zone ${zone}).`,
    `Interpret every date and time the user mentions in this time zone, and write every datetime as ISO-8601 with the ${offset} offset (for example ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T10:00:00${offset}).`,
    'When only a day is given with no time, use 23:59 local time on that day.',
  ].join('\n');
}
