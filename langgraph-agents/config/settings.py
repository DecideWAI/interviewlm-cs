"""
Configuration settings for LangGraph agents.
Uses pydantic-settings for environment variable management.
"""

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
        default="claude-3-5-haiku-20241022",
        env="INTERVIEW_AGENT_MODEL"
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

    # Langfuse (optional observability)
    langfuse_public_key: str | None = Field(default=None, env="LANGFUSE_PUBLIC_KEY")
    langfuse_secret_key: str | None = Field(default=None, env="LANGFUSE_SECRET_KEY")
    langfuse_host: str = Field(
        default="https://cloud.langfuse.com",
        env="LANGFUSE_HOST"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Global settings instance
settings = Settings()
