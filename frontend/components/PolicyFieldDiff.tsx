"use client";

import { useMemo } from "react";

/**
 * Render a side-by-side before/after diff for one top-level policy field.
 *
 * Strings render as line-level diffs; arrays of objects with an `id` key
 * (sections, submission_requirements, auto_approval_rules.rules) render
 * as a list of items each tagged + (added) / − (removed) / ~ (changed).
 * Anything else falls back to a JSON dump.
 */
export interface PolicyFieldDiffProps {
  field: string;
  before: unknown;
  after: unknown;
}

export default function PolicyFieldDiff({ field, before, after }: PolicyFieldDiffProps) {
  const segments = useMemo(() => buildSegments(field, before, after), [field, before, after]);
  return (
    <div className="bg-white border border-zinc-200/70 rounded-[16px] shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
        <span className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-zinc-500">
          Diff · {field}
        </span>
        <span className="text-[10.5px] text-zinc-400 font-medium">
          green = added · red = removed
        </span>
      </div>
      <div className="divide-y divide-zinc-100">
        {segments.map((seg, i) => (
          <DiffSegment key={i} segment={seg} />
        ))}
      </div>
    </div>
  );
}

type Segment =
  | { kind: "context"; label?: string; text: string }
  | { kind: "added"; label?: string; text: string }
  | { kind: "removed"; label?: string; text: string }
  | { kind: "changed"; label?: string; before: string; after: string };

function DiffSegment({ segment }: { segment: Segment }) {
  if (segment.kind === "added") {
    return (
      <div className="px-4 py-2.5 bg-emerald-50/60 flex items-start gap-3">
        <span className="text-emerald-700 font-bold text-[12px] flex-shrink-0 mt-0.5">+</span>
        <div className="flex-1 min-w-0">
          {segment.label && (
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">
              {segment.label}
            </p>
          )}
          <p className="text-[12.5px] text-emerald-900 font-medium whitespace-pre-wrap leading-relaxed">
            {segment.text}
          </p>
        </div>
      </div>
    );
  }
  if (segment.kind === "removed") {
    return (
      <div className="px-4 py-2.5 bg-rose-50/60 flex items-start gap-3">
        <span className="text-rose-700 font-bold text-[12px] flex-shrink-0 mt-0.5">−</span>
        <div className="flex-1 min-w-0">
          {segment.label && (
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700 mb-0.5">
              {segment.label}
            </p>
          )}
          <p className="text-[12.5px] text-rose-900 font-medium whitespace-pre-wrap leading-relaxed line-through">
            {segment.text}
          </p>
        </div>
      </div>
    );
  }
  if (segment.kind === "changed") {
    // Decide between SHORT-form (side-by-side pills) and LONG-form (inline
    // word-level diff). Short-form looks great for scalars like "50" → "60"
    // — but for long paragraphs it produces a wall of red strikethrough
    // next to a wall of green, which is exactly the noise the user
    // complained about. Anything multi-word goes inline.
    const isLong =
      (segment.before.length > 40 || segment.after.length > 40) &&
      (/\s/.test(segment.before) || /\s/.test(segment.after));

    if (isLong) {
      const tokens = inlineWordDiff(segment.before, segment.after);
      return (
        <div className="px-4 py-3">
          {segment.label && (
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
              {segment.label}
            </p>
          )}
          <p className="text-[12.5px] text-zinc-700 font-medium whitespace-pre-wrap leading-relaxed">
            {tokens.map((t, i) => {
              if (t.kind === "same") {
                return <span key={i}>{t.text}</span>;
              }
              if (t.kind === "del") {
                return (
                  <span
                    key={i}
                    className="bg-rose-100/80 text-rose-800 line-through rounded-[3px] px-0.5"
                  >
                    {t.text}
                  </span>
                );
              }
              return (
                <span
                  key={i}
                  className="bg-emerald-100/80 text-emerald-800 rounded-[3px] px-0.5"
                >
                  {t.text}
                </span>
              );
            })}
          </p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 divide-x divide-zinc-100">
        <div className="px-4 py-2.5 bg-rose-50/60">
          {segment.label && (
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700 mb-0.5">
              {segment.label}
            </p>
          )}
          <p className="text-[12.5px] text-rose-900 font-medium whitespace-pre-wrap leading-relaxed line-through">
            {segment.before}
          </p>
        </div>
        <div className="px-4 py-2.5 bg-emerald-50/60">
          {segment.label && (
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">
              {segment.label}
            </p>
          )}
          <p className="text-[12.5px] text-emerald-900 font-medium whitespace-pre-wrap leading-relaxed">
            {segment.after}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 py-2.5">
      <p className="text-[12.5px] text-zinc-600 font-medium whitespace-pre-wrap leading-relaxed">
        {segment.text}
      </p>
    </div>
  );
}

// ── Inline word-level diff (LCS) ─────────────────────────────────────────────

function tokenize(s: string): string[] {
  // Split keeping whitespace/punctuation as their own tokens so we can
  // re-assemble the prose without losing layout.
  return s.split(/(\s+|[^\w$%.,])/g).filter((t) => t.length > 0);
}

function inlineWordDiff(
  before: string,
  after: string,
): { kind: "same" | "add" | "del"; text: string }[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const m = a.length;
  const n = b.length;

  // Cap LCS to keep render cheap on huge bodies
  if (m * n > 250_000) {
    return [
      { kind: "del", text: before },
      { kind: "add", text: after },
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const raw: { kind: "same" | "add" | "del"; text: string }[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      raw.push({ kind: "same", text: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      raw.push({ kind: "del", text: a[i - 1] });
      i--;
    } else {
      raw.push({ kind: "add", text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    raw.push({ kind: "del", text: a[i - 1] });
    i--;
  }
  while (j > 0) {
    raw.push({ kind: "add", text: b[j - 1] });
    j--;
  }
  raw.reverse();

  // Coalesce consecutive same-kind tokens for fewer DOM nodes
  const out: { kind: "same" | "add" | "del"; text: string }[] = [];
  for (const t of raw) {
    const last = out[out.length - 1];
    if (last && last.kind === t.kind) last.text += t.text;
    else out.push({ ...t });
  }
  return out;
}

// ── Diff builders ────────────────────────────────────────────────────────────

function buildSegments(field: string, before: unknown, after: unknown): Segment[] {
  // Arrays of objects with an id field — diff by id
  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeArr = Array.isArray(before) ? (before as Record<string, unknown>[]) : [];
    const afterArr = Array.isArray(after) ? (after as Record<string, unknown>[]) : [];
    if (beforeArr.every((v) => v && typeof v === "object" && "id" in v) || afterArr.every((v) => v && typeof v === "object" && "id" in v)) {
      return diffById(beforeArr, afterArr);
    }
  }

  // Plain objects — diff by key
  if (isPlainObject(before) || isPlainObject(after)) {
    const beforeObj = (before ?? {}) as Record<string, unknown>;
    const afterObj = (after ?? {}) as Record<string, unknown>;
    return diffObject(beforeObj, afterObj);
  }

  // Scalar / fallback
  if (jsonOf(before) === jsonOf(after)) {
    return [{ kind: "context", text: jsonOf(after) }];
  }
  return [
    { kind: "changed", before: jsonOf(before), after: jsonOf(after) },
  ];
}

function diffById(
  before: Record<string, unknown>[],
  after: Record<string, unknown>[],
): Segment[] {
  const beforeMap = new Map(before.map((it) => [String(it.id), it]));
  const afterMap = new Map(after.map((it) => [String(it.id), it]));
  const out: Segment[] = [];

  // Added or changed
  for (const [id, item] of afterMap) {
    const old = beforeMap.get(id);
    if (!old) {
      out.push({ kind: "added", label: id, text: humanize(item) });
      continue;
    }
    if (jsonOf(old) === jsonOf(item)) continue;

    // Per-field diff: when a section { id, title, body } changed and only
    // body differs, surface just the body (with a section-id label) so we
    // don't repeat the title verbatim on both red and green sides.
    const itemKeys = new Set([
      ...Object.keys(old as Record<string, unknown>),
      ...Object.keys(item as Record<string, unknown>),
    ]);
    itemKeys.delete("id");
    let perFieldEmitted = false;
    for (const k of itemKeys) {
      const a = (old as Record<string, unknown>)[k];
      const b = (item as Record<string, unknown>)[k];
      if (jsonOf(a) === jsonOf(b)) continue;
      const label = k === "body" || k === "title" ? `${id} · ${k}` : `${id} · ${k}`;
      if (a === undefined) {
        out.push({ kind: "added", label, text: jsonOf(b) });
      } else if (b === undefined) {
        out.push({ kind: "removed", label, text: jsonOf(a) });
      } else {
        out.push({ kind: "changed", label, before: jsonOf(a), after: jsonOf(b) });
      }
      perFieldEmitted = true;
    }
    if (!perFieldEmitted) {
      // Fallback (shouldn't happen, but stay safe)
      out.push({
        kind: "changed",
        label: id,
        before: humanize(old),
        after: humanize(item),
      });
    }
  }
  // Removed
  for (const [id, item] of beforeMap) {
    if (!afterMap.has(id)) {
      out.push({ kind: "removed", label: id, text: humanize(item) });
    }
  }

  if (out.length === 0) {
    out.push({ kind: "context", text: "(no changes)" });
  }
  return out;
}

function diffObject(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Segment[] {
  const out: Segment[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (jsonOf(b) === jsonOf(a)) continue;
    if (b === undefined) {
      out.push({ kind: "added", label: k, text: jsonOf(a) });
    } else if (a === undefined) {
      out.push({ kind: "removed", label: k, text: jsonOf(b) });
    } else {
      out.push({ kind: "changed", label: k, before: jsonOf(b), after: jsonOf(a) });
    }
  }
  if (out.length === 0) out.push({ kind: "context", text: "(no changes)" });
  return out;
}

function jsonOf(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

function humanize(item: Record<string, unknown>): string {
  // Best-effort prose for known shapes
  if ("title" in item && "body" in item) {
    const title = String(item.title ?? "");
    const body = String(item.body ?? "");
    return `${title}\n${body}`;
  }
  if ("rationale" in item) {
    return String(item.rationale ?? jsonOf(item));
  }
  return jsonOf(item);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
