from app.clients.caldav_client import CalDavClient
from app.model.deck import DeckBoard


class DeckService:
    def __init__(self, client: CalDavClient) -> None:
        self.client = client

    async def list_boards(self) -> list[DeckBoard]:
        response = await self.client.request(
            "GET", f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards"
        )
        payload = response.json()
        return [
            DeckBoard(
                id=item["id"], title=item.get("title", "Untitled board"), raw=item
            )
            for item in payload
            if _is_active_deck_item(item)
        ]

    async def create_board(self, payload: dict) -> DeckBoard:
        response = await self.client.request(
            "POST",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards",
            json={"title": payload.get("title", "Untitled board"), "color": payload.get("color", "317CCC")},
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        raw = response.json()
        board_id = raw["id"]
        await self.create_default_stacks(board_id)
        return DeckBoard(id=board_id, title=raw.get("title", payload.get("title", "Untitled board")), raw=raw)

    async def create_default_stacks(self, board_id: int) -> None:
        for index, title in enumerate(["To do", "Doing", "Done"]):
            await self.client.request(
                "POST",
                f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks",
                json={"title": title, "order": (index + 1) * 10},
                headers={"OCS-APIRequest": "true", "Accept": "application/json"},
            )

    async def get_board(self, board_id: int) -> dict:
        response = await self.client.request(
            "GET",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks",
        )
        return {
            "board_id": board_id,
            "stacks": _normalize_stacks(response.json()),
        }

    async def create_stack(self, board_id: int, payload: dict) -> dict:
        response = await self.client.request(
            "POST",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks",
            json={"title": payload.get("title", "Untitled"), "order": payload.get("order", 999)},
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        return response.json()

    async def update_stack(self, board_id: int, stack_id: int, payload: dict) -> dict:
        existing_response = await self.client.request(
            "GET",
            f"{self.client.base_url}/apps/deck/stacks/{stack_id}",
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        existing_payload = existing_response.json()
        existing = existing_payload[0] if isinstance(existing_payload, list) and existing_payload else existing_payload
        if not isinstance(existing, dict):
            existing = {"id": stack_id, "boardId": board_id, "deletedAt": 0}
        existing.update({"title": payload.get("title", existing.get("title", "Untitled")), "order": payload.get("order", existing.get("order", 999))})
        response = await self.client.request(
            "PUT",
            f"{self.client.base_url}/apps/deck/stacks/{stack_id}",
            json=existing,
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        return response.json()

    async def delete_stack(self, board_id: int, stack_id: int) -> None:
        await self.client.request(
            "DELETE",
            f"{self.client.base_url}/apps/deck/stacks/{stack_id}",
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )

    async def create_card(self, board_id: int, stack_id: int, payload: dict) -> dict:
        response = await self.client.request(
            "POST",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks/{stack_id}/cards",
            json={
                "title": payload.get("title", "Untitled"),
                "description": payload.get("description") or "",
                "duedate": payload.get("duedate"),
                "type": "plain",
                "order": 999,
            },
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        return response.json()

    async def update_card(
        self, board_id: int, stack_id: int, card_id: int, payload: dict
    ) -> dict:
        url = f"{self.client.base_url}/apps/deck/cards/{card_id}"
        existing_response = await self.client.request(
            "GET", url, headers={"OCS-APIRequest": "true", "Accept": "application/json"}
        )
        existing = existing_response.json()
        existing.update(
            {
                "title": payload.get("title", existing.get("title", "Untitled")),
                "description": payload.get("description", existing.get("description", "")),
                "duedate": payload.get("duedate"),
            }
        )
        response = await self.client.request(
            "PUT",
            url,
            json=existing,
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        target_stack_id = payload.get("target_stack_id")
        if target_stack_id is not None and target_stack_id != stack_id:
            response = await self.client.request(
                "PUT",
                f"{url}/reorder",
                json={**response.json(), "order": existing.get("order", 999), "stackId": target_stack_id},
                headers={"OCS-APIRequest": "true", "Accept": "application/json"},
            )
            return _card_from_mutation_response(response.json(), card_id)
        return response.json()

    async def reorder_card(
        self, board_id: int, stack_id: int, card_id: int, payload: dict
    ) -> dict:
        target_stack_id = payload.get("target_stack_id", payload.get("stackId", stack_id))
        existing_response = await self.client.request(
            "GET",
            f"{self.client.base_url}/apps/deck/cards/{card_id}",
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        existing = existing_response.json()
        response = await self.client.request(
            "PUT",
            f"{self.client.base_url}/apps/deck/cards/{card_id}/reorder",
            json={**existing, "order": payload.get("order", 999), "stackId": target_stack_id},
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        return _card_from_mutation_response(response.json(), card_id)

    async def delete_card(self, board_id: int, stack_id: int, card_id: int) -> None:
        await self.client.request(
            "DELETE",
            f"{self.client.base_url}/apps/deck/cards/{card_id}",
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )


def _normalize_stacks(payload: object) -> list[dict]:
    if not isinstance(payload, list):
        return []
    stacks = []
    for item in payload:
        if not isinstance(item, dict) or not _is_active_deck_item(item):
            continue
        cards = item.get("cards")
        stacks.append({
            **item,
            "cards": [card for card in cards if isinstance(card, dict) and _is_active_deck_item(card)] if isinstance(cards, list) else [],
        })
    return stacks


def _is_active_deck_item(item: dict) -> bool:
    return item.get("archived") is not True and item.get("deletedAt", 0) in (None, 0)


def _card_from_mutation_response(payload: object, card_id: int) -> dict:
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict) and item.get("id") == card_id:
                return item
        return {}
    return payload if isinstance(payload, dict) else {}
