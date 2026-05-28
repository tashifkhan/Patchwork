import { ApiError } from './client';
import type { AiGeneratedTask, AiRefineRequest, AiTasksResponse, TaskList } from './types';
import { getGeminiApiKey } from '@/lib/credentials';

const GEMINI_MODEL = 'gemini-3.5-flash-preview';

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
  const responseText = await generateGeminiJson(prompt, {
    mimeType: input.mimeType,
    data: bytesToBase64(imageBytes),
  });
  return { tasks: parseTaskJson(responseText) };
}

export async function refineTasks(payload: AiRefineRequest): Promise<AiTasksResponse> {
  const responseText = await generateGeminiJson(buildRefinePrompt(payload));
  return { tasks: parseTaskJson(responseText) };
}

async function generateGeminiJson(
  prompt: string,
  image?: { mimeType: string; data: string }
) {
  const geminiApiKey = await getGeminiApiKey();
  if (!geminiApiKey) {
    throw new ApiError(503, 'Gemini API key is not configured on this device.');
  }

  const parts: unknown[] = [{ text: prompt }];
  if (image) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readGeminiError(payload) ?? `Gemini request failed with status ${response.status}`;
    throw new ApiError(response.status, message, payload);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.find((part: unknown) =>
    typeof part === 'object' && part !== null && 'text' in part
  )?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new ApiError(502, 'Gemini returned an empty response', payload);
  }
  return text;
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

function parseTaskJson(responseText: string): AiGeneratedTask[] {
  const cleaned = stripMarkdownFence(responseText);
  let payload: unknown;
  try {
    payload = JSON.parse(cleaned);
  } catch (error) {
    throw new ApiError(502, 'Gemini returned invalid JSON', error);
  }

  const tasks = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && 'tasks' in payload
      ? (payload as { tasks: unknown }).tasks
      : null;

  if (!Array.isArray(tasks)) {
    throw new ApiError(502, 'Gemini JSON must be a task array or an object with a tasks array');
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

function readGeminiError(payload: unknown) {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return null;
  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' ? error.message : null;
}

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}
