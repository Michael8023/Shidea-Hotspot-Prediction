"""Run the Jev opportunity radar over TrendRadar's persisted hot-list history."""

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import yaml
from dotenv import load_dotenv

from trendradar.context import AppContext
from trendradar.core import load_config
from .client import JevClient
from .radar import HotItem, OpportunityRadar


def load_radar_config(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def read_hot_items(ctx: AppContext, platform_ids: List[str] | None = None) -> List[HotItem]:
    results, names, info = ctx.read_today_titles(platform_ids or ctx.platform_ids, quiet=True)
    items = []
    for platform_id, titles in results.items():
        for title, raw in titles.items():
            metadata = info.get(platform_id, {}).get(title, {})
            ranks = metadata.get("ranks") or raw.get("ranks", [])
            active_ranks = [rank for rank in ranks if isinstance(rank, int) and rank > 0]
            items.append(HotItem(title=title, platform_id=platform_id, platform_name=names.get(platform_id, platform_id), rank=active_ranks[-1] if active_ranks else 100, url=metadata.get("url") or raw.get("url", ""), first_time=metadata.get("first_time", ""), last_time=metadata.get("last_time", ""), count=int(metadata.get("count", len(active_ranks) or 1)), ranks=active_ranks))
    return items


def render_markdown(results: List[Dict[str, Any]], used_jev: bool) -> str:
    label = "Jev 语义评分" if used_jev else "动量预筛（未调用 Jev）"
    lines = ["# Jev 热点机会雷达", "", f"评分模式：{label}", ""]
    for index, result in enumerate(results, 1):
        lines.extend([f"## {index}. {result['title']}", "", f"- Opportunity Score：**{result['opportunity_score']}**", f"- Momentum：{result['momentum']}", f"- 平台：{'、'.join(result['platforms'])}", f"- 推荐角度：{result['recommended_angle'] or '待 Jev 判断'}", f"- 目标受众：{result['audience'] or '待 Jev 判断'}", f"- 需事实核查：{result['fact_check_needed'] if result['fact_check_needed'] is not None else '待 Jev 判断'}", ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Score TrendRadar hot-list events with Jev.")
    parser.add_argument("--config", default="config/jev_radar.yaml")
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--candidates", type=int, help="Maximum momentum-qualified events to send to Jev")
    parser.add_argument("--platforms", help="Comma-separated platform IDs to include")
    parser.add_argument("--dry-run", action="store_true", help="Skip Jev and only calculate observable momentum")
    parser.add_argument("--output", help="Optional Markdown report path")
    args = parser.parse_args()
    load_dotenv()
    radar_config, ctx = load_radar_config(args.config), AppContext(load_config())
    platform_ids = [item.strip() for item in args.platforms.split(",") if item.strip()] if args.platforms else None
    items = read_hot_items(ctx, platform_ids)
    if not items:
        print("没有可分析的热榜历史。请先运行 python -m trendradar 完成一次采集。")
        return 1
    client = None if args.dry_run else JevClient(timeout=int(radar_config.get("jev", {}).get("timeout_seconds", 20)))
    candidate_limit = args.candidates or int(radar_config.get("pre_filter_limit", 30))
    results = OpportunityRadar(radar_config.get("creator_profile", {}), radar_config.get("weights")).evaluate(
        items, client=client, candidate_limit=candidate_limit
    )[:args.top]
    output = Path(args.output or ctx.get_output_path("jev-radar", f"{ctx.format_time()}-opportunities.md"))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_markdown(results, bool(client and client.configured)), encoding="utf-8")
    output.with_suffix(".json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已输出 {len(results)} 个机会：{output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
