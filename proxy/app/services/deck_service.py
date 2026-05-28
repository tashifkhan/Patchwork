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
            "stacks": response.json(),
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
        response = await self.client.request(
            "PUT",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks/{stack_id}",
            json={"title": payload.get("title", "Untitled"), "order": payload.get("order", 999)},
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        return response.json()

    async def delete_stack(self, board_id: int, stack_id: int) -> None:
        await self.client.request(
            "DELETE",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks/{stack_id}",
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
        url = f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks/{stack_id}/cards/{card_id}"
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
                json={"order": existing.get("order", 999), "stackId": target_stack_id},
                headers={"OCS-APIRequest": "true", "Accept": "application/json"},
            )
        return response.json()

    async def reorder_card(
        self, board_id: int, stack_id: int, card_id: int, payload: dict
    ) -> dict:
        target_stack_id = payload.get("target_stack_id", payload.get("stackId", stack_id))
        response = await self.client.request(
            "PUT",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks/{stack_id}/cards/{card_id}/reorder",
            json={"order": payload.get("order", 999), "stackId": target_stack_id},
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
        return response.json()

    async def delete_card(self, board_id: int, stack_id: int, card_id: int) -> None:
        await self.client.request(
            "DELETE",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks/{stack_id}/cards/{card_id}",
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
