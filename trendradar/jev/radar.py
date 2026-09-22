"""Cluster domestic hot-list items, derive momentum, then ask Jev for semantic signals."""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

from .client import JevClient, normalized_score
from .questions import build_questions

_PUNCTUATION = re.compile(r"[\s\W_]+", re.UNICODE)


@dataclass
class HotItem:
    title: str
    platform_id: str
    platform_name: str
    rank: int
    url: str = ""
    first_time: str = ""
    last_time: str = ""
    count: int = 1
    ranks: List[int] = field(default_factory=list)


@dataclass
class EventCluster:
    items: List[HotItem] = field(default_factory=list)

    @property
    def title(self) -> str:
        return max(self.items, key=lambda item: (item.count, -item.rank, len(item.title))).title

    @property
    def platforms(self) -> List[str]:
        return sorted({item.platform_name for item in self.items})


def normalize_title(title: str) -> str:
    return _PUNCTUATION.sub("", title.lower())


def _bigrams(value: str) -> set[str]:
    if len(value) < 2:
        return {value} if value else set()
    return {value[index : index + 2] for index in range(len(value) - 1)}


def title_similarity(left: str, right: str) -> float:
    """A dependency-free Chinese-friendly similarity suitable for the MVP pre-cluster."""
    left, right = normalize_title(left), normalize_title(right)
    if not left or not right:
        return 0.0
    if left in right or right in left:
        return min(len(left), len(right)) / max(len(left), len(right))
    left_tokens, right_tokens = _bigrams(left), _bigrams(right)
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def cluster_items(items: Iterable[HotItem], threshold: float = 0.42) -> List[EventCluster]:
    clusters: List[EventCluster] = []
    for item in sorted(items, key=lambda candidate: (candidate.rank, -candidate.count)):
        best_cluster, best_similarity = None, 0.0
        for cluster in clusters:
            similarity = max(title_similarity(item.title, existing.title) for existing in cluster.items)
            if similarity > best_similarity:
                best_cluster, best_similarity = cluster, similarity
        if best_cluster and best_similarity >= threshold:
            best_cluster.items.append(item)
        else:
            clusters.append(EventCluster(items=[item]))
    return clusters


def momentum(cluster: EventCluster) -> float:
    """Use only observed time-series/ranking facts, never a model judgment."""
    platform_spread = min(1.0, len(cluster.platforms) / 3)
    persistence = sum(1 - math.exp(-max(1, item.count) / 3) for item in cluster.items) / len(cluster.items)
    rank_quality = sum((101 - min(100, max(1, item.rank))) / 100 for item in cluster.items) / len(cluster.items)
    rank_lift_values = []
    for item in cluster.items:
        history = [rank for rank in item.ranks if isinstance(rank, int) and rank > 0]
        if len(history) > 1:
            rank_lift_values.append(max(-1.0, min(1.0, (history[0] - history[-1]) / 30)))
    rank_lift = (sum(rank_lift_values) / len(rank_lift_values) + 1) / 2 if rank_lift_values else 0.5
    return 0.30 * platform_spread + 0.30 * persistence + 0.25 * rank_quality + 0.15 * rank_lift


def cluster_state(cluster: EventCluster, profile: Dict[str, Any]) -> str:
    payload = {"creator_profile": profile, "event": {"representative_title": cluster.title, "platforms": cluster.platforms, "observations": [{"title": item.title, "platform": item.platform_name, "current_rank": item.rank, "first_seen": item.first_time, "last_seen": item.last_time, "observed_times": item.count, "rank_history": item.ranks, "url": item.url} for item in cluster.items]}, "instruction": "只依据提供的事件状态判断；未知信息保持不确定，不要臆测外部事实。"}
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


class OpportunityRadar:
    def __init__(self, profile: Dict[str, Any], weights: Optional[Dict[str, float]] = None):
        self.profile = profile
        self.weights = {
            "momentum": 0.30,
            "creator_fit": 0.20,
            "relevance": 0.15,
            "novelty": 0.15,
            "contentability": 0.10,
            "differentiation": 0.10,
            "risk": 0.10,
        }
        self.weights.update(weights or {})

    def evaluate(
        self,
        items: Iterable[HotItem],
        client: Optional[JevClient] = None,
        candidate_limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        results = []
        candidates = sorted(cluster_items(items), key=momentum, reverse=True)
        if candidate_limit is not None:
            candidates = candidates[:candidate_limit]
        for cluster in candidates:
            observed_momentum, answers, error = momentum(cluster), {}, None
            if client and client.configured:
                try:
                    answers = client.decide(cluster_state(cluster, self.profile), build_questions(self.profile)).get("answers", {})
                except Exception as exc:
                    error = str(exc)
            signals = {key: normalized_score(answers.get(key)) for key in ("creator_fit", "relevance", "novelty", "contentability", "differentiation", "risk")}
            semantic_ready = all(value is not None for value in signals.values())
            if semantic_ready:
                score = (self.weights["momentum"] * observed_momentum + self.weights["creator_fit"] * signals["creator_fit"] + self.weights["relevance"] * signals["relevance"] + self.weights["novelty"] * signals["novelty"] + self.weights["contentability"] * signals["contentability"] + self.weights["differentiation"] * signals["differentiation"] - self.weights["risk"] * signals["risk"])
            else:
                score = observed_momentum
            results.append({"title": cluster.title, "platforms": cluster.platforms, "observations": len(cluster.items), "momentum": round(observed_momentum, 4), "opportunity_score": round(max(0.0, min(1.0, score)) * 100, 1), "status": "jev_scored" if semantic_ready else "momentum_prescreen", "signals": signals, "audience": answers.get("audience", {}).get("choice"), "recommended_angle": answers.get("recommended_angle", {}).get("choice"), "fact_check_needed": answers.get("fact_check_needed", {}).get("noul"), "source_items": [item.__dict__ for item in cluster.items], "error": error})
        return sorted(results, key=lambda result: result["opportunity_score"], reverse=True)
