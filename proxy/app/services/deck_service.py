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

    async def get_board(self, board_id: int) -> dict:
        response = await self.client.request(
            "GET",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks",
        )
        return {
            "board_id": board_id,
            "stacks": response.json(),
        }

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
        return response.json()

    async def delete_card(self, board_id: int, stack_id: int, card_id: int) -> None:
        await self.client.request(
            "DELETE",
            f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks/{stack_id}/cards/{card_id}",
            headers={"OCS-APIRequest": "true", "Accept": "application/json"},
        )
