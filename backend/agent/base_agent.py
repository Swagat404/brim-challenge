"""
ExpenseAgent — async streaming agent loop.

Inspired by agent_core/Agents/base_agent.py (tensorstax) but self-contained.
Uses AsyncAnthropic directly — no LLMRouter.

Architecture:
┌──────────────────────────────────────────────────────────┐
│                   ExpenseAgent.run()                      │
│                                                          │
│  build_messages(session_history + new message)           │
│       │                                                  │
│       ▼                                                  │
│  client.messages.stream(model, system, messages, tools)  │
│       │                                                  │
│       ├─► text_delta   → yield TextEvent                │
│       │                                                  │
│       └─► tool_use     → ToolExecutor.dispatch()        │
│                │                                         │
│                ├─► yield ToolStartEvent                  │
│                ├─► tool.execute(parsed_params)           │
│                ├─► yield ToolResultEvent                 │
│                └─► append result to messages, loop back │
│                                                          │
│  yield DoneEvent (or ErrorEvent on failure)             │
└──────────────────────────────────────────────────────────┘

CRITICAL: session_history is owned by the caller (route handler), NOT stored
on this instance. The agent is a singleton shared across all requests.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, AsyncGenerator

import anthropic

from agent.models import (
    AgentEvent,
    EventType,
    Message,
    Role,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
)
from agent.tools.base_tool import BaseTool

logger = logging.getLogger(__name__)

def _data_window() -> tuple[str, str]:
    """Return (min, max) ISO transaction dates from the live DB.

    Used to anchor "today" / "last N days" / "this quarter" in the analytics
    system prompt so the LLM uses dates that actually have data, instead of
    real-world today (which the dataset might not extend to).
    """
    try:
        from data import db
        df = db.query_df(
            "SELECT MIN(transaction_date) AS lo, MAX(transaction_date) AS hi "
            "FROM transactions WHERE is_operational = 1"
        )
        if df.empty or df.iloc[0]["hi"] is None:
            return ("", "")
        return (str(df.iloc[0]["lo"])[:10], str(df.iloc[0]["hi"])[:10])
    except Exception:
        return ("", "")


def _build_analytics_prompt() -> str:
    lo, hi = _data_window()
    window_note = (
        f"\nDATASET WINDOW: transactions span {lo} to {hi}. When the user says "
        f'"today", "this month", "last 30 days", "Q1", "this quarter", etc., '
        f"interpret those windows relative to the latest data date ({hi}), "
        f"NOT the real-world calendar today. For example: 'last 30 days' = "
        f"the 30 days ending {hi}; 'this month' = the calendar month "
        f"containing {hi}.\n"
        if lo and hi else ""
    )
    return ANALYTICS_PROMPT_BODY + window_note


ANALYTICS_PROMPT_BODY = """You are Sift, an expense intelligence analyst for a fleet trucking company.

Voice and formatting rules — these are non-negotiable:
- No emojis. Ever. Not in body text, not in headings, not in tables. The
  audience is a finance manager. Emojis make the answer look unserious.
- No purple-prose intros ("Here's a breakdown of…", "Sure! Let me…"). Open
  the answer with the data, not with throat-clearing.
- Keep it tight. Short sentences. One idea per line. Markdown tables and
  short bullet lists only when they add clarity.
- When showing money, use $X,XXX.XX with a thousands separator and CAD
  unless asked otherwise.
- Don't restate what the user asked. Don't end with offers ("let me know
  if you'd like…").
- Don't narrate your tool calls. The UI shows "Querying…" status lines
  separately while you work; never write your own "running query" lines.


You have access to 8 months of transaction data (Sep 2025 – Mar 2026) covering ~50 employees
across 7 departments operating in the USA and Canada.

Company profile:
- Operations: 18 long-haul drivers, 4 dispatchers (~4,100 transactions, ~$1.95M CAD spend — fuel, permits, tires)
- Sales: 5 employees — client entertainment, conferences, travel
- IT: 3 employees — software subscriptions, hardware, cloud hosting
- Maintenance: 8 fleet mechanics — parts, tools, safety equipment
- Management: 5 executives — offsites, business dinners, professional development
- Finance: 5 employees — admin, accounting tools
- Compliance: 2 employees — safety training, audit fees
- Multi-currency: CAD and USD (conversion rates stored per transaction as amount_cad)
- Bank payments (Transaction Code 108) are credit card bill payments, NOT expenses — always exclude from spend analysis

Your capabilities:
1. Query transaction data with structured queries (query_transactions) for standard breakdowns
2. Run custom SQL queries (run_sql_query) for complex analytics — budget comparisons, JOINs, subqueries
3. Check expenses against the company policy ($50 pre-auth threshold, tip limits ≤20%, no alcohol without client)
4. Generate approval recommendations with full context
5. Create expense reports grouped by employee/trip/period

When answering follow-up questions, always use context from prior messages in this conversation.
When you call a tool, explain briefly what you're doing before calling it.
Present numbers in CAD unless the user asks for USD. Round to 2 decimal places.
Prefer query_transactions for simple grouping/aggregation. Use run_sql_query when you need JOINs, subqueries, window functions, or budget comparisons.

CANONICAL SPEND FILTER: when computing spend totals, ALWAYS use
`is_operational = 1 AND debit_or_credit = 'Debit'`. Anything looser (e.g.
just `transaction_code != 108`) double-counts admin/credit rows and disagrees
with the dashboard. Numbers MUST reconcile across surfaces.
"""

# Backwards-compat alias — older code reads ANALYTICS_SYSTEM_PROMPT directly,
# but new code should call _build_analytics_prompt() to get the per-request
# version with the live data window injected.
ANALYTICS_SYSTEM_PROMPT = ANALYTICS_PROMPT_BODY


POLICY_EDITOR_SYSTEM_PROMPT = """You are Sift's Policy Editor assistant. You sit in a sidebar inside the
admin's policy editor and help them improve the company's expense policy
without leaving the page.

How you propose policy changes:
- ALWAYS use `manage_policy_document` with action='propose_edit' to surface
  a change. The editor on the left shows the proposed diff inline (added
  text in green, removed in red) with Accept / Reject buttons. The human
  clicks Accept to commit — you do NOT call action='apply_edit' yourself
  unless the user has explicitly said "apply" or "accept" first.
- After proposing, briefly tell the user which fields changed and why,
  and let them decide.

PROPOSE FAST. The user reviews the diff in the editor with Accept / Reject
buttons — that IS the confirmation step. Do NOT verbally re-confirm before
proposing. Do NOT ask follow-up questions just to be polite. If you have
enough information to propose a sensible default, propose it.

Cascade rules — the policy has several distinct dollar thresholds that
sometimes coincidentally share the same value:

  * `thresholds.receipt_required`     — gate for "must attach a receipt"
  * `thresholds.pre_auth`             — gate for "must pre-authorize"
  * `approval_thresholds_by_role.*`   — per-role approval ceilings
  * `submission_requirements[].body`  — text mirroring one of the above
  * `sections[].body`                 — narrative that may quote any of them

When the user says "change X to Y":

1. Update the canonical field that owns X.
2. Update mirrored `submission_requirements` whose body is a literal
   restatement of X (e.g. `receipt-over-threshold` body when the user
   changes `receipt_required`). These are coupled — out-of-sync is a bug.
3. For section narratives that quote X AND ONLY X, include them too.
4. For section narratives that quote X alongside a DIFFERENT distinct
   threshold (same dollar value, different concept), LEAVE them alone —
   then mention this once in your follow-up message so the user knows
   it was intentional. Don't ask permission first; just do the safe
   thing and tell them.

You ONLY ask a clarifying question when the user's request is genuinely
ambiguous about WHICH field to change (e.g. "raise the threshold to $100"
without specifying which threshold). One question, then propose.

Other tools at your disposal:
- `manage_policy_suggestions`: list / generate / apply / dismiss the
  Sift policy suggestions panel on the left.
- `manage_policy_document` action='transactions_affected_by_last_edit':
  show approvals re-evaluated since the most recent policy_edit event.
- `check_policy_compliance`: find recurring policy violations to discuss
  patterns.

Style: be concise. Cite which policy section a change touches.
Sift leans conservative — when in doubt, recommend `review` over `approve`
and explain why. Never invent policy text the user didn't ask for.
Never reference Ramp or any other product by name — you are Sift.
"""


class ExpenseAgent:
    """
    Stateless async agent. Multiple personas can be instantiated (see api/deps.py).
    Session history is passed in per call — never stored here.
    """

    def __init__(
        self,
        tools: list[BaseTool],
        *,
        system_prompt: str = ANALYTICS_SYSTEM_PROMPT,
        persona: str = "analytics",
    ) -> None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set — add it to backend/.env")
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
        self.max_steps = int(os.environ.get("AGENT_MAX_STEPS", "10"))
        self.tools = {t.name: t for t in tools}
        self._tool_schemas = [t.to_claude_schema() for t in tools]
        self._system_prompt = system_prompt
        self.persona = persona
        logger.info("ExpenseAgent ready | persona=%s model=%s tools=%s",
                    persona, self.model, list(self.tools))

    # ── Public API ────────────────────────────────────────────────────────────

    async def run(
        self,
        message: str,
        session_history: list[Message],
    ) -> AsyncGenerator[AgentEvent, None]:
        """
        Stream agent events for a single user turn.

        Caller is responsible for:
        - Appending the user Message to session_history before calling
        - Appending assistant messages returned in events to session_history after
        """
        messages = self._build_api_messages(session_history)
        step = 0

        while step < self.max_steps:
            step += 1
            accumulated_text = ""
            tool_calls: list[dict[str, Any]] = []

            try:
                async with self.client.messages.stream(
                    model=self.model,
                    system=self._system_prompt,
                    messages=messages,
                    tools=self._tool_schemas,
                    max_tokens=4096,
                ) as stream:
                    async for event in stream:
                        # Text delta — stream to frontend immediately
                        if (
                            event.type == "content_block_delta"
                            and hasattr(event.delta, "text")
                        ):
                            accumulated_text += event.delta.text
                            yield AgentEvent(type=EventType.TEXT_DELTA, text=event.delta.text)

                    # Use final message for tool calls — guaranteed complete JSON,
                    # not dependent on streaming event shape.
                    final = await stream.get_final_message()
                    for block in final.content:
                        if block.type == "tool_use":
                            tool_calls.append({
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            })

            except anthropic.APITimeoutError:
                yield AgentEvent(type=EventType.ERROR, error="Claude API timed out. Please try again.")
                return
            except anthropic.RateLimitError:
                yield AgentEvent(type=EventType.ERROR, error="Rate limit reached. Please wait a moment.")
                return
            except anthropic.APIError as exc:
                yield AgentEvent(type=EventType.ERROR, error=f"API error: {exc}")
                return

            # Append assistant turn to messages for next loop
            assistant_content: list[dict] = []
            if accumulated_text:
                assistant_content.append({"type": "text", "text": accumulated_text})
            for tc in tool_calls:
                assistant_content.append({"type": "tool_use", "id": tc["id"], "name": tc["name"], "input": tc["input"]})

            if assistant_content:
                messages.append({"role": "assistant", "content": assistant_content})

            # No tool calls → done
            if not tool_calls:
                # Update session_history with final assistant message
                if accumulated_text:
                    session_history.append(Message(role=Role.ASSISTANT, content=accumulated_text))
                yield AgentEvent(type=EventType.DONE)
                return

            # Emit one TOOL_START per call up-front so the UI shows them all
            # at once (parallel-feel, not a serial cascade).
            for tc in tool_calls:
                yield AgentEvent(
                    type=EventType.TOOL_START,
                    tool_name=tc["name"],
                    tool_input=tc["input"],
                )

            # Execute tools concurrently — the model often calls 2-3 in a turn
            # (one per metric/breakdown). Sequential awaits add seconds; parallel
            # cuts that to the slowest single tool.
            async def _run(tc: dict) -> tuple[dict, Any]:
                progress_q: asyncio.Queue = asyncio.Queue()
                res = await self._dispatch_tool(tc["name"], tc["input"], progress_q)
                # Drain (don't surface) progress queue
                while not progress_q.empty():
                    progress_q.get_nowait()
                return tc, res

            results = await asyncio.gather(*[_run(tc) for tc in tool_calls])

            tool_results: list[dict] = []
            for tc, result in results:
                tool_name = tc["name"]
                tool_id = tc["id"]

                # Emit chart event separately so frontend can render it
                if result.chart:
                    yield AgentEvent(type=EventType.CHART, chart=result.chart, tool_name=tool_name)

                # Surface a pending policy edit to the /policy editor so it
                # can render the diff inline with Accept / Reject.
                first_row = result.data[0] if result.data else None
                if isinstance(first_row, dict) and first_row.get("_policy_proposal"):
                    yield AgentEvent(
                        type=EventType.POLICY_PROPOSAL,
                        tool_name=tool_name,
                        proposal={
                            "fields": first_row.get("fields", []),
                            "edit": first_row.get("edit", {}),
                            "diff": first_row.get("diff", {}),
                            "rationale": first_row.get("rationale", ""),
                        },
                    )

                yield AgentEvent(
                    type=EventType.TOOL_RESULT,
                    tool_name=tool_name,
                    tool_output=result.text,
                )

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": self._serialize_tool_result(result),
                })

            # Append tool results as user turn for next loop
            messages.append({"role": "user", "content": tool_results})

        # Exceeded max_steps
        yield AgentEvent(
            type=EventType.ERROR,
            error=f"Agent reached maximum steps ({self.max_steps}). The query may be too complex.",
        )

    # ── Internals ─────────────────────────────────────────────────────────────

    def _build_api_messages(self, history: list[Message]) -> list[dict]:
        """Convert our Message dataclasses to Anthropic API dicts."""
        out = []
        for msg in history:
            if isinstance(msg.content, str):
                out.append({"role": msg.role.value, "content": msg.content})
            else:
                # list of blocks — already in API format
                out.append({"role": msg.role.value, "content": [
                    self._block_to_dict(b) for b in msg.content
                ]})
        return out

    def _block_to_dict(self, block) -> dict:
        if isinstance(block, TextBlock):
            return {"type": "text", "text": block.text}
        if isinstance(block, ToolUseBlock):
            return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
        if isinstance(block, ToolResultBlock):
            return {"type": "tool_result", "tool_use_id": block.tool_use_id, "content": block.content}
        return {}

    async def _dispatch_tool(self, name: str, raw_input: dict, progress_q: asyncio.Queue) -> Any:
        """Parse input via the tool's schema, then execute. Never raises."""
        from agent.models import ToolResult
        tool = self.tools.get(name)
        if tool is None:
            logger.error("Tool not found: %s", name)
            return ToolResult(text=f"Unknown tool: {name}", error=f"Unknown tool: {name}")
        try:
            tool.set_progress_queue(progress_q)
            params = tool.InputSchema(**raw_input)
            return await asyncio.wait_for(tool.execute(params), timeout=180.0)
        except asyncio.TimeoutError:
            return ToolResult(text=f"Tool {name} timed out.", error="timeout")
        except Exception as exc:
            logger.exception("Tool %s failed: %s", name, exc)
            return ToolResult(text=f"Tool {name} encountered an error: {exc}", error=str(exc))

    def _serialize_tool_result(self, result) -> str:
        """Convert ToolResult to a JSON string Claude can read."""
        payload: dict[str, Any] = {"summary": result.text}
        if result.error:
            payload["error"] = result.error
        if result.data:
            payload["rows"] = result.data[:100]  # cap at 100 rows in context
            payload["total_rows"] = len(result.data)
        if result.chart:
            payload["chart_type"] = result.chart.get("type")
            payload["chart_note"] = "Chart rendered to frontend separately."
        return json.dumps(payload, default=str)
