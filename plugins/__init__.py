"""FlipHQ Slack check-in plugin.

Registers Block Kit button handlers so a Slack button click runs the
`fliphq-daily-tasks` skill for the clicking user with **zero LLM tokens**.

The Slack adapter wires plugin-registered action handlers into its
slack_bolt App at connect time; each handler receives the standard
``(ack, body, action)`` signature. On click we:

1. ``ack()`` immediately (Slack requires it within 3s).
2. Resolve the clicking Slack user -> Notion owner key.
3. Run ``daily_tasks.py`` in a subprocess and capture clean text.
4. Post the result back as an **ephemeral** message (only the clicker
   sees it — keeps the channel low-noise).

The daily-tasks script lives in the skill dir; we shell out to it so the
single source of truth for owner mapping / filtering / formatting stays in
one place instead of being re-derived here.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

# Slack member ID -> owner key understood by daily_tasks.py (--owner).
# Source: Slack users.list + Notion /v1/users, captured 2026-08-26.
SLACK_TO_OWNER = {
    "U030X92U799": "pulkit",       # Pulkit Narang
    "U09HJ56TVC5": "arpit",        # Arpit
    "U08EPK7PLAW": "dhananjay",    # Dhananjaya Mishra
    "U0B4LGK53L0": "vikram",       # vikramaditya
    "U0BLQAM9THV": "nayna",        # nayna
    # "U0AKHKFNN9W": "soumita"     # Soumita Ghosh — not yet a Notion user
    # "U0BNDLGUPPG": "shiv"        # shiv — not yet a Notion user
}

# Notion users not yet shared into the workspace (graceful fallback target).
NOT_IN_NOTION = {
    "U0AKHKFNN9W": "Soumita Ghosh",
    "U0BNDLGUPPG": "shiv",
}

ACTION_TELL_DAY = "fliphq_tell_my_day"
ACTION_TEAM_SNAP = "fliphq_team_snapshot"
ACTION_RESOLVE = "fliphq_resolve"      # prefix; sweeper buttons use unique `<prefix>_<verb>_<id>`
RESOLVE_ACTION_RE = re.compile(r"^fliphq_resolve_")
VIEW_REDATE = "fliphq_re_date"         # modal datepicker submission callback_id

_NOTION_API = "https://api.notion.com/v1"
_NOTION_VERSION = "2022-06-28"

# Where the sweeper cron script records "already nudged/skipped this sprint".
_STATE_PATH = Path(os.path.expanduser("~/.hermes/scripts/sweeper_state.json"))

_TASKS_SCRIPT = Path(
    os.path.expanduser(
        "~/.hermes/skills/productivity/fliphq-daily-tasks/scripts/daily_tasks.py"
    )
)


def _notion_env() -> dict:
    """Return an env dict guaranteed to carry NOTION_API_KEY.

    The gateway process normally inherits it from ~/.hermes/.env, but the
    subprocess gets an explicit copy so the click path never depends on the
    gateway's own env having been populated.
    """
    env = dict(os.environ)
    if env.get("NOTION_API_KEY") or env.get("NOTION_API_TOKEN"):
        return env
    env_file = Path(os.path.expanduser("~/.hermes/.env"))
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("NOTION_API_KEY="):
                env["NOTION_API_KEY"] = line.split("=", 1)[1].strip().strip('"')
                break
            if line.startswith("NOTION_API_TOKEN="):
                env["NOTION_API_TOKEN"] = line.split("=", 1)[1].strip().strip('"')
                break
    return env


def _run_tasks(args: list[str]) -> str:
    """Run daily_tasks.py and return its stdout (or a friendly error)."""
    cmd = [sys.executable, str(_TASKS_SCRIPT), *args]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            env=_notion_env(),
        )
    except FileNotFoundError:
        return "⚠️ Task lookup script not found."
    except subprocess.TimeoutExpired:
        return "⚠️ Task lookup timed out — try again in a moment."
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        return f"⚠️ {err or 'Task lookup failed.'}"
    return proc.stdout.strip()


async def _reply_ephemeral(channel_id: str, user_id: str, text: str) -> None:
    """Post a private (ephemeral) message visible only to the clicker."""
    try:
        from slack_sdk.web.async_client import AsyncWebClient

        token = os.getenv("SLACK_BOT_TOKEN")
        if not token:
            return
        client = AsyncWebClient(token=token)
        await client.chat_postEphemeral(
            channel=channel_id,
            user=user_id,
            text=text,
        )
    except Exception:
        # Never raise out of a button handler — the adapter catches it, but
        # we swallow here too so a partial failure doesn't spam the user.
        pass


async def _reply_blocks_ephemeral(channel_id: str, user_id: str, blocks: str) -> None:
    """Post a Block Kit blocks ephemeral message visible only to the clicker."""
    try:
        from slack_sdk.web.async_client import AsyncWebClient

        token = os.getenv("SLACK_BOT_TOKEN")
        if not token:
            return
        client = AsyncWebClient(token=token)
        # blocks is a JSON string of Block Kit blocks
        blocks_obj = json.loads(blocks) if isinstance(blocks, str) else blocks
        await client.chat_postEphemeral(
            channel=channel_id,
            user=user_id,
            text="Your day is ready!",  # fallback text
            blocks=blocks_obj,
        )
    except Exception:
        # Never raise out of a button handler
        pass


async def _handle_tell_my_day(ack, body, action) -> None:
    await ack()
    user_id = body.get("user", {}).get("id", "")
    channel_id = body.get("channel", {}).get("id", "")

    if user_id in NOT_IN_NOTION:
        name = NOT_IN_NOTION[user_id]
        await _reply_ephemeral(
            channel_id,
            user_id,
            f"Hey {name} 👋 — you're not in the Notion task tracker yet, so I "
            f"don't have tasks on file for you. I'll nudge Pulkit to add you.",
        )
        return

    owner = SLACK_TO_OWNER.get(user_id)
    if not owner:
        await _reply_ephemeral(
            channel_id,
            user_id,
            "I don't recognize you on the FlipHQ roster — ping Pulkit to add you.",
        )
        return

    # New Block Kit format
    blocks = await asyncio.to_thread(
        _run_tasks, ["--owner", owner, "--role", "both", "--format", "blocks"]
    )
    await _reply_blocks_ephemeral(channel_id, user_id, blocks)


async def _handle_team_snapshot(ack, body, action) -> None:
    await ack()
    channel_id = body.get("channel", {}).get("id", "")
    user_id = body.get("user", {}).get("id", "")
    blocks = await asyncio.to_thread(
        _run_tasks, ["--team", "--days", "14", "--format", "blocks"]
    )
    await _reply_blocks_ephemeral(channel_id, user_id, blocks)


# ---------------------------------------------------------------------------
# Sprint sweeper — resolve button + re-date modal
# ---------------------------------------------------------------------------

def _notion_token() -> str:
    return _notion_env().get("NOTION_API_KEY") or _notion_env().get("NOTION_API_TOKEN") or ""


def _notion_patch(page_id: str, properties: dict) -> None:
    """PATCH a Notion page's properties. Raises on failure."""
    body = json.dumps({"properties": properties}).encode()
    req = urllib.request.Request(
        f"{_NOTION_API}/pages/{page_id}",
        data=body,
        method="PATCH",
        headers={
            "Authorization": f"Bearer {_notion_token()}",
            "Notion-Version": _NOTION_VERSION,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        json.load(r)


def _read_state() -> dict:
    if not _STATE_PATH.is_file():
        return {}
    try:
        return json.loads(_STATE_PATH.read_text())
    except Exception:
        return {}


def _write_state(state: dict) -> None:
    _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _STATE_PATH.write_text(json.dumps(state))


def _sprint_key() -> str:
    """ISO date of the current week's Monday (the sweep anchor)."""
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()


def _mark_skipped(task_id: str) -> None:
    state = _read_state()
    state[task_id] = _sprint_key()
    _write_state(state)


async def _open_redate_modal(trigger_id, task_id, task_name, channel_id="") -> None:
    """Open a Slack modal with a datepicker for re-dating one task.

    ``channel_id`` is carried through ``private_metadata`` so the submit
    handler can post the confirmation ephemeral back to the same DM.
    """
    try:
        from slack_sdk.web.async_client import AsyncWebClient

        token = os.getenv("SLACK_BOT_TOKEN")
        if not token:
            return
        client = AsyncWebClient(token=token)
        default_date = (date.today() + timedelta(days=7)).isoformat()
        await client.views_open(
            trigger_id=trigger_id,
            view={
                "type": "modal",
                "callback_id": VIEW_REDATE,
                "title": {"type": "plain_text", "text": "Re-date task"},
                "private_metadata": json.dumps(
                    {"id": task_id, "name": task_name, "channel": channel_id}
                ),
                "blocks": [
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": f"*{task_name}*"},
                    },
                    {
                        "type": "input",
                        "block_id": "new_due",
                        "label": {"type": "plain_text", "text": "New due date"},
                        "element": {
                            "type": "datepicker",
                            "action_id": "datepick",
                            "initial_date": default_date,
                            "placeholder": {"type": "plain_text", "text": "Pick a date"},
                        },
                    },
                ],
                "submit": {"type": "plain_text", "text": "Save"},
            },
        )
    except Exception:
        # Never raise out of a button handler.
        pass


async def _handle_resolve(ack, body, action) -> None:
    await ack()
    user_id = body.get("user", {}).get("id", "")
    channel_id = body.get("channel", {}).get("id", "")

    raw = action.get("value", "")
    try:
        val = json.loads(raw)
    except Exception:
        await _reply_ephemeral(channel_id, user_id, "⚠️ Couldn't read that action.")
        return

    verb = val.get("v")
    task_id = val.get("id")
    task_name = val.get("n", "")
    if not verb or not task_id:
        await _reply_ephemeral(channel_id, user_id, "⚠️ Couldn't read that action.")
        return

    try:
        if verb == "done":
            await asyncio.to_thread(_notion_patch, task_id, {"Status": {"status": {"name": "Done"}}})
            await _reply_ephemeral(channel_id, user_id, f"✅ Marked *{task_name}* done.")
        elif verb == "kill":
            await asyncio.to_thread(_notion_patch, task_id, {"Status": {"status": {"name": "Deprioritize"}}})
            await _reply_ephemeral(channel_id, user_id, f"🗑️ Deprioritized *{task_name}*.")
        elif verb == "skip":
            await asyncio.to_thread(_mark_skipped, task_id)
            await _reply_ephemeral(channel_id, user_id, f"⏸️ Skipped *{task_name}* — I'll check again next sprint.")
        elif verb == "redate":
            trigger_id = body.get("trigger_id", "")
            if not trigger_id:
                await _reply_ephemeral(channel_id, user_id, "⚠️ Can't open the date picker here.")
                return
            await _open_redate_modal(trigger_id, task_id, task_name, channel_id)
        else:
            await _reply_ephemeral(channel_id, user_id, f"⚠️ Unknown action '{verb}'.")
    except Exception as exc:
        await _reply_ephemeral(
            channel_id, user_id, f"⚠️ Couldn't update *{task_name}* — {exc}"
        )


async def _handle_redate_submit(ack, body) -> None:
    await ack()
    view = body.get("view", {})
    private = view.get("private_metadata", "{}")
    try:
        meta = json.loads(private)
    except Exception:
        meta = {}
    task_id = meta.get("id", "")
    task_name = meta.get("name", "")
    channel_id = meta.get("channel", "")
    user_id = body.get("user", {}).get("id", "")

    values = view.get("state", {}).get("values", {})
    new_date = ""
    for block in values.values():
        for elem in block.values():
            if elem.get("type") == "datepicker":
                new_date = elem.get("selected_date", "")
    if not new_date or not task_id:
        return

    try:
        await asyncio.to_thread(_notion_patch, task_id, {"Due": {"date": {"start": new_date}}})
    except Exception:
        if channel_id and user_id:
            await _reply_ephemeral(
                channel_id, user_id, f"⚠️ Couldn't re-date *{task_name}*."
            )
        return

    # Confirmation — mirror the kill/done acknowledgements.
    if channel_id and user_id:
        try:
            pretty = date.fromisoformat(new_date).strftime("%d-%B-%y")
        except ValueError:
            pretty = new_date
        await _reply_ephemeral(
            channel_id, user_id, f"📅 Re-dated *{task_name}* to {pretty}."
        )


def register(ctx) -> None:
    ctx.register_slack_action_handler(ACTION_TELL_DAY, _handle_tell_my_day)
    ctx.register_slack_action_handler(ACTION_TEAM_SNAP, _handle_team_snapshot)
    ctx.register_slack_action_handler(RESOLVE_ACTION_RE, _handle_resolve)
    ctx.register_slack_view_handler(VIEW_REDATE, _handle_redate_submit)
