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
            DeckBoard(id=item["id"], title=item.get("title", "Untitled board"), raw=item)
            for item in payload
        ]

    async def get_board(self, board_id: int) -> dict:
        response = await self.client.request(
            "GET", f"{self.client.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks"
        )
        return {"board_id": board_id, "stacks": response.json()}
