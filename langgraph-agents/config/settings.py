"""
Configuration settings for LangGraph agents.
Uses pydantic-settings for environment variable management.
"""

import os
from typing import Literal
from pydantic_settings import BaseSettings
from pydantic import Field
from dotenv import load_dotenv

# Load .env file BEFORE pydantic-settings initializes
# This ensures Modal SDK can read MODAL_TOKEN_ID and MODAL_TOKEN_SECRET
load_dotenv()


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
    # Question Generation Models
    question_generation_model_fast: str = Field(
        default="claude-haiku-4-5-20251001",
        env="QUESTION_GENERATION_MODEL_FAST",
        description="Fast model for dynamic question generation (~13s)"
    )
    question_generation_model_adaptive: str = Field(
        default="claude-sonnet-4-20250514",
        env="QUESTION_GENERATION_MODEL_ADAPTIVE",
        description="Adaptive model for incremental question generation (better reasoning)"
    )

    # Evaluation Models
    fast_progression_agent_model: str = Field(
        default="claude-haiku-4-5-20251001",
        env="FAST_PROGRESSION_AGENT_MODEL",
        description="Speed-optimized model for live question progression (~20-40s)"
    )
    comprehensive_evaluation_model: str = Field(
        default="claude-sonnet-4-5-20250929",
        env="COMPREHENSIVE_EVALUATION_MODEL",
        description="Quality-optimized model for comprehensive session evaluation"
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

    # Next.js Internal API URL (for SSE notifications)
    nextjs_internal_url: str = Field(
        default="http://localhost:3000",
        env="NEXTJS_INTERNAL_URL"
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

    # LangSmith Configuration (supports both LANGSMITH_* and LANGCHAIN_* prefixes)
    # LANGSMITH_* is the newer/preferred naming convention
    langchain_tracing_v2: bool = Field(default=True, env="LANGCHAIN_TRACING_V2")

    # API Key: prefer LANGSMITH_API_KEY, fallback to LANGCHAIN_API_KEY
    langsmith_api_key: str | None = Field(default=None, env="LANGSMITH_API_KEY")
    langchain_api_key: str | None = Field(default=None, env="LANGCHAIN_API_KEY")

    # Project: prefer LANGSMITH_PROJECT, fallback to LANGCHAIN_PROJECT
    langsmith_project: str | None = Field(default=None, env="LANGSMITH_PROJECT")
    langchain_project: str = Field(
        default="interviewlm-agents",
        env="LANGCHAIN_PROJECT"
    )

    # Endpoint: prefer LANGSMITH_ENDPOINT, fallback to LANGCHAIN_ENDPOINT
    langsmith_endpoint: str | None = Field(default=None, env="LANGSMITH_ENDPOINT")
    langchain_endpoint: str = Field(
        default="https://api.smith.langchain.com",
        env="LANGCHAIN_ENDPOINT"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def configure_langsmith(self) -> None:
        """Configure LangSmith tracing via environment variables.

        Sets both LANGSMITH_* and LANGCHAIN_* variables for compatibility.
        Prefers LANGSMITH_* values if set, falls back to LANGCHAIN_*.
        """
        # Resolve API key (prefer LANGSMITH_, fallback to LANGCHAIN_)
        api_key = self.langsmith_api_key or self.langchain_api_key
        project = self.langsmith_project or self.langchain_project
        endpoint = self.langsmith_endpoint or self.langchain_endpoint

        if self.langchain_tracing_v2 and api_key:
            # Set both naming conventions for maximum compatibility
            os.environ["LANGCHAIN_TRACING_V2"] = "true"

            # Set LANGSMITH_* (newer, preferred by LangSmith SDK)
            os.environ["LANGSMITH_API_KEY"] = api_key
            os.environ["LANGSMITH_PROJECT"] = project
            os.environ["LANGSMITH_ENDPOINT"] = endpoint

            # Set LANGCHAIN_* (older, for backward compatibility)
            os.environ["LANGCHAIN_API_KEY"] = api_key
            os.environ["LANGCHAIN_PROJECT"] = project
            os.environ["LANGCHAIN_ENDPOINT"] = endpoint

            print(f"[Config] LangSmith tracing enabled for project: {project}")
        elif self.langchain_tracing_v2:
            print("[Config] Warning: LANGCHAIN_TRACING_V2 is true but no API key set")
            print("[Config] Set LANGSMITH_API_KEY or LANGCHAIN_API_KEY in .env")


# Global settings instance
settings = Settings()

# Configure LangSmith on import if enabled
settings.configure_langsmith()
