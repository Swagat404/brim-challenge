"""
Receipt OCR via Claude vision.

Single code path: every receipt upload is OCR'd by Claude vision. No stubs,
no fallbacks. Returns extracted text or raises on failure (the upload route
catches the error and surfaces it to the user).

Tests that need to avoid the API should monkeypatch `ocr_receipt` directly
(see backend/tests/test_submissions.py for the pattern).
"""
from __future__ import annotations

import base64
import logging
import mimetypes
import os
from pathlib import Path

logger = logging.getLogger(__name__)


_VISION_PROMPT = (
    "Extract the text content of this receipt as plainly as possible. "
    "Preserve line items with prices when visible. Include the merchant "
    "name, total, date, and any tip / tax / itemization. Output only the "
    "extracted text — no markdown, no commentary."
)


_SUPPORTED_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def ocr_receipt(file_path: str | Path) -> str:
    """Return extracted text from a receipt image. Empty string on failure
    so the upload doesn't 500 — the user sees the file uploaded but no OCR
    text yet, which is honest about what happened.
    """
    path = Path(file_path)
    if not path.exists():
        logger.warning("ocr_receipt: file missing %s", path)
        return ""

    mime, _ = mimetypes.guess_type(str(path))
    if mime is None:
        ext = path.suffix.lower()
        mime = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".gif": "image/gif",
            ".webp": "image/webp",
        }.get(ext)

    if mime not in _SUPPORTED_MIME:
        logger.info("ocr_receipt: unsupported MIME %s — skipping", mime)
        return ""

    try:
        import anthropic
    except ImportError:
        logger.error("anthropic package not installed")
        return ""

    try:
        with open(path, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")

        client = anthropic.Anthropic()
        msg = client.messages.create(
            model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}},
                    {"type": "text", "text": _VISION_PROMPT},
                ],
            }],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        logger.warning("ocr_receipt: Claude vision call failed (%s)", exc)
        return ""
