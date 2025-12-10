"""
Question Generation Services

This module provides services for generating unique coding questions using:
- IRT (Item Response Theory) for adaptive difficulty targeting
- Complexity profiles for controlling question characteristics
- Smart reuse strategies for scaling
"""

from .irt_engine import IRTDifficultyEngine
from .complexity_profiles import get_complexity_profile, DEFAULT_PROFILES
from .prompts import build_dynamic_generation_prompt, build_incremental_generation_prompt

__all__ = [
    "IRTDifficultyEngine",
    "get_complexity_profile",
    "DEFAULT_PROFILES",
    "build_dynamic_generation_prompt",
    "build_incremental_generation_prompt",
]
