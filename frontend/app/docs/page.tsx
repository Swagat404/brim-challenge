"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  ListChecks,
  Receipt,
  MessageSquare,
  FileText,
  Settings2,
  GitCompare,
  Zap,
  Database,
  Code,
} from "lucide-react";

/**
 * /docs — single-page product docs.
 *
 * Layout mirrors TensorStax / Stripe / Linear docs:
 *   left rail   — sticky section nav grouped by area
 *   center      — long scrolling content with anchor IDs
 *   right rail  — "On this page" jump-to within the current section
 *
 * Built as one route with anchor IDs because a multi-route docs site is
 * overkill for this product. The sidebar is structural, not navigational.
 */

type NavSection = {
  group: string;
  items: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
};

const NAV: NavSection[] = [
  {
    group: "Get started",
    items: [
      { id: "overview", label: "Overview", icon: Sparkles },
      { id: "persona", label: "Who Sift is for", icon: ShieldCheck },
      { id: "tour", label: "5-minute tour", icon: ArrowRight },
    ],
  },
  {
    group: "Core workflows",
    items: [
      { id: "approvals", label: "Approvals", icon: ListChecks },
      { id: "ocr", label: "Receipt OCR", icon: Receipt },
      { id: "transactions", label: "Transactions", icon: Database },
      { id: "violations", label: "Violations", icon: ShieldCheck },
      { id: "reports", label: "Expense reports", icon: FileText },
    ],
  },
  {
    group: "The policy agent",
    items: [
      { id: "policy", label: "Policy editor", icon: Settings2 },
      { id: "policy-chat", label: "Chat-driven edits", icon: MessageSquare },
      { id: "policy-diff", label: "Inline diffs", icon: GitCompare },
    ],
  },
  {
    group: "Talk to your data",
    items: [
      { id: "ask-sift", label: "Ask Sift", icon: MessageSquare },
    ],
  },
  {
    group: "Under the hood",
    items: [
      { id: "architecture", label: "Architecture", icon: Code },
      { id: "agents", label: "AI agents & tools", icon: Zap },
      { id: "setup", label: "Run locally", icon: Database },
    ],
  },
];

export default function DocsPage() {
  const [active, setActive] = useState<string>("overview");

  // Scroll-spy: pick the section whose top is closest to the viewport top.
  useEffect(() => {
    const ids = NAV.flatMap((g) => g.items.map((i) => i.id));
    const onScroll = () => {
      let best = ids[0];
      let bestDist = Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        const dist = Math.abs(top - 120);
        if (top < 200 && dist < bestDist) {
          best = id;
          bestDist = dist;
        }
      }
      setActive(best);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-white text-zinc-900 overflow-hidden font-sans">
      {/* Top bar */}
      <header className="h-14 border-b border-zinc-200 flex items-center justify-between px-6 bg-white/95 backdrop-blur z-20 relative">
        <Link href="/welcome" className="flex items-center gap-2 group">
          <Image
            src="/sift-logo.png"
            alt="Sift"
            width={28}
            height={28}
            className="w-7 h-7 object-contain"
          />
          <span className="font-bold text-[15px] tracking-tight">sift</span>
          <span className="text-[12px] font-semibold text-zinc-400 ml-1 mt-0.5">docs</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/welcome"
            className="hidden sm:flex items-center gap-1.5 text-[13px] font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Welcome
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-black text-white text-[12.5px] font-bold transition-colors"
          >
            Open Sift
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      <div className="flex h-[calc(100%-3.5rem)] overflow-hidden">
        {/* Left nav */}
        <aside className="w-[260px] flex-shrink-0 border-r border-zinc-200 overflow-y-auto py-6 px-4 hidden md:block">
          {NAV.map((sec) => (
            <div key={sec.group} className="mb-6">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-400 px-3 mb-2">
                {sec.group}
              </p>
              <ul className="space-y-0.5">
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.id;
                  return (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                          isActive
                            ? "bg-zinc-900 text-white"
                            : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-zinc-400"}`} />
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* Center content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[820px] mx-auto px-8 lg:px-14 py-12 prose-docs">
            <Section
              id="overview"
              eyebrow="Get started"
              title="What is Sift?"
            >
              <p>
                Sift is the finance team&apos;s AI co-pilot for expense
                management. Built on the BRIM Financial fleet operations
                dataset — 50 employees, 4,400 card transactions across six
                months — it reviews every charge against your written policy,
                drafts pre-approval recommendations with reasoning, lets you
                ask questions about your spend in plain English, and groups
                related transactions into approval-ready expense reports.
              </p>
              <p>
                Inspired by Ramp&apos;s Policy Agent, Sift goes further: the
                agent doesn&apos;t just enforce policy — it surfaces gaps in
                your policy, drafts the fix, and lets you accept it with one
                click.
              </p>
              <Figure src="/docs/shot8.png" alt="Sift welcome page" caption="The product splash — four verbs that map to four capabilities." priority />
            </Section>

            <Section id="persona" eyebrow="Get started" title="Who Sift is for">
              <p>
                Sift is a <strong>finance-team product</strong>, not an
                employee app. The logged-in user is{" "}
                <strong>Avery Chen, Finance Manager at Brim Financial</strong>.
                Employees never log in — they submit receipts upstream in the
                corporate-card app. Sift is what Avery opens to{" "}
                <em>review</em> what came in.
              </p>
              <Callout title="Why this matters">
                Every page is from the approver&apos;s seat. There is no
                &quot;submit my expense&quot; flow because the manager is not
                the submitter. The Approvals queue is her inbox; Transactions
                is the read-mostly ledger; Reports are bundles she signs off
                on for accounting handoff.
              </Callout>
            </Section>

            <Section id="tour" eyebrow="Get started" title="5-minute tour">
              <p>
                Walking through Sift in five steps shows the full loop —
                review, reason, govern.
              </p>
              <ol>
                <li>
                  <strong>Open the dashboard.</strong> 4,400 transactions
                  filtered down to <strong>5 pending approvals</strong>. The
                  AI did the filtering.
                </li>
                <li>
                  <strong>Open one approval.</strong> See the AI&apos;s
                  three-state recommendation (approve / review / reject)
                  with a citation back to the exact policy clause.
                </li>
                <li>
                  <strong>Upload a receipt.</strong> Claude Vision extracts
                  structured fields and the agent re-reasons in real time.
                </li>
                <li>
                  <strong>Ask Sift a question.</strong> &quot;What did
                  Operations spend on fuel last quarter?&quot; — get a chart
                  and a summary.
                </li>
                <li>
                  <strong>Edit the policy via chat.</strong> The agent
                  drafts a structured edit; you accept or reject the inline
                  diff.
                </li>
              </ol>
              <Figure src="/docs/shot1.png" alt="Sift dashboard" caption="Dashboard — total spend, department breakdown, 90-day trend, and the inbox count." />
            </Section>

            <Section
              id="approvals"
              eyebrow="Core workflows"
              title="Approvals — the inbox"
            >
              <p>
                Approvals is the daily-driver inbox. Out of thousands of card
                charges, Sift surfaces only the ones that need a human
                decision. Each row shows the AI&apos;s recommendation, the
                employee&apos;s submission status (receipt, memo, attendees,
                business purpose), and the policy clause being cited.
              </p>
              <Figure src="/docs/shot3.png" alt="Approvals queue with detail panel" caption="Olivia Park's $1,972 SaaS Connect approval — Sift recommends approve with reasoning that ties together her prior conference history, Q2 budget remaining, and policy compliance." />
              <h3>What you see in the detail panel</h3>
              <ul>
                <li>
                  <strong>Pre-approval request</strong> — who, what, where,
                  how much.
                </li>
                <li>
                  <strong>Submission status badges</strong> — receipt /
                  memo / attendees / business purpose. Green = present,
                  amber = missing.
                </li>
                <li>
                  <strong>Sift Recommendation card</strong> — three-state
                  decision with full reasoning and a hover-citation back
                  to the policy.
                </li>
                <li>
                  <strong>Approve / Reject</strong> — one click.
                </li>
              </ul>
              <Callout title="The hero metric">
                <strong>5 pending out of 4,400</strong> is the proof point.
                The AI auto-approved the in-policy lines, blocked the
                clearly-out-of-policy ones, and surfaced only the genuinely
                ambiguous transactions for human review.
              </Callout>
            </Section>

            <Section id="ocr" eyebrow="Core workflows" title="Receipt OCR + AI re-evaluation">
              <p>
                Drop a photo of a paper receipt onto an approval and{" "}
                <strong>Claude Vision</strong> extracts every line — merchant,
                address, date, line items, totals, payment method. The full
                OCR text is stored alongside the transaction.
              </p>
              <p>
                More importantly: the moment a receipt is attached, the
                policy agent re-reasons about the approval. New context
                produces a new recommendation. If the receipt&apos;s
                merchant or amount disagrees with the transaction on file,
                Sift will flip the recommendation to <code>review</code> and
                explain why.
              </p>
              <Callout title="A killer demo moment">
                Upload a receipt for $166 to a transaction recorded as $1,450
                and watch the AI catch the mismatch:{" "}
                <em>
                  &quot;The receipt presented is from Petro-Canada for $166.45,
                  but the transaction on file is $1,450 at Flying J — the
                  merchant name, location, and amount do not match.&quot;
                </em>{" "}
                That&apos;s context-aware reasoning, not pattern matching.
              </Callout>
            </Section>

            <Section
              id="transactions"
              eyebrow="Core workflows"
              title="Transactions — the ledger"
            >
              <p>
                Transactions is the company-wide read-mostly browse view. Use
                it to investigate any charge, fill in missing context for an
                employee, or audit historical activity. The AI&apos;s
                recommendation badges appear inline so the manager can scan
                quickly.
              </p>
              <Figure src="/docs/shot4.png" alt="Transactions page" caption="The full ledger. Approved, pending, and rejected transactions with AI-recommendation badges inline." />
              <Callout title="How this differs from Approvals">
                <strong>Approvals</strong> is the action queue (5 items,
                Approve/Reject buttons).
                <br />
                <strong>Transactions</strong> is the global ledger (all rows,
                browse-only). When a transaction is pending, the drawer
                links directly back to{" "}
                <Link href="/approvals" className="font-bold underline-offset-4 underline">
                  /approvals
                </Link>
                .
              </Callout>
            </Section>

            <Section id="violations" eyebrow="Core workflows" title="Violations — compliance scan">
              <p>
                The Violations page runs a deterministic policy scan plus
                AI-powered context enrichment over every transaction in the
                dataset. Severities (critical, high, medium, low) are derived
                from a combination of policy rules and pattern detection.
              </p>
              <Figure
                src="/docs/shot5.png"
                alt="Violations dashboard with severity counts"
                caption="Compliance scan: 4 critical, 43 high, 49 medium violations across 96 total. Grouped by violation type with top-offender ranking on the right."
              />
              <h3>The kind of patterns Sift catches</h3>
              <p>
                The most powerful violation type is <strong>split
                transactions</strong> — multiple charges at the same merchant
                on the same day that sum above an approval threshold. This is
                exactly the BRIM brief example: <em>&quot;Flag an employee
                splitting a $600 purchase into two $300 charges to duck a
                $500 approval threshold.&quot;</em>
              </p>
              <Figure
                src="/docs/shot6.png"
                alt="Split transaction violation example"
                caption="Kenji Watanabe's 5 charges of $26.25 at the same restaurant on the same day — flagged as a critical split-transaction violation."
              />
            </Section>

            <Section id="reports" eyebrow="Core workflows" title="Expense reports — bundle sign-off">
              <p>
                Sift bundles related transactions automatically — a trip, a
                project, a quarter for an employee — into expense reports
                ready for the manager&apos;s sign-off. Per the BRIM brief:{" "}
                <em>&quot;ready for the CFO to approve alongside the expense
                policy recommendations.&quot;</em>
              </p>
              <Figure
                src="/docs/shot7.png"
                alt="Expense report detail with category breakdown and policy summary"
                caption="Olivia Park's January report — $3,274.61 across 7 transactions, with a category breakdown chart and policy summary calling out lines that need attention."
              />
              <h3>Three terminal actions</h3>
              <ul>
                <li>
                  <strong>Approve</strong> — sign off on the bundle for
                  accounting handoff.
                </li>
                <li>
                  <strong>Reject</strong> — kick the bundle back; the AI can
                  regenerate or the manager can ask for missing fields.
                </li>
                <li>
                  <strong>Export</strong> — download a CSV with one row per
                  transaction (report metadata, employee, period, merchant,
                  category, amount, policy flags). Pivots cleanly into
                  NetSuite or QuickBooks.
                </li>
              </ul>
              <Callout title="What &quot;Approve&quot; actually means">
                Reports aren&apos;t authorizing card charges (those already
                cleared). Approving a report is the CFO&apos;s seal — it
                acknowledges the AI&apos;s bundle and triggers the
                downstream accounting handoff.
              </Callout>
            </Section>

            <Section
              id="policy"
              eyebrow="The policy agent"
              title="Policy editor — three-pane control"
            >
              <p>
                The Policy editor is the most novel surface in Sift. It treats
                policy editing as a <strong>conversation between three
                things</strong>:
              </p>
              <ol>
                <li>
                  <strong>Suggestions panel (left)</strong> — Sift proactively
                  flags gaps, conflicts, and unintended manual-review patterns
                  in your policy.
                </li>
                <li>
                  <strong>Editor (center)</strong> — tabbed: Document,
                  Thresholds & Limits, Auto-approval rules, Submission
                  requirements, Department budgets, Employee budgets, Source
                  PDF.
                </li>
                <li>
                  <strong>Chat assistant (right)</strong> — drafts edits,
                  audits disagreements, simulates changes, generates
                  suggestions.
                </li>
              </ol>
              <Figure
                src="/docs/shot9.png"
                alt="Policy editor with suggestions, document body, inline diff, and chat assistant"
                caption="Three panes in conversation. The chat proposed a receipt-threshold change; the editor renders the diff inline (green = added, red = removed) with Accept / Reject buttons."
              />
            </Section>

            <Section
              id="policy-chat"
              eyebrow="The policy agent"
              title="Chat-driven policy edits"
            >
              <p>
                Type a policy change in plain English and the agent drafts a
                structured edit. Examples:
              </p>
              <pre className="bg-zinc-50 border border-zinc-200 rounded-[12px] px-4 py-3 text-[13px] font-mono text-zinc-800 leading-relaxed whitespace-pre-wrap">
{`Change the receipt threshold to $60.

Add a $200 per-person cap on customer entertainment.

Tighten the alcohol rule to require a guest list.

Help me draft a remote work expenses section with a $500
equipment cap and $75/month internet stipend.`}
              </pre>
              <p>
                The agent identifies the canonical structured field that owns
                the change, updates any tightly-coupled mirrors (e.g. the
                <code> submission_requirements</code> entry that mirrors a
                threshold), and surfaces the proposed edit as an inline diff
                in the editor. You accept or reject — there&apos;s no auto-
                apply without explicit consent.
              </p>
              <Callout title="When the agent asks vs. acts">
                Sift only asks a clarifying question when the request is
                genuinely ambiguous (e.g. &quot;raise the threshold to
                $100&quot; without saying which threshold). Otherwise it
                acts on safe defaults and tells you what it intentionally
                left alone.
              </Callout>
            </Section>

            <Section
              id="policy-diff"
              eyebrow="The policy agent"
              title="Inline diffs with word-level highlighting"
            >
              <p>
                Edits surface as inline diffs scoped to the affected fields.
                Section bodies use <strong>word-level diffs</strong> so a
                single &quot;$50 → $60&quot; change inside a 200-word
                paragraph highlights only the changed digits — no wall of red
                strikethrough.
              </p>
              <p>
                Top-level dicts (thresholds, restrictions, role caps)
                deep-merge — patching one threshold leaves all the others
                untouched. Arrays of policy items (sections, submission
                requirements, auto-approval rules) merge by <code>id</code>
                — patching one section preserves all the others.
              </p>
              <Callout title="Accept / Reject is the confirmation step">
                The agent does not verbally re-confirm before proposing.
                You see the diff in the editor and decide. The diff
                visualization is the proof of trust — there&apos;s no
                black box.
              </Callout>
            </Section>

            <Section
              id="ask-sift"
              eyebrow="Talk to your data"
              title="Ask Sift — natural language analytics"
            >
              <p>
                Ask Sift converts English questions into structured SQL over
                the transaction warehouse, runs them, and answers in prose
                with charts when relevant. The agent maintains conversation
                state across follow-ups — ask &quot;what did Operations spend
                on fuel?&quot; then &quot;how does that compare to
                maintenance?&quot; without re-stating context.
              </p>
              <Figure
                src="/docs/shot2.png"
                alt="Ask Sift answering a violations question with a ranked employee table"
                caption="Plain English in, structured table out. Note how the agent breaks down the answer by severity and lists violation types per employee."
              />
              <h3>What Sift handles well</h3>
              <ul>
                <li>Aggregations across departments, time periods, employees, categories.</li>
                <li>Comparisons (&quot;X vs Y&quot;, &quot;over time&quot;).</li>
                <li>Charts (bar, line, pie) auto-generated when appropriate.</li>
                <li>Multi-step reasoning (&quot;first find X, then check Y&quot;).</li>
                <li>Conversation memory within a session.</li>
              </ul>
            </Section>

            <Section
              id="architecture"
              eyebrow="Under the hood"
              title="Architecture"
            >
              <p>
                Sift is a Next.js + FastAPI app backed by SQLite, with
                Anthropic Claude as the reasoning layer.
              </p>
              <ul>
                <li>
                  <strong>Frontend</strong> — Next.js 16 (App Router) +
                  Tailwind 4 + shadcn/ui primitives + recharts. Real-time
                  streaming via SSE for the chat surfaces.
                </li>
                <li>
                  <strong>Backend</strong> — FastAPI with persona-based
                  agent routing (analytics persona for Ask Sift, policy
                  editor persona for the Policy chat).
                </li>
                <li>
                  <strong>Data</strong> — SQLite (~4,400 transactions over
                  6 months). Schema includes approvals, transactions,
                  submissions, activity events, structured policy
                  documents, suggestions, department + employee budgets.
                </li>
                <li>
                  <strong>AI</strong> — Anthropic Claude Sonnet for
                  reasoning, Claude Vision for receipt OCR.
                </li>
              </ul>
            </Section>

            <Section
              id="agents"
              eyebrow="Under the hood"
              title="AI agents and tools"
            >
              <p>
                Two distinct agent personas share the same{" "}
                <code>ExpenseAgent</code> framework but get different system
                prompts and tool access:
              </p>
              <ul>
                <li>
                  <strong>analytics</strong> — Ask Sift. Tools:
                  <code> query_transactions</code>,{" "}
                  <code>run_sql_query</code>,{" "}
                  <code>check_policy_compliance</code>,{" "}
                  <code>get_approval_recommendation</code>,{" "}
                  <code>manage_expense_reports</code>.
                </li>
                <li>
                  <strong>policy_editor</strong> — Policy chat assistant.
                  Tools:{" "}
                  <code>manage_policy_document</code>,{" "}
                  <code>manage_policy_suggestions</code>,{" "}
                  <code>check_policy_compliance</code>.
                </li>
              </ul>
              <p>
                Tool calls in a single turn execute in parallel via{" "}
                <code>asyncio.gather</code>. The chat surfaces stream tokens
                via SSE. Tool progress is shown as discrete &quot;Pulling
                spend data…&quot; breadcrumbs in the UI, not injected into
                the response body.
              </p>
            </Section>

            <Section id="setup" eyebrow="Under the hood" title="Run locally">
              <h3>Backend</h3>
              <pre className="bg-zinc-50 border border-zinc-200 rounded-[12px] px-4 py-3 text-[13px] font-mono text-zinc-800 leading-relaxed whitespace-pre-wrap">
{`cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# add your key to backend/.env
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

uvicorn api.main:app --reload --port 8000`}
              </pre>

              <h3>Frontend</h3>
              <pre className="bg-zinc-50 border border-zinc-200 rounded-[12px] px-4 py-3 text-[13px] font-mono text-zinc-800 leading-relaxed whitespace-pre-wrap">
{`cd frontend
npm install
npm run dev   # runs on :3000`}
              </pre>

              <h3>Pre-seeded demo data</h3>
              <p>
                The repo ships with <code>brim_expenses.db</code> already
                seeded — 50 employees, 4,400 transactions, 5 narrative pending
                approvals, 96 violations across 4 severity levels, 4
                AI-grouped expense reports, and a structured policy bootstrapped
                from the original Brim PDF.
              </p>

              <Callout title="What to open first">
                <Link href="/welcome" className="font-bold underline-offset-4 underline">
                  /welcome
                </Link>{" "}
                — the splash. Then{" "}
                <Link href="/" className="font-bold underline-offset-4 underline">
                  /
                </Link>{" "}
                — the dashboard. Pending decisions live at{" "}
                <Link href="/approvals" className="font-bold underline-offset-4 underline">
                  /approvals
                </Link>
                ; the policy agent lives at{" "}
                <Link href="/policy" className="font-bold underline-offset-4 underline">
                  /policy
                </Link>
                .
              </Callout>
            </Section>

            <div className="mt-16 mb-8 pt-8 border-t border-zinc-200 flex items-center justify-between">
              <Link
                href="/welcome"
                className="text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to welcome
              </Link>
              <Link
                href="/"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-900 hover:bg-black text-white text-[13px] font-bold transition-colors"
              >
                Try Sift
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </main>

        {/* Right "On this page" */}
        <aside className="w-[200px] flex-shrink-0 overflow-y-auto py-8 pr-6 hidden xl:block">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-400 mb-3">
            On this page
          </p>
          <ul className="space-y-1.5">
            {NAV.flatMap((g) => g.items).map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`block text-[12px] font-medium transition-colors py-0.5 border-l-2 pl-3 ${
                    active === item.id
                      ? "text-zinc-900 border-zinc-900"
                      : "text-zinc-400 hover:text-zinc-700 border-transparent"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

// ── Small content primitives ───────────────────────────────────────────────

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 mb-16">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-zinc-400 mb-2">
        {eyebrow}
      </p>
      <h2 className="text-[28px] font-bold tracking-tight text-zinc-900 leading-tight mb-5">
        {title}
      </h2>
      <div className="text-[14.5px] text-zinc-700 leading-[1.7] font-medium">
        {children}
      </div>
    </section>
  );
}

function Callout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="my-5 bg-zinc-50 border border-zinc-200 rounded-[14px] px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-1.5">
        {title}
      </p>
      <div className="text-[13.5px] text-zinc-700 leading-relaxed font-medium">
        {children}
      </div>
    </div>
  );
}

function Figure({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: string;
  alt: string;
  caption: string;
  priority?: boolean;
}) {
  return (
    <figure className="my-7">
      <div className="rounded-[16px] overflow-hidden border border-zinc-200 shadow-sm bg-zinc-100">
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          priority={priority}
          className="w-full h-auto block"
        />
      </div>
      <figcaption className="text-[12.5px] text-zinc-500 mt-2.5 leading-relaxed font-medium">
        {caption}
      </figcaption>
    </figure>
  );
}
