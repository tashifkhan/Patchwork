import { ApiError } from './client';
import type { DeckBoard, DeckBoardDetail, DeckCard, DeckCardCreate, DeckCardDelete, DeckCardUpdate, DeckStack } from './types';
import { getAccounts, type CalDavAccount } from '@/lib/credentials';

const boardClients = new Map<number, DeckClient>();

export async function fetchDeckBoards(): Promise<DeckBoard[]> {
  const clients = await allClients();
  const perAccount = await Promise.all(clients.map((client) => client.listBoards()));
  return perAccount.flat();
}

export async function fetchDeckBoard(boardId: number): Promise<DeckBoardDetail> {
  const client = boardClients.get(boardId) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.getBoard(boardId);
}

export async function createDeckCard(payload: DeckCardCreate): Promise<DeckCard> {
  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.createCard(payload);
}

export async function updateDeckCard(payload: DeckCardUpdate): Promise<DeckCard> {
  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.updateCard(payload);
}

export async function deleteDeckCard(payload: DeckCardDelete): Promise<void> {
  const client = boardClients.get(payload.board_id) ?? (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  await client.deleteCard(payload);
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

  async getBoard(boardId: number): Promise<DeckBoardDetail> {
    const stacks = await this.request<unknown[]>('GET', `/index.php/apps/deck/api/v1.0/boards/${boardId}/stacks`);
    return { board_id: boardId, stacks: (Array.isArray(stacks) ? stacks : []) as DeckStack[] };
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
    const path = `/index.php/apps/deck/api/v1.0/boards/${payload.board_id}/stacks/${payload.stack_id}/cards/${payload.card_id}`;
    const existing = await this.request<DeckCard>('GET', path);
    return this.request<DeckCard>('PUT', path, {
      ...existing,
      title: payload.title ?? existing.title ?? 'Untitled',
      description: payload.description ?? existing.description ?? '',
      duedate: payload.duedate ?? null,
    });
  }

  async deleteCard(payload: DeckCardDelete): Promise<void> {
    await this.request<DeckCard>('DELETE', `/index.php/apps/deck/api/v1.0/boards/${payload.board_id}/stacks/${payload.stack_id}/cards/${payload.card_id}`);
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

function base64Encode(value: string) {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(value)));
  }
  throw new ApiError(500, 'Base64 encoding is unavailable in this runtime.');
}
