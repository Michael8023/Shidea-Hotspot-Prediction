"""Atomic Jev questions used to judge one merged hot-topic event."""

from typing import Dict


SCORE_LEVELS = [
    "很低或几乎不成立",
    "偏低",
    "一般",
    "较高",
    "非常高",
]


def build_questions(profile: Dict) -> Dict:
    """Return independent, code-composable questions for an event cluster."""
    niche = profile.get("niche", "科技、AI 与创业")
    audience = profile.get("audience", "关注科技与 AI 的中文内容消费者")
    voice = profile.get("voice", "理性、清晰、有独立判断")
    target_audiences = profile.get("target_audiences") or {
        "大众用户": "与日常生活、消费或广泛社会讨论直接相关",
        "科技爱好者": "与产品、互联网、AI 或数码趋势相关",
        "开发者": "与工程、开源、模型、工具或技术实现相关",
        "创业与商业": "与公司、融资、市场、商业模式或行业竞争相关",
    }
    recommended_angles = profile.get("recommended_angles") or {
        "快讯解释": "快速讲清楚发生了什么以及为什么重要",
        "产品或技术解读": "解释产品、技术、功能或使用价值",
        "对比评测": "与已有产品、方案或历史事件进行比较",
        "影响与观点": "讨论对行业、用户或商业的影响",
        "暂不跟进": "信息价值或内容空间不足，不建议立即制作",
    }

    return {
        "relevance": {"type": "score", "instructions": f"这个事件与创作者赛道「{niche}」的相关程度。", "criteria": SCORE_LEVELS},
        "novelty": {"type": "score", "instructions": "这是否包含值得报道的新信息、变化或新角度，而非普通的重复讨论。", "criteria": SCORE_LEVELS},
        "creator_fit": {"type": "score", "instructions": f"以「{voice}」的表达方式，为受众「{audience}」制作内容的匹配程度。", "criteria": SCORE_LEVELS},
        "contentability": {"type": "score", "instructions": "该事件是否有清晰叙事、可解释价值或可视化证据，足以形成一条好内容。", "criteria": SCORE_LEVELS},
        "differentiation": {"type": "score", "instructions": "创作者是否有合理机会从解释、对比、影响分析等角度做出不止于复述热搜的内容。", "criteria": SCORE_LEVELS},
        "risk": {"type": "score", "instructions": "该事件存在失实、误导、敏感、版权或品牌安全风险的程度。只判断风险，不判断热度。", "criteria": SCORE_LEVELS},
        "fact_check_needed": {"type": "noul", "instructions": "在发布相关内容前，需要通过一手来源或可靠报道进行事实核查。"},
        "audience": {"type": "choice", "instructions": "哪一类受众最可能关心这个事件。", "criteria": target_audiences},
        "recommended_angle": {"type": "choice", "instructions": "最适合优先研究的内容角度。", "criteria": recommended_angles},
    }
