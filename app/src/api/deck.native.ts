import { ApiError } from './client';
import type { DeckBoard, DeckBoardCreate, DeckBoardDetail, DeckCard, DeckCardCreate, DeckCardDelete, DeckCardReorder, DeckCardUpdate, DeckStack, DeckStackCreate, DeckStackDelete, DeckStackUpdate } from './types';
import { base64Encode } from '@/lib/base64';
import { getAccounts, type CalDavAccount } from '@/lib/credentials';
import { useSyncStatusStore } from '@/stores/sync-status-store';

const boardClients = new Map<number, { client: DeckClient; serverBoardId: number }>();

export async function fetchDeckBoards(): Promise<DeckBoard[]> {
  const clients = await allClients();
  boardClients.clear();
  const perAccount = await Promise.allSettled(clients.map((client) => client.listBoards()));
  const boards = perAccount.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  useSyncStatusStore.getState().setDeckSync(
    perAccount.flatMap((result) => result.status === 'rejected'
      ? [result.reason instanceof Error ? result.reason.message : 'A Deck account could not be loaded.']
      : [])
  );
  if (boards.length === 0) {
    const failure = perAccount.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  return boards;
}

/** Resolve the Deck client for a board. Never falls back to another account's credentials. */
async function clientForBoard(boardId: number): Promise<{ client: DeckClient; serverBoardId: number }> {
  const cached = boardClients.get(boardId);
  if (cached) return cached;

  // Rebuild mapping after cold start / process restart.
  await fetchDeckBoards();
  const client = boardClients.get(boardId);
  if (!client) {
    throw new ApiError(404, 'Deck board not found on any configured account.');
  }
  return client;
}

export async function fetchDeckBoard(boardId: number): Promise<DeckBoardDetail> {
  const target = await clientForBoard(boardId);
  return target.client.getBoard(target.serverBoardId, boardId);
}

export async function createDeckBoard(payload: DeckBoardCreate): Promise<DeckBoard> {
  const clients = await allClients();
  const client = payload.account_id
    ? clients.find((candidate) => candidate.account.id === payload.account_id)
    : clients.length === 1 ? clients[0] : null;
  if (!client) {
    throw new ApiError(400, clients.length > 1
      ? 'Choose which account should own this board.'
      : 'No CalDAV accounts are configured on this device.');
  }
  return client.createBoard(payload);
}

export async function createDeckCard(payload: DeckCardCreate): Promise<DeckCard> {
  const target = await clientForBoard(payload.board_id);
  return target.client.createCard({ ...payload, board_id: target.serverBoardId });
}

export async function updateDeckCard(payload: DeckCardUpdate): Promise<DeckCard> {
  const target = await clientForBoard(payload.board_id);
  return target.client.updateCard({ ...payload, board_id: target.serverBoardId });
}

export async function reorderDeckCard(payload: DeckCardReorder): Promise<DeckCard> {
  const target = await clientForBoard(payload.board_id);
  return target.client.reorderCard({ ...payload, board_id: target.serverBoardId });
}

export async function deleteDeckCard(payload: DeckCardDelete): Promise<void> {
  const target = await clientForBoard(payload.board_id);
  await target.client.deleteCard({ ...payload, board_id: target.serverBoardId });
}

export async function createDeckStack(payload: DeckStackCreate): Promise<DeckStack> {
  const target = await clientForBoard(payload.board_id);
  return target.client.createStack({ ...payload, board_id: target.serverBoardId });
}

export async function updateDeckStack(payload: DeckStackUpdate): Promise<DeckStack> {
  const target = await clientForBoard(payload.board_id);
  return target.client.updateStack({ ...payload, board_id: target.serverBoardId });
}

export async function deleteDeckStack(payload: DeckStackDelete): Promise<void> {
  const target = await clientForBoard(payload.board_id);
  await target.client.deleteStack({ ...payload, board_id: target.serverBoardId });
}

class DeckClient {
  readonly account: CalDavAccount;
  private baseUrl: string;
  private authHeader: string;

  constructor(account: CalDavAccount) {
    this.account = account;
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

      const publicId = scopedBoardId(this.account.id, id);
      const board = {
        id: publicId,
        title: typeof raw.title === 'string' ? raw.title : 'Untitled board',
        account_id: this.account.id,
        account_name: this.account.displayName,
        raw,
      } satisfies DeckBoard;
      boardClients.set(publicId, { client: this, serverBoardId: id });
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
    const publicId = scopedBoardId(this.account.id, id);
    boardClients.set(publicId, { client: this, serverBoardId: id });
    await this.createDefaultStacks(id);
    return {
      id: publicId,
      title: typeof raw.title === 'string' ? raw.title : payload.title,
      account_id: this.account.id,
      account_name: this.account.displayName,
      raw,
    };
  }

  async createDefaultStacks(boardId: number): Promise<void> {
    await Promise.all(['To do', 'Doing', 'Done'].map((title, index) =>
      this.request('POST', `/index.php/apps/deck/api/v1.0/boards/${boardId}/stacks`, {
        title,
        order: (index + 1) * 10,
      })
    ));
  }

  async getBoard(boardId: number, publicBoardId = boardId): Promise<DeckBoardDetail> {
    const stacks = await this.request<unknown[]>('GET', `/index.php/apps/deck/api/v1.0/boards/${boardId}/stacks`);
    return { board_id: publicBoardId, stacks: normalizeStacks(stacks) };
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
      try {
        const moved = await this.request<unknown>('PUT', `${path}/reorder`, {
          ...updated,
          order: existing.order ?? updated.order ?? 999,
          stackId: payload.target_stack_id,
        });
        return cardFromMutationResponse(moved, payload.card_id) ?? { ...updated, stackId: payload.target_stack_id };
      } catch (error) {
        await this.request<DeckCard>('PUT', path, existing).catch(() => {});
        throw error;
      }
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

function scopedBoardId(accountId: string, serverBoardId: number) {
  const value = `${accountId}:${serverBoardId}`;
  let high = 0x811c9dc5;
  let low = 0x9e3779b1;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    high = Math.imul(high ^ code, 0x01000193) >>> 0;
    low = Math.imul(low ^ code, 0x85ebca6b) >>> 0;
  }
  return (high & 0x1fffff) * 0x100000000 + low;
}
