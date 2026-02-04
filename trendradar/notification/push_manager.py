# coding=utf-8
"""
推送记录管理模块

管理推送记录，支持每日只推送一次和时间窗口控制
通过 storage_backend 统一存储，支持本地 SQLite 和远程云存储
"""

from datetime import datetime
from typing import Callable, Optional, Any, Tuple

import pytz

from trendradar.utils.time import DEFAULT_TIMEZONE, TimeWindowChecker


class PushRecordManager:
    """
    推送记录管理器

    通过 storage_backend 统一管理推送记录：
    - 本地环境：使用 LocalStorageBackend，数据存储在本地 SQLite
    - GitHub Actions：使用 RemoteStorageBackend，数据存储在云端

    这样 once_per_day 功能在 GitHub Actions 上也能正常工作。
    """

    def __init__(
        self,
        storage_backend: Any,
        get_time_func: Optional[Callable[[], datetime]] = None,
    ):
        """
        初始化推送记录管理器

        Args:
            storage_backend: 存储后端实例（LocalStorageBackend 或 RemoteStorageBackend）
            get_time_func: 获取当前时间的函数（应使用配置的时区）
        """
        self.storage_backend = storage_backend
        self.get_time = get_time_func or self._default_get_time

        print(f"[推送记录] 使用 {storage_backend.backend_name} 存储后端")

    def _default_get_time(self) -> datetime:
        """默认时间获取函数（使用 storage_backend 的时区配置）"""
        timezone = getattr(self.storage_backend, 'timezone', DEFAULT_TIMEZONE)
        return datetime.now(pytz.timezone(timezone))

    def has_pushed_today(self) -> bool:
        """
        检查今天是否已经推送过

        Returns:
            是否已推送
        """
        return self.storage_backend.has_pushed_today()

    def record_push(self, report_type: str) -> bool:
        """
        记录推送

        Args:
            report_type: 报告类型

        Returns:
            是否记录成功
        """
        return self.storage_backend.record_push(report_type)

    def is_in_time_range(self, start_time: str, end_time: str) -> bool:
        """
        检查当前时间是否在指定时间范围内

        Args:
            start_time: 开始时间（格式：HH:MM）
            end_time: 结束时间（格式：HH:MM）

        Returns:
            是否在时间范围内
        """
        checker = TimeWindowChecker(
            storage_backend=self.storage_backend,
            get_time_func=self.get_time,
            window_name="推送窗口",
        )
        return checker.is_in_time_range(start_time, end_time)

    def check_push_window(self, window_config: dict) -> Tuple[bool, str]:
        """
        检查推送窗口控制

        Args:
            window_config: 推送窗口配置

        Returns:
            (should_push, reason) 元组
        """
        checker = TimeWindowChecker(
            storage_backend=self.storage_backend,
            get_time_func=self.get_time,
            window_name="推送窗口",
        )
        return checker.check_window(
            window_config=window_config,
            check_once_per_day_func=self.has_pushed_today,
        )

    def check_ai_analysis_window(self, window_config: dict) -> Tuple[bool, str]:
        """
        检查 AI 分析窗口控制

        Args:
            window_config: AI 分析窗口配置

        Returns:
            (should_analyze, reason) 元组
        """
        checker = TimeWindowChecker(
            storage_backend=self.storage_backend,
            get_time_func=self.get_time,
            window_name="AI 分析窗口",
        )
        return checker.check_window(
            window_config=window_config,
            check_once_per_day_func=self.storage_backend.has_ai_analyzed_today,
        )

    def get_push_status(self, window_config: dict) -> dict:
        """
        获取推送状态信息

        Args:
            window_config: 推送窗口配置

        Returns:
            状态信息字典
        """
        checker = TimeWindowChecker(
            storage_backend=self.storage_backend,
            get_time_func=self.get_time,
            window_name="推送窗口",
        )
        status = checker.get_status(
            window_config=window_config,
            check_once_per_day_func=self.has_pushed_today,
        )
        status["window_type"] = "push"
        return status

    def get_ai_analysis_status(self, window_config: dict) -> dict:
        """
        获取 AI 分析状态信息

        Args:
            window_config: AI 分析窗口配置

        Returns:
            状态信息字典
        """
        checker = TimeWindowChecker(
            storage_backend=self.storage_backend,
            get_time_func=self.get_time,
            window_name="AI 分析窗口",
        )
        status = checker.get_status(
            window_config=window_config,
            check_once_per_day_func=self.storage_backend.has_ai_analyzed_today,
        )
        status["window_type"] = "ai_analysis"
        return status

    def reset_push_state(self) -> bool:
        """
        重置今日推送状态

        Returns:
            是否重置成功
        """
        try:
            # 通过存储后端重置推送记录
            if hasattr(self.storage_backend, 'reset_push_state'):
                return self.storage_backend.reset_push_state()
            else:
                print("[推送记录] 存储后端不支持重置推送状态")
                return False
        except Exception as e:
            print(f"[推送记录] 重置推送状态失败: {e}")
            return False

    def reset_ai_analysis_state(self) -> bool:
        """
        重置今日 AI 分析状态

        Returns:
            是否重置成功
        """
        try:
            if hasattr(self.storage_backend, 'reset_ai_analysis_state'):
                return self.storage_backend.reset_ai_analysis_state()
            else:
                print("[推送记录] 存储后端不支持重置 AI 分析状态")
                return False
        except Exception as e:
            print(f"[推送记录] 重置 AI 分析状态失败: {e}")
            return False
