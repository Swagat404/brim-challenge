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
          <pre className="text-[12.5px] text-emerald-900 font-medium whitespace-pre-wrap leading-relaxed font-sans">
            {segment.text}
          </pre>
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
          <pre className="text-[12.5px] text-rose-900 font-medium whitespace-pre-wrap leading-relaxed font-sans line-through">
            {segment.text}
          </pre>
        </div>
      </div>
    );
  }
  if (segment.kind === "changed") {
    return (
      <div className="grid grid-cols-2 divide-x divide-zinc-100">
        <div className="px-4 py-2.5 bg-rose-50/60">
          {segment.label && (
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700 mb-0.5">
              {segment.label}
            </p>
          )}
          <pre className="text-[12.5px] text-rose-900 font-medium whitespace-pre-wrap leading-relaxed font-sans line-through">
            {segment.before}
          </pre>
        </div>
        <div className="px-4 py-2.5 bg-emerald-50/60">
          {segment.label && (
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">
              {segment.label}
            </p>
          )}
          <pre className="text-[12.5px] text-emerald-900 font-medium whitespace-pre-wrap leading-relaxed font-sans">
            {segment.after}
          </pre>
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 py-2.5">
      <pre className="text-[12.5px] text-zinc-600 font-medium whitespace-pre-wrap leading-relaxed font-sans">
        {segment.text}
      </pre>
    </div>
  );
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
    } else if (jsonOf(old) !== jsonOf(item)) {
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
