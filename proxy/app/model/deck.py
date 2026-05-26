from pydantic import BaseModel


class DeckBoard(BaseModel):
    id: int
    title: str
    raw: dict
