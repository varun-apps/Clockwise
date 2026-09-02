"""Application settings.

Every external credential is optional. When a key is missing, the matching
subsystem degrades to a deterministic mock / no-op so the whole stack runs
offline. The `*_enabled` properties are the single place that decision is made.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="",
        env_file=(".env",),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    clockwise_env: str = "local"
    clockwise_log_level: str = "INFO"
    clockwise_cors_origins: str = "http://localhost:5173"

    # --- Database ---
    database_url: str = "postgresql+psycopg://clockwise:clockwise@localhost:5432/clockwise"

    # --- LLM gateway (OpenAI-compatible) ---
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    clockwise_model_default: str = "deepseek/deepseek-chat"
    clockwise_model_synthesis: str = "deepseek/deepseek-chat"

    # --- Tool APIs (Phase 3) ---
    aviationstack_key: str | None = None
    tavily_key: str | None = None

    # --- Langfuse ---
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "http://localhost:3000"

    @property
    def llm_enabled(self) -> bool:
        """True when a real LLM gateway is configured; else mock mode."""
        return bool(self.openrouter_api_key)

    @property
    def langfuse_enabled(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.clockwise_cors_origins.split(",") if o.strip()]

    @property
    def db_url_async(self) -> str:
        """Ensure an async driver is used for the SQLAlchemy engine."""
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        if url.startswith("sqlite://") and "+aiosqlite" not in url:
            return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
