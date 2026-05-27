from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    nextcloud_base_url: AnyHttpUrl | None = None
    nextcloud_username: str | None = None
    nextcloud_app_password: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash-preview"
    ai_upload_max_mb: int = 10
    cors_origins: str = Field(default="http://localhost:8081,http://localhost:19006")

    @property
    def nextcloud_configured(self) -> bool:
        return all(
            [
                self.nextcloud_base_url,
                self.nextcloud_username,
                self.nextcloud_app_password,
            ]
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
