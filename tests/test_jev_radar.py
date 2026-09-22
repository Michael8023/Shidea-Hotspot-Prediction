import unittest

from trendradar.jev.client import normalized_score
from trendradar.jev.questions import build_questions
from trendradar.jev.radar import EventCluster, HotItem, cluster_items, momentum


class JevRadarTests(unittest.TestCase):
    def test_similar_titles_merge_across_platforms(self):
        items = [HotItem("OpenAI 发布新一代视频生成模型", "weibo", "微博", 4, count=2), HotItem("OpenAI发布新一代视频生成模型", "zhihu", "知乎", 8, count=1)]
        clusters = cluster_items(items)
        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0].platforms, ["微博", "知乎"])

    def test_momentum_rewards_cross_platform_and_persistence(self):
        weak = EventCluster([HotItem("单平台话题", "weibo", "微博", 80, count=1)])
        strong = EventCluster([HotItem("跨平台话题", "weibo", "微博", 5, count=4, ranks=[20, 5]), HotItem("跨平台话题", "zhihu", "知乎", 10, count=3, ranks=[30, 10])])
        self.assertGreater(momentum(strong), momentum(weak))

    def test_score_normalization(self):
        self.assertEqual(normalized_score({"type": "score", "score": 4}), 1.0)
        self.assertEqual(normalized_score({"type": "score", "score": 2}), 0.5)

    def test_custom_audiences_and_angles_are_sent_to_jev(self):
        questions = build_questions({
            "target_audiences": {"产品经理": "关注产品机会"},
            "recommended_angles": {"案例拆解": "拆解实践案例"},
        })
        self.assertEqual(questions["audience"]["criteria"], {"产品经理": "关注产品机会"})
        self.assertEqual(questions["recommended_angle"]["criteria"], {"案例拆解": "拆解实践案例"})
        self.assertIn("audience_fit_0", questions)
        self.assertEqual(questions["audience_fit_0"]["type"], "score")


if __name__ == "__main__":
    unittest.main()
