"""
Receipt OCR via Claude vision.

This is the only place in the codebase that calls the vision API for receipts.
Returns extracted text or an empty string on any failure — never raises, so
the upload flow always succeeds even if OCR is offline.

Test isolation:
    OCR_STUB=1   -> bypass Claude. Returns a deterministic text snippet derived
                    from the file path so tests assert on it without flake or cost.
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


def ocr_receipt(file_path: str | Path) -> str:
    """Return extracted text from a receipt image / PDF, or '' on failure."""
    path = Path(file_path)
    if not path.exists():
        logger.warning("ocr_receipt: file missing %s", path)
        return ""

    if os.environ.get("OCR_STUB") == "1":
        return _stub_text(path)

    try:
        return _ocr_via_claude(path)
    except Exception as exc:
        logger.warning("ocr_receipt: vision call failed (%s) — returning empty", exc)
        return ""


def _ocr_via_claude(path: Path) -> str:
    import anthropic

    mime, _ = mimetypes.guess_type(str(path))
    if mime is None:
        ext = path.suffix.lower()
        mime = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".gif": "image/gif",
            ".webp": "image/webp", ".pdf": "application/pdf",
        }.get(ext)

    if mime not in {"image/jpeg", "image/png", "image/gif", "image/webp"}:
        # Claude vision currently supports the four image types; PDFs we skip
        # for OCR (they're rare for receipts and pdfplumber would already have
        # tried at the policy-extractor layer for policy uploads).
        logger.info("ocr_receipt: unsupported MIME %s — skipping vision call", mime)
        return ""

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


def _stub_text(path: Path) -> str:
    return f"[stub OCR for {path.name}] Receipt text would appear here."
