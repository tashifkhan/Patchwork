from fastapi import HTTPException, status
from google import genai
from google.genai import types

from app.core.config import Settings


class GeminiClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def generate_json(
        self,
        prompt: str,
        *,
        image_bytes: bytes | None = None,
        mime_type: str | None = None,
    ) -> str:
        if not self.settings.gemini_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="GEMINI_API_KEY is not configured",
            )

        contents: list[object] = [prompt]
        if image_bytes is not None:
            if not mime_type:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Image MIME type is required",
                )
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))

        client = genai.Client(api_key=self.settings.gemini_api_key)
        response = client.models.generate_content(
            model=self.settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        text = getattr(response, "text", None)
        if not text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Gemini returned an empty response",
            )
        return text
