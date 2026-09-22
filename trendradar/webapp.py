"""Local-only web workbench for the Jev opportunity radar."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.parse import urlparse

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "web" / "static"
ENV_PATH = ROOT / ".env"
RADAR_CONFIG = ROOT / "config" / "jev_radar.yaml"
_job: subprocess.Popen | None = None
_job_kind: str | None = None
_job_lock = Lock()


def _read_env() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    values = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def _write_env(updates: dict[str, str]) -> None:
    current = _read_env()
    current.update({key: value for key, value in updates.items() if value})
    ENV_PATH.write_text("\n".join(f"{key}={value}" for key, value in sorted(current.items())) + "\n", encoding="utf-8")
    os.chmod(ENV_PATH, 0o600)
    load_dotenv(ENV_PATH, override=True)


def _read_radar_config() -> dict[str, Any]:
    return yaml.safe_load(RADAR_CONFIG.read_text(encoding="utf-8")) or {}


def _write_radar_config(value: dict[str, Any]) -> None:
    RADAR_CONFIG.write_text(yaml.safe_dump(value, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _latest_report() -> list[dict[str, Any]]:
    report_dir = ROOT / "output" / "jev-radar"
    files = sorted(report_dir.glob("**/*-opportunities.json"), key=lambda path: path.stat().st_mtime)
    if not files:
        return []
    return json.loads(files[-1].read_text(encoding="utf-8"))


class WorkbenchHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args) -> None:  # Keep the workbench quiet by default.
        return

    def _json(self, payload: Any, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict[str, Any]:
        size = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(size) or b"{}")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/settings":
            config, env = _read_radar_config(), _read_env()
            self._json({
                "jev": {"api_base": env.get("TYPESAFE_API_BASE", "https://api.typesafe.ai/v1/systemone"), "api_key_configured": bool(env.get("TYPESAFE_API_KEY"))},
                "llm": {"model": env.get("AI_MODEL", ""), "api_base": env.get("AI_API_BASE", ""), "api_key_configured": bool(env.get("AI_API_KEY"))},
                "creator_profile": config.get("creator_profile", {}),
                "pre_filter_limit": config.get("pre_filter_limit", 30),
            })
            return
        if path == "/api/opportunities":
            self._json({"items": _latest_report()})
            return
        if path == "/api/job":
            with _job_lock:
                running = _job is not None and _job.poll() is None
                kind = _job_kind
            self._json({"running": running, "kind": kind})
            return
        return super().do_GET()

    def do_PUT(self) -> None:
        if urlparse(self.path).path != "/api/settings":
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        try:
            payload = self._body()
            _write_env({key: str(payload.get(key, "")) for key in ("TYPESAFE_API_KEY", "TYPESAFE_API_BASE", "AI_API_KEY", "AI_API_BASE", "AI_MODEL")})
            config = _read_radar_config()
            config["creator_profile"] = payload.get("creator_profile", config.get("creator_profile", {}))
            config["pre_filter_limit"] = max(1, min(100, int(payload.get("pre_filter_limit", 30))))
            _write_radar_config(config)
            self._json({"ok": True})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        commands = {
            "/api/collect": ("collect", [sys.executable, "-m", "trendradar"]),
            "/api/radar": ("radar", [sys.executable, "-m", "trendradar.jev", "--top", "10"]),
        }
        if path not in commands:
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        global _job, _job_kind
        with _job_lock:
            if _job is not None and _job.poll() is None:
                self._json({"running": True}, HTTPStatus.CONFLICT)
                return
            _job_kind, command = commands[path]
            _job = subprocess.Popen(command, cwd=ROOT)
        self._json({"running": True, "kind": _job_kind}, HTTPStatus.ACCEPTED)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local Jev Radar workbench.")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    load_dotenv(ENV_PATH)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), WorkbenchHandler)
    print(f"Jev Radar workbench: http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
