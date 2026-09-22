"""Atomic Jev questions used to judge one merged hot-topic event."""

from typing import Dict


SCORE_LEVELS = [
    "很低或几乎不成立",
    "偏低",
    "一般",
    "较高",
    "非常高",
]

DEFAULT_TARGET_AUDIENCES = {
    "AI 开发者与技术构建者": "从事或学习模型、应用、工具、工程落地的人；关注模型、开源、Agent、编程、算力、开发工具与技术发布",
    "数码尝鲜与 AI 工具用户": "愿意尝试新手机、新 App、AI 产品的科技消费者；关注新品、功能、评测、价格、使用技巧与产品体验",
    "年轻趋势人群（18–28）": "学生与初入职场者；关注娱乐、游戏、偶像、社交话题、消费趋势、求职、旅行与网络文化",
    "职场成长人群（22–35）": "关注工作效率、职业路径、收入和行业变化的人；关注招聘、技能、薪酬、效率工具、行业机会与政策",
    "家庭决策人群（30–55）": "对教育、家庭预算、出行、健康、住房与家庭消费有决策权的人；关注育儿、医疗、汽车、保险与公共服务",
    "活力银发人群（55+）": "关注健康管理、养老、反诈、出行和智能设备易用性的成熟用户；关注健康科普、养老政策、诈骗预警、适老科技、旅游与生活服务",
    "创业者与小微经营者": "自己经营生意或负责产品、增长、市场的人；关注融资、平台规则、行业竞争、流量变化、商业机会与营销工具",
}


def target_audiences_for(profile: Dict) -> Dict:
    return profile.get("target_audiences") or DEFAULT_TARGET_AUDIENCES


def build_questions(profile: Dict) -> Dict:
    """Return independent, code-composable questions for an event cluster."""
    niche = profile.get("niche", "科技、AI 与创业")
    audience = profile.get("audience", "关注科技与 AI 的中文内容消费者")
    voice = profile.get("voice", "理性、清晰、有独立判断")
    target_audiences = target_audiences_for(profile)
    recommended_angles = profile.get("recommended_angles") or {
        "快讯解释": "快速讲清楚发生了什么以及为什么重要",
        "产品或技术解读": "解释产品、技术、功能或使用价值",
        "对比评测": "与已有产品、方案或历史事件进行比较",
        "影响与观点": "讨论对行业、用户或商业的影响",
        "暂不跟进": "信息价值或内容空间不足，不建议立即制作",
    }

    questions = {
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
    # A choice only tells us the most suitable audience. Separate scores let the
    # product build genuinely different leaderboards for every audience group.
    for index, (name, description) in enumerate(target_audiences.items()):
        questions[f"audience_fit_{index}"] = {
            "type": "score",
            "instructions": f"这个事件对「{name}」的内容价值与关注可能性。人群定义：{description}。",
            "criteria": SCORE_LEVELS,
        }
    return questions
