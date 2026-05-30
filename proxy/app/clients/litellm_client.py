import base64

from fastapi import HTTPException, status
from litellm import acompletion

from app.core.config import Settings


class LiteLLMClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def generate_json(
        self,
        prompt: str,
        *,
        image_bytes: bytes | None = None,
        mime_type: str | None = None,
    ) -> str:
        model = self.settings.litellm_model or f"gemini/{self.settings.gemini_model}"
        api_key = self.settings.litellm_api_key or self.settings.gemini_api_key
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LITELLM_API_KEY or GEMINI_API_KEY is not configured",
            )

        content: list[dict[str, object]] = [{"type": "text", "text": prompt}]
        if image_bytes is not None:
            if not mime_type:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Image MIME type is required",
                )
            data = base64.b64encode(image_bytes).decode("ascii")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{data}"},
                }
            )

        try:
            response = await acompletion(
                model=model,
                api_key=api_key,
                api_base=self.settings.litellm_base_url,
                messages=[{"role": "user", "content": content}],
                response_format={"type": "json_object"},
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LiteLLM request failed: {exc}",
            ) from exc

        text = response.choices[0].message.content if response.choices else None
        if not text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LiteLLM returned an empty response",
            )
        return text
