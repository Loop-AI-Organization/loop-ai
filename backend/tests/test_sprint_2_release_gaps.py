import asyncio
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app import routes
from app.routes import ChannelSettingsRequest, TriageRequest, update_channel_settings


class SprintReleaseGapTests(unittest.TestCase):
    def test_restricted_llm_setting_requires_workspace_owner(self):
        with patch(
            "app.routes._select_channel_by_id",
            return_value={
                "id": "ch-1",
                "workspace_id": "ws-1",
                "type": "project",
                "is_llm_restricted": False,
                "llm_participation_enabled": True,
            },
        ), patch("app.routes._user_can_access_workspace", return_value=True), patch(
            "app.routes._user_can_access_channel", return_value=True
        ), patch(
            "app.routes._user_is_workspace_owner", return_value=False
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    update_channel_settings(
                        "ch-1",
                        ChannelSettingsRequest(is_llm_restricted=True),
                        {"sub": "member-1"},
                    )
                )

        self.assertEqual(ctx.exception.status_code, 403)

    def test_low_confidence_navigation_asks_for_clarification(self):
        with patch(
            "app.routes._select_channel_by_id",
            return_value={
                "id": "ch-current",
                "workspace_id": "ws-1",
                "type": "project",
                "is_llm_restricted": False,
                "llm_participation_enabled": True,
            },
        ), patch("app.routes.detect_navigation_intent", return_value={"is_navigation": True, "query": "project"}), patch(
            "app.routes._user_can_access_workspace", return_value=True
        ), patch(
            "app.routes._user_can_access_channel", return_value=True
        ), patch(
            "app.routes._get_user_channels", return_value=[{"id": "ch-2", "workspace_id": "ws-1", "name": "Project"}]
        ), patch(
            "app.routes.find_best_channel",
            return_value={
                "channel_id": "ch-2",
                "workspace_id": "ws-1",
                "channel_name": "Project",
                "workspace_name": "LoopAI",
                "confidence": "low",
                "reason": "Several channels could match.",
            },
        ):
            result = asyncio.run(
                routes.respond_to_ai_mention(
                    "ch-current",
                    TriageRequest(
                        channel_id="ch-current",
                        thread_id="thread-1",
                        messages=[{"role": "user", "content": "@ai open the project chat"}],
                    ),
                    {"sub": "user-1"},
                )
            )

        self.assertTrue(result["should_respond"])
        self.assertNotIn("navigation", result)
        self.assertIn("more specific", result["content"].lower())

    def test_file_query_endpoint_is_registered(self):
        self.assertTrue(hasattr(routes, "query_files_api"))


if __name__ == "__main__":
    unittest.main()
