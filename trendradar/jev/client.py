"""Small HTTP client for TypeSafe's public System One API."""

import os
from typing import Any, Dict, Optional

import requests


class JevClient:
    """Call Jev without coupling TrendRadar to a specific SDK version."""

    default_endpoint = "https://api.typesafe.ai/v1/systemone"

    def __init__(self, api_key: Optional[str] = None, timeout: int = 20):
        self.api_key = api_key or os.getenv("TYPESAFE_API_KEY")
        self.timeout = timeout
        self.endpoint = os.getenv("TYPESAFE_API_BASE", self.default_endpoint)

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def decide(self, state: str, questions: Dict[str, Any]) -> Dict[str, Any]:
        if not self.configured:
            raise RuntimeError("TYPESAFE_API_KEY is not configured")
        response = requests.post(self.endpoint, headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}, json={"state": state, "model": "jev-latest", "questions": questions}, timeout=self.timeout)
        response.raise_for_status()
        body = response.json()
        if not isinstance(body.get("answers"), dict):
            raise RuntimeError("Jev response did not include an answers object")
        return body


def normalized_score(answer: Optional[Dict[str, Any]], levels: int = 5) -> Optional[float]:
    """Convert a Jev score level into a 0..1 value while preserving its raw answer."""
    if not answer or answer.get("type") != "score":
        return None
    score = answer.get("score")
    if not isinstance(score, (int, float)):
        return None
    return max(0.0, min(1.0, float(score) / max(1, levels - 1)))
