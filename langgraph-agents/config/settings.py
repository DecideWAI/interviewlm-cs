"""
Configuration settings for LangGraph agents.
Uses pydantic-settings for environment variable management.
"""

import os
from typing import Literal
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Keys
    anthropic_api_key: str = Field(..., env="ANTHROPIC_API_KEY")

    # Model Configuration
    coding_agent_model: str = Field(
        default="claude-sonnet-4-20250514",
        env="CODING_AGENT_MODEL"
    )
    evaluation_agent_model: str = Field(
        default="claude-sonnet-4-20250514",
        env="EVALUATION_AGENT_MODEL"
    )
    interview_agent_model: str = Field(
        default="claude-haiku-4-5-20251001",
        env="INTERVIEW_AGENT_MODEL"
    )

    # Modal Service URLs (deployed endpoints)
    modal_execute_url: str | None = Field(
        default=None,
        env="MODAL_EXECUTE_URL"
    )
    modal_write_file_url: str | None = Field(
        default=None,
        env="MODAL_WRITE_FILE_URL"
    )
    modal_read_file_url: str | None = Field(
        default=None,
        env="MODAL_READ_FILE_URL"
    )
    modal_list_files_url: str | None = Field(
        default=None,
        env="MODAL_LIST_FILES_URL"
    )
    modal_execute_command_url: str | None = Field(
        default=None,
        env="MODAL_EXECUTE_COMMAND_URL"
    )

    # Redis Configuration
    redis_url: str = Field(
        default="redis://localhost:6379",
        env="REDIS_URL"
    )

    # Database Configuration
    database_url: str = Field(
        default="postgresql://localhost:5432/interviewlm",
        env="DATABASE_URL"
    )

    # Agent Configuration
    max_iterations: int = Field(default=25, env="MAX_AGENT_ITERATIONS")
    tool_timeout_seconds: int = Field(default=30, env="TOOL_TIMEOUT_SECONDS")
    bash_timeout_seconds: int = Field(default=60, env="BASH_TIMEOUT_SECONDS")
    max_output_size: int = Field(default=5000, env="MAX_OUTPUT_SIZE")

    # Helpfulness Levels
    default_helpfulness: Literal["consultant", "pair-programming", "full-copilot"] = Field(
        default="pair-programming",
        env="DEFAULT_HELPFULNESS_LEVEL"
    )

    # Feature Flags
    enable_code_streaming: bool = Field(default=True, env="ENABLE_CODE_STREAMING")
    enable_prompt_caching: bool = Field(default=True, env="ENABLE_PROMPT_CACHING")
    enable_observability: bool = Field(default=False, env="ENABLE_OBSERVABILITY")

    # Prompt Caching Configuration
    message_cache_count: int = Field(
        default=2,
        env="MESSAGE_CACHE_COUNT",
        description="Number of recent conversation messages to cache (0 to disable)"
    )

    # LangSmith Configuration (default LangChain observability)
    langchain_tracing_v2: bool = Field(default=True, env="LANGCHAIN_TRACING_V2")
    langchain_api_key: str | None = Field(default=None, env="LANGCHAIN_API_KEY")
    langchain_project: str = Field(
        default="interviewlm-agents",
        env="LANGCHAIN_PROJECT"
    )
    langchain_endpoint: str = Field(
        default="https://api.smith.langchain.com",
        env="LANGCHAIN_ENDPOINT"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def configure_langsmith(self) -> None:
        """Configure LangSmith tracing via environment variables."""
        if self.langchain_tracing_v2 and self.langchain_api_key:
            os.environ["LANGCHAIN_TRACING_V2"] = "true"
            os.environ["LANGCHAIN_API_KEY"] = self.langchain_api_key
            os.environ["LANGCHAIN_PROJECT"] = self.langchain_project
            os.environ["LANGCHAIN_ENDPOINT"] = self.langchain_endpoint
            print(f"[Config] LangSmith tracing enabled for project: {self.langchain_project}")
        elif self.langchain_tracing_v2:
            print("[Config] Warning: LANGCHAIN_TRACING_V2 is true but LANGCHAIN_API_KEY is not set")


# Global settings instance
settings = Settings()

# Configure LangSmith on import if enabled
settings.configure_langsmith()
