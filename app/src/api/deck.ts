import { Platform } from 'react-native';

import { api, ApiError } from './client';
import type { DeckBoard, DeckBoardCreate, DeckBoardDetail, DeckCard, DeckCardCreate, DeckCardDelete, DeckCardReorder, DeckCardUpdate, DeckStack, DeckStackCreate, DeckStackDelete, DeckStackUpdate } from './types';
import { getAccounts, type CalDavAccount } from '@/lib/credentials';

const boardClients = new Map<number, DeckClient>();

export async function fetchDeckBoards(): Promise<DeckBoard[]> {
  if (Platform.OS === 'web') {
    return api.get<DeckBoard[]>('/api/deck/boards');
  }

  const clients = await allClients();
  const perAccount = await Promise.all(clients.map((client) => client.listBoards()));
  return perAccount.flat();
}

// Returns { board_id, stacks: [...] } where each stack carries its cards.
export async function fetchDeckBoard(boardId: number): Promise<DeckBoardDetail> {
  if (Platform.OS === 'web') {
    return api.get<DeckBoardDetail>(`/api/deck/boards/${boardId}`);
  }

  const client = boardClients.get(boardId) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.getBoard(boardId);
}

export async function createDeckBoard(payload: DeckBoardCreate): Promise<DeckBoard> {
  if (Platform.OS === 'web') {
    return api.post<DeckBoard>('/api/deck/boards', payload);
  }

  const client = (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.createBoard(payload);
}

export async function createDeckCard(payload: DeckCardCreate): Promise<DeckCard> {
  if (Platform.OS === 'web') {
    return api.post<DeckCard>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}/cards`, payload);
  }

  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.createCard(payload);
}

export async function updateDeckCard(payload: DeckCardUpdate): Promise<DeckCard> {
  if (Platform.OS === 'web') {
    return api.patch<DeckCard>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}/cards/${payload.card_id}`, payload);
  }

  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.updateCard(payload);
}

export async function reorderDeckCard(payload: DeckCardReorder): Promise<DeckCard> {
  if (Platform.OS === 'web') {
    return api.put<DeckCard>(
      `/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}/cards/${payload.card_id}/reorder`,
      { target_stack_id: payload.target_stack_id, order: payload.order }
    );
  }

  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.reorderCard(payload);
}

export async function deleteDeckCard(payload: DeckCardDelete): Promise<void> {
  if (Platform.OS === 'web') {
    return api.delete<void>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}/cards/${payload.card_id}`);
  }

  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  await client.deleteCard(payload);
}

export async function createDeckStack(payload: DeckStackCreate): Promise<DeckStack> {
  if (Platform.OS === 'web') {
    return api.post<DeckStack>(`/api/deck/boards/${payload.board_id}/stacks`, { title: payload.title, order: payload.order });
  }
  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.createStack(payload);
}

export async function updateDeckStack(payload: DeckStackUpdate): Promise<DeckStack> {
  if (Platform.OS === 'web') {
    return api.patch<DeckStack>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}`, { title: payload.title, order: payload.order });
  }
  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.updateStack(payload);
}

export async function deleteDeckStack(payload: DeckStackDelete): Promise<void> {
  if (Platform.OS === 'web') {
    return api.delete<void>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}`);
  }
  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  await client.deleteStack(payload);
}

class DeckClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(account: CalDavAccount) {
    this.baseUrl = serverRootFromUrl(account.baseUrl.replace(/\/+$/, ''));
    this.authHeader = `Basic ${base64Encode(`${account.username}:${account.appPassword}`)}`;
  }

  async listBoards(): Promise<DeckBoard[]> {
    const payload = await this.request<unknown[]>('GET', '/index.php/apps/deck/api/v1.0/boards');
    if (!Array.isArray(payload)) return [];

    return payload.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      if (!isActiveDeckItem(raw)) return [];
      const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
      if (!Number.isFinite(id)) return [];

      const board = {
        id,
        title: typeof raw.title === 'string' ? raw.title : 'Untitled board',
        raw,
      } satisfies DeckBoard;
      boardClients.set(id, this);
      return [board];
    });
  }

  async createBoard(payload: DeckBoardCreate): Promise<DeckBoard> {
    const raw = await this.request<Record<string, unknown>>('POST', '/index.php/apps/deck/api/v1.0/boards', {
      title: payload.title,
      color: payload.color ?? '317CCC',
    });
    const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
    if (!Number.isFinite(id)) throw new ApiError(502, 'Deck created a board without an id.');
    boardClients.set(id, this);
    await this.createDefaultStacks(id);
    return { id, title: typeof raw.title === 'string' ? raw.title : payload.title, raw };
  }

  async createDefaultStacks(boardId: number): Promise<void> {
    await Promise.all(['To do', 'Doing', 'Done'].map((title, index) =>
      this.request('POST', `/index.php/apps/deck/api/v1.0/boards/${boardId}/stacks`, {
        title,
        order: (index + 1) * 10,
      })
    ));
  }

  async getBoard(boardId: number): Promise<DeckBoardDetail> {
    const stacks = await this.request<unknown[]>('GET', `/index.php/apps/deck/api/v1.0/boards/${boardId}/stacks`);
    return { board_id: boardId, stacks: normalizeStacks(stacks) };
  }

  async createCard(payload: DeckCardCreate): Promise<DeckCard> {
    return this.request<DeckCard>('POST', `/index.php/apps/deck/api/v1.0/boards/${payload.board_id}/stacks/${payload.stack_id}/cards`, {
      title: payload.title,
      description: payload.description ?? '',
      duedate: payload.duedate ?? null,
      type: 'plain',
      order: 999,
    });
  }

  async updateCard(payload: DeckCardUpdate): Promise<DeckCard> {
    const path = `/apps/deck/cards/${payload.card_id}`;
    const existing = await this.request<DeckCard>('GET', path);
    const updated = await this.request<DeckCard>('PUT', path, {
      ...existing,
      title: payload.title ?? existing.title ?? 'Untitled',
      description: payload.description ?? existing.description ?? '',
      duedate: payload.duedate ?? null,
    });
    if (payload.target_stack_id != null && payload.target_stack_id !== payload.stack_id) {
      const moved = await this.request<unknown>('PUT', `${path}/reorder`, {
        ...updated,
        order: existing.order ?? updated.order ?? 999,
        stackId: payload.target_stack_id,
      });
      return cardFromMutationResponse(moved, payload.card_id) ?? { ...updated, stackId: payload.target_stack_id };
    }
    return updated;
  }

  async reorderCard(payload: DeckCardReorder): Promise<DeckCard> {
    const existing = await this.request<DeckCard>('GET', `/apps/deck/cards/${payload.card_id}`);
    const moved = await this.request<unknown>('PUT', `/apps/deck/cards/${payload.card_id}/reorder`, {
      ...existing,
      order: payload.order,
      stackId: payload.target_stack_id,
    });
    return cardFromMutationResponse(moved, payload.card_id) ?? { ...existing, order: payload.order, stackId: payload.target_stack_id };
  }

  async deleteCard(payload: DeckCardDelete): Promise<void> {
    await this.request<DeckCard>('DELETE', `/apps/deck/cards/${payload.card_id}`);
  }

  async createStack(payload: DeckStackCreate): Promise<DeckStack> {
    return this.request<DeckStack>('POST', `/index.php/apps/deck/api/v1.0/boards/${payload.board_id}/stacks`, {
      title: payload.title,
      order: payload.order,
    });
  }

  async updateStack(payload: DeckStackUpdate): Promise<DeckStack> {
    const existing = await this.stackById(payload.stack_id);
    return this.request<DeckStack>('PUT', `/apps/deck/stacks/${payload.stack_id}`, {
      ...existing,
      title: payload.title,
      order: payload.order,
    });
  }

  async deleteStack(payload: DeckStackDelete): Promise<void> {
    await this.request<DeckStack>('DELETE', `/apps/deck/stacks/${payload.stack_id}`);
  }

  private async stackById(stackId: number): Promise<DeckStack> {
    const response = await this.request<unknown>('GET', `/apps/deck/stacks/${stackId}`);
    if (Array.isArray(response) && response[0] && typeof response[0] === 'object') {
      return response[0] as DeckStack;
    }
    if (response && typeof response === 'object') return response as DeckStack;
    return { id: stackId };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          'OCS-APIRequest': 'true',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new ApiError(0, error instanceof Error ? error.message : 'Deck network request failed', error);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new ApiError(response.status, text || `Deck request failed with status ${response.status}`, text);
    }

    try {
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      throw new ApiError(502, 'Deck returned a non-JSON response', { error, body: text.slice(0, 500) });
    }
  }
}

async function allClients(): Promise<DeckClient[]> {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  }
  return accounts.map((account) => new DeckClient(account));
}

function serverRootFromUrl(url: string): string {
  return url.match(/^https?:\/\/[^/]+/i)?.[0] ?? url;
}

function cardFromMutationResponse(response: unknown, cardId: number): DeckCard | null {
  if (Array.isArray(response)) {
    const match = response.find((item) => item && typeof item === 'object' && (item as DeckCard).id === cardId);
    return match ? (match as DeckCard) : null;
  }
  return response && typeof response === 'object' ? (response as DeckCard) : null;
}

function normalizeStacks(value: unknown): DeckStack[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const stack = item as DeckStack;
    if (!isActiveDeckItem(stack)) return [];
    return [{
      ...stack,
      cards: Array.isArray(stack.cards)
        ? stack.cards.filter((card) => card && typeof card === 'object' && isActiveDeckItem(card))
        : [],
    }];
  });
}

function isActiveDeckItem(item: Record<string, unknown>) {
  return item.archived !== true && (item.deletedAt == null || item.deletedAt === 0);
}

function base64Encode(value: string) {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(value)));
  }
  throw new ApiError(500, 'Base64 encoding is unavailable in this runtime.');
}
