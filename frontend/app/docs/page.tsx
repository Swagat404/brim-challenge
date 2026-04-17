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
  Activity,
  Lightbulb,
  Lock,
  Wallet,
} from "lucide-react";

/** /docs — single-page user guide. */

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
    group: "Talk to your data",
    items: [
      { id: "ask-sift", label: "Ask Sift", icon: MessageSquare },
    ],
  },
  {
    group: "The policy agent",
    items: [
      { id: "agent-overview", label: "How it evaluates", icon: Sparkles },
      { id: "agent-recs", label: "Three recommendations", icon: GitCompare },
      { id: "activity", label: "Activity feed & audit", icon: Activity },
    ],
  },
  {
    group: "Editing the policy",
    items: [
      { id: "policy", label: "Inside the policy editor", icon: Settings2 },
      { id: "policy-chat", label: "Drafting changes by chatting", icon: MessageSquare },
      { id: "auto-approval", label: "Auto-approval rules", icon: Zap },
      { id: "submissions", label: "Submission requirements", icon: Receipt },
      { id: "budgets", label: "Department & employee budgets", icon: Wallet },
      { id: "hidden-notes", label: "Hidden notes", icon: Lock },
    ],
  },
  {
    group: "Policy suggestions",
    items: [
      { id: "suggestions", label: "What Sift surfaces", icon: Lightbulb },
    ],
  },
];

export default function DocsPage() {
  const [active, setActive] = useState<string>("overview");

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
        <Link href="/" className="flex items-center gap-2 group">
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
            href="/"
            className="hidden sm:flex items-center gap-1.5 text-[13px] font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Welcome
          </Link>
          <Link
            href="/dashboard"
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
          <div className="max-w-[820px] mx-auto px-8 lg:px-14 py-12">

            {/* ─────────── GET STARTED ─────────── */}

            <Section id="overview" eyebrow="Get started" title="What is Sift?">
              <YouTubeEmbed
                videoId="lHxs2WK6z0A"
                caption="Quick tour: Sift in action — policy-aware recommendations, dashboard, and workflows."
              />
              <p>
                Sift is the finance team&apos;s AI co-pilot for expense
                management. It applies your written expense policy to
                every card transaction and produces a three-state
                recommendation — <em>Approval recommended</em>,{" "}
                <em>Requires review</em>, or <em>Rejection recommended</em>{" "}
                — that the approver acts on.
              </p>
              <p>
                The dashboard surfaces what needs attention: a small
                inbox of pending approvals filtered out of thousands of
                transactions, your policy violations ranked by severity,
                expense reports waiting for sign-off, and where your
                spend is going across the company.
              </p>
              <Figure
                src="/docs/shot1.png"
                alt="Sift dashboard showing total spend, department breakdown, 90-day trend, and pending approvals count"
                caption="The dashboard. Total spend, department split, 90-day trend, and the inbox count are all one glance away."
                priority
              />
              <p>
                Beyond reviewing transactions, the agent surfaces gaps
                in the policy itself, drafts the fix in conversation,
                and lets you accept structured edits with one click.
                Sift closes the loop from enforcement to authorship.
              </p>
            </Section>

            <Section id="persona" eyebrow="Get started" title="Who Sift is for">
              <p>
                Sift is a <strong>finance-team product</strong>, not an
                employee app. The user is the approver — finance manager,
                controller, CFO. Employees never log in to Sift; they
                submit receipts in the corporate-card app upstream. Sift is
                what the approver opens to <em>review</em> what came in.
              </p>
              <Callout title="Why this matters">
                Every page is from the approver&apos;s seat. There is no
                &quot;submit my expense&quot; flow because the user is not
                the submitter. Approvals is the inbox; Transactions is the
                read-mostly ledger; Reports are AI-grouped bundles ready
                for sign-off and accounting handoff.
              </Callout>
            </Section>

            {/* ─────────── CORE WORKFLOWS ─────────── */}

            <Section id="approvals" eyebrow="Core workflows" title="Approvals — the inbox">
              <p>
                Approvals is the daily-driver inbox. Out of thousands of card
                charges, Sift surfaces only the ones that need a human
                decision. Each row shows the AI&apos;s recommendation, the
                employee&apos;s submission status (receipt, memo, attendees,
                business purpose), and the policy clause being cited.
              </p>
              <Figure
                src="/docs/shot3.png"
                alt="Approvals queue with detail panel"
                caption="Olivia Park's $1,972 SaaS Connect approval — Sift recommends approve with reasoning that ties together her prior conference history, Q2 budget remaining, and policy compliance."
              />
              <h3>What you see in the detail panel</h3>

              <p>
                <strong>Submission status badges</strong> — receipt, memo,
                attendees, business purpose. Green checkmarks mean the
                employee submitted the field; amber means it&apos;s
                outstanding.
              </p>
              <Figure
                src="/docs/submission-badges.png"
                alt="Four green submission badges: Receipt, Memo, Attendees, Purpose"
                caption="The submission completeness strip at the top of every approval."
                maxWidth={520}
              />

              <p>
                <strong>Sift Recommendation</strong> — the three-state
                decision with full reasoning and a hover (i) icon that
                pulls up the exact policy clause Sift cited.
              </p>
              <Figure
                src="/docs/ai-rec-card.png"
                alt="Sift Recommendation card showing 'Approval recommended' with reasoning"
                caption="The recommendation card. Click the (i) to see the policy citation."
              />

              <p>
                <strong>Approve / Reject</strong> — one click. The decision
                is logged in the activity trail with timestamp and actor.
              </p>
              <Callout title="The hero metric">
                Most card transactions never need a human. Sift
                auto-approves the clearly in-policy lines, blocks the
                clearly out-of-policy ones (blocked-MCC merchants, hard
                threshold violations), and surfaces only the genuinely
                ambiguous transactions for review. The inbox stays small
                even when the underlying spend volume is large.
              </Callout>
            </Section>

            <Section id="ocr" eyebrow="Core workflows" title="Receipt OCR + AI re-evaluation">
              <p>
                Drop a photo of a paper receipt onto any approval and
                Sift extracts the merchant, address, date, line items,
                totals, and payment method automatically. PNG and JPEG
                are supported.
              </p>
              <Figure
                src="/docs/receipt-widget.png"
                alt="Receipt slot in an approval showing a thumbnail of a Petro-Canada paper receipt and the extracted OCR text expanded below"
                caption="A Petro-Canada fuel receipt attached to an approval. Click the chevron to expand the extracted text — every line of the original is captured verbatim and re-runs the recommendation."
              />
              <p>
                The moment a receipt is attached, the agent re-reasons
                about the approval. New context produces a new
                recommendation. If the receipt&apos;s merchant or amount
                disagrees with the transaction on file, the agent flips
                the recommendation to <em>Requires review</em> and
                explains why.
              </p>
              <Callout title="Sift catches mismatches">
                Upload a $166 fuel receipt to a $1,450 transaction and
                the agent calls it out: <em>&quot;The receipt is from
                Petro-Canada for $166.45, but the transaction is for
                $1,450 at Flying J — merchant, location, and amount
                don&apos;t match.&quot;</em>{" "}
                That&apos;s context-aware reasoning, not template
                matching.
              </Callout>
            </Section>

            <Section id="transactions" eyebrow="Core workflows" title="Transactions — the ledger">
              <p>
                Transactions is the company-wide read-mostly browse view. Use
                it to investigate any charge, fill in missing context for an
                employee, or audit historical activity. The AI&apos;s
                recommendation badges appear inline so the manager can scan
                quickly.
              </p>
              <Figure
                src="/docs/shot4.png"
                alt="Transactions page"
                caption="The full ledger. Approved, pending, and rejected transactions with AI-recommendation badges inline."
              />
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
              <h3>The patterns Sift detects</h3>
              <ul>
                <li>
                  <strong>High meal / dining charge</strong> — meals over
                  the per-person threshold without documented attendees.
                </li>
                <li>
                  <strong>Personal expense on corporate card</strong> —
                  charges at categories blocked by policy MCC rules.
                </li>
                <li>
                  <strong>Luxury hotel charge</strong> — accommodation over
                  the policy nightly cap.
                </li>
                <li>
                  <strong>Duplicate charge</strong> — same merchant + same
                  amount within a short window.
                </li>
                <li>
                  <strong>Split transaction</strong> — multiple charges
                  at the same merchant on the same day that sum above
                  an approval threshold. Catches the classic pattern of
                  splitting one $600 purchase into two $300 charges to
                  duck a $500 ceiling.
                </li>
                <li>
                  <strong>Alcohol without business context</strong> — bar
                  charges where attendees and business purpose are missing.
                </li>
              </ul>
              <Figure
                src="/docs/shot6.png"
                alt="Split transaction violation example"
                caption="Kenji Watanabe's 5 charges of $26.25 at the same restaurant on the same day — flagged as a critical split-transaction violation."
              />
            </Section>

            <Section id="reports" eyebrow="Core workflows" title="Expense reports — bundle sign-off">
              <p>
                Sift bundles related transactions automatically — a trip,
                a project, a quarter for an employee — into expense
                reports ready for the approver&apos;s sign-off. Each
                report shows the AI&apos;s policy review inline so the
                CFO can sign off on the whole bundle without re-reviewing
                each line.
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
                  <strong>Reject</strong> — kick the bundle back; the AI
                  can regenerate or the manager can ask for missing fields.
                </li>
                <li>
                  <strong>Export</strong> — download a CSV with one row per
                  transaction (report metadata, employee, period, merchant,
                  category, amount, policy flags). Pivots cleanly into
                  NetSuite or QuickBooks.
                </li>
              </ul>
              <Callout title="What &quot;Approve&quot; actually means">
                Reports aren&apos;t authorizing card charges — those already
                cleared. Approving a report is the CFO&apos;s seal: it
                acknowledges the AI&apos;s bundle and triggers the
                downstream accounting handoff.
              </Callout>
            </Section>

            {/* ─────────── ASK SIFT ─────────── */}

            <Section id="ask-sift" eyebrow="Talk to your data" title="Ask Sift — natural language analytics">
              <p>
                Ask Sift converts English questions into structured
                queries over your transaction data, runs them, and
                answers in prose with charts when relevant. The agent
                maintains conversation state across follow-ups — ask{" "}
                <em>&quot;what did Operations spend on fuel?&quot;</em>{" "}
                then{" "}
                <em>&quot;how does that compare to maintenance?&quot;</em>{" "}
                without re-stating context.
              </p>
              <Video
                src="/docs/ask-sift-demo.mp4"
                caption="Ask Sift in action — type a question, watch the agent reason, get a chart and a written answer back. Real-time streaming, no fixed report templates."
              />
              <Figure
                src="/docs/shot2.png"
                alt="Ask Sift answering a violations question with a ranked employee table"
                caption="Plain English in, structured table out. The agent breaks down the answer by severity and lists violation types per employee."
              />
              <h3>What Sift handles well</h3>
              <ul>
                <li>Aggregations across departments, periods, employees, and categories.</li>
                <li>Comparisons — X vs Y, over time, top N.</li>
                <li>Charts auto-generated when the question calls for one.</li>
                <li>Multi-step reasoning — find X, then check Y.</li>
                <li>Conversation memory within a session.</li>
              </ul>
              <Callout title="Where to find it">
                Ask Sift lives in the left sidebar. Sessions persist
                across page reloads — your chat history is still there
                when you come back tomorrow. Click{" "}
                <strong>+ New chat</strong> to start fresh.
              </Callout>
            </Section>

            {/* ─────────── THE POLICY AGENT ─────────── */}

            <Section id="agent-overview" eyebrow="The policy agent" title="How the agent evaluates expenses">
              <p>
                Sift&apos;s policy agent evaluates each transaction using
                multiple data sources, then produces a three-state
                recommendation with a citation back to the exact policy
                text it relied on:
              </p>
              <ul>
                <li>
                  <strong>The structured policy</strong> — the
                  agent-facing policy document (sections, thresholds,
                  restrictions, submission requirements, auto-approval
                  rules, role-based caps, hidden notes).
                </li>
                <li>
                  <strong>Merchant and transaction data</strong> —
                  merchant name, MCC, amount, date/time, currency,
                  debit/credit flag.
                </li>
                <li>
                  <strong>Employee inputs</strong> — receipt OCR text,
                  memo, business purpose, attendees, GL code.
                </li>
                <li>
                  <strong>Employee context</strong> — department, role,
                  spend history, monthly budget remaining.
                </li>
              </ul>
              <p>
                Every recommendation is grounded in the policy itself
                and links back to the exact clause it relied on. Hover
                the (i) icon next to any recommendation to see the
                policy text Sift cited.
              </p>
            </Section>

            <Section id="agent-recs" eyebrow="The policy agent" title="Three recommendation types + the conservative lean">
              <p>
                Sift produces one of three recommendations per
                transaction:
              </p>
              <ul>
                <li>
                  <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-bold mr-1">
                    Approval recommended
                  </span>{" "}
                  — clearly complies with policy.
                </li>
                <li>
                  <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[12px] font-bold mr-1">
                    Requires review
                  </span>{" "}
                  — uncertain, missing context, or the policy explicitly
                  needs human review.
                </li>
                <li>
                  <span className="inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[12px] font-bold mr-1">
                    Rejection recommended
                  </span>{" "}
                  — clear policy violation.
                </li>
              </ul>
              <Callout title="Sift leans conservative">
                When policy language is ambiguous or transaction context is
                missing, the agent does <em>not</em> guess — it returns{" "}
                <em>Requires review</em> and explains what&apos;s missing.
                Decisions are escalated to a human rather than risking an
                incorrect auto-approval. Write specific policy language
                with explicit dollar limits to get more confident decisions.
              </Callout>
            </Section>

            <Section id="activity" eyebrow="The policy agent" title="Activity feed & audit trail">
              <p>
                Every consequential event is recorded and surfaced in
                the activity feed inside each approval drawer. The feed
                shows what the agent did, what reviewers did, and what
                changed in the policy:
              </p>
              <ul>
                <li>Agent recommendations, with the reasoning and the policy clause cited.</li>
                <li>Auto-approvals when a rule matched without escalation.</li>
                <li>Policy violations that the compliance scan detected.</li>
                <li>Manager decisions — every Approve or Reject.</li>
                <li>Policy edits — who changed what, and when.</li>
                <li>Suggestions accepted from the policy suggestions panel.</li>
                <li>New policy documents uploaded.</li>
              </ul>
              <p>
                Every entry has a timestamp and an actor, so the feed
                doubles as your audit trail. Reviewers, compliance, and
                external auditors can trace any decision back to the
                evidence that drove it.
              </p>
              <Figure
                src="/docs/activity-feed.png"
                alt="Activity feed showing six entries — multiple Sift recommendations and an Admin submission update — each with a timestamp"
                caption="A real activity stream from one approval. Each row shows what changed, who changed it, and when — including the agent re-reasoning after new context arrived."
              />
            </Section>

            {/* ─────────── EDITING THE POLICY ─────────── */}

            <Section id="policy" eyebrow="Editing the policy" title="Inside the policy editor">
              <p>
                The Policy editor brings together three things that
                normally live in different tools — what your policy says,
                where the agent sees gaps, and a conversation that lets
                you act on both.
              </p>
              <Figure
                src="/docs/policy-editor-full.png"
                alt="Policy editor showing the suggestions panel on the left, the policy body in the middle, and the assistant chat on the right"
                caption="Suggestions on the left, the policy itself in the middle, the assistant on the right — all visible at once."
              />

              <h3>The middle is your policy</h3>
              <p>
                Tabs across the top let you focus on whichever part of
                the policy you&apos;re editing — the prose document,
                hard dollar thresholds, auto-approval rules, what
                employees must submit per transaction type, department
                and employee budgets, and the source PDF you originally
                uploaded.
              </p>

              <h3>The left rail is what Sift wants to ask you</h3>
              <p>
                Suggestion cards surface gaps and conflicts the agent
                noticed. Each one has a one-click Apply or Dismiss.
              </p>
              <Figure
                src="/docs/suggestion-card.png"
                alt="Single suggestion card titled 'Reasonable parking and entertainment undefined' with Apply and Dismiss buttons"
                caption="A single suggestion card. Reads like a question Sift would ask if it could talk."
                maxWidth={360}
              />

              <h3>The right rail is the assistant</h3>
              <p>
                A chat surface for drafting edits, generating more
                suggestions, finding recurring violations, and asking
                what would change if you ran a policy update against
                recent transactions. Resizable — drag the handle on its
                left edge.
              </p>
            </Section>

            <Section id="policy-chat" eyebrow="Editing the policy" title="Drafting changes by chatting">
              <p>
                Type a policy change in plain English. The assistant
                drafts the edit, keeps related rules in sync, and shows
                you exactly what would change before anything is saved.
                Accept or reject — there&apos;s no auto-apply.
              </p>

              <h3>Things you can say</h3>
              <pre className="bg-zinc-50 border border-zinc-200 rounded-[12px] px-4 py-3 text-[13px] font-mono text-zinc-800 leading-relaxed whitespace-pre-wrap">
{`Change the receipt threshold to $60.

Add a $200 per-person cap on customer entertainment.

Tighten the alcohol rule to require a guest list.

Help me draft a remote work expenses section with a
$500 equipment cap and $75/month internet stipend.`}
              </pre>

              <h3>The diff before you save</h3>
              <p>
                Every proposal renders as an inline diff in the editor.
                Inside a paragraph, only the changed words are
                highlighted — a single &quot;$50 → $60&quot; change does
                not nuke the whole sentence in red. Across the policy,
                only the fields you touched appear in the diff. Every
                other rule stays visible and intact.
              </p>
              <Figure
                src="/docs/shot9.png"
                alt="Policy editor showing the assistant's proposed edit banner and an inline diff with green and red highlighting"
                caption="The assistant proposed a receipt-threshold change. The diff appears inline in the editor with Accept & save / Reject buttons."
              />

              <Callout title="When the assistant asks vs. acts">
                Sift only asks a clarifying question when the request is
                genuinely ambiguous (e.g. &quot;raise the threshold to
                $100&quot; without saying which threshold). Otherwise it
                proposes the safe-default edit and tells you what it
                intentionally left alone.
              </Callout>
            </Section>

            <Section id="auto-approval" eyebrow="Editing the policy" title="Auto-approval rules">
              <p>
                Auto-approval rules let you decide which transactions
                Sift can approve on its own, without escalating to you.
                Each rule combines conditions across:
              </p>
              <ul>
                <li>
                  <strong>Amount</strong> — dollar caps, e.g. anything
                  under $50.
                </li>
                <li>
                  <strong>Merchant category</strong> — allow-lists for
                  low-risk categories like fuel, parking, or office
                  supplies.
                </li>
                <li>
                  <strong>Department or role</strong> — scoped to
                  specific teams or seniority levels.
                </li>
                <li>
                  <strong>Submission completeness</strong> — only
                  auto-approve when the receipt and memo are present.
                </li>
              </ul>
              <p>
                Rules are checked first. If a transaction qualifies, Sift
                approves it directly and logs it in the audit trail. If
                no rule matches, the transaction goes to the agent for
                contextual review.
              </p>
              <Figure
                src="/docs/auto-approval.png"
                alt="Auto-approval rules form showing the master toggle and a 'fleet-under-500' rule"
                caption="A real auto-approval rule. Fleet operations charges under $500 with the right MCC codes are approved without human review."
                maxWidth={520}
              />
            </Section>

            <Section id="submissions" eyebrow="Editing the policy" title="Submission requirements">
              <p>
                Submission requirements define what context an employee
                must provide for Sift to confidently evaluate a
                transaction. Each rule has:
              </p>
              <ul>
                <li>
                  <strong>A condition</strong> that fires the rule —
                  amount over a threshold, certain merchant categories,
                  or specific merchant patterns.
                </li>
                <li>
                  <strong>A list of required fields</strong> — receipt,
                  memo, attendees, business purpose, GL code.
                </li>
                <li>
                  <strong>A short rationale</strong> shown to both the
                  manager and the employee when the rule applies.
                </li>
              </ul>
              <p>
                When a rule applies but a required field is missing,
                Sift defaults to <em>Requires review</em> with a
                citation pointing at the rule. The submission status
                badges in the approval drawer show exactly which fields
                are still outstanding.
              </p>
              <Callout title="Dynamic attendee detection">
                A policy snippet like{" "}
                <em>&quot;Business entertainment meals with external
                guests must list attendee names and company
                affiliations&quot;</em>{" "}
                makes attendees a required field on those transactions.
                When the receipt clarifies it&apos;s a solo charge, Sift
                drops the requirement automatically.
              </Callout>
              <Figure
                src="/docs/submission-form.png"
                alt="Submission requirements form with three rules: receipt-over-threshold, supplier-entertainment, car-rental-parking-gasoline"
                caption="Each requirement names the trigger condition, the fields it requires, and a short rationale that's quoted back to the manager and employee when the rule fires."
              />
            </Section>

            <Section id="budgets" eyebrow="Editing the policy" title="Department & employee budgets">
              <p>
                Department and employee budgets are editable directly in
                the policy editor:
              </p>
              <ul>
                <li>
                  <strong>Department budgets</strong> — monthly spend
                  limits per department, with rolling-30-day utilization
                  shown alongside each row.
                </li>
                <li>
                  <strong>Employee budgets</strong> — per-person monthly
                  caps. Sift factors remaining budget into its
                  reasoning, e.g. <em>&quot;this conference
                  registration brings her monthly total to $3,576.90 —
                  within her $4,000 personal budget.&quot;</em>
                </li>
              </ul>
              <Figure
                src="/docs/dept-budgets.png"
                alt="Department monthly caps table showing 7 departments with their last-30-day spend"
                caption="The department budgets table. Sales has an $85,000 cap (1% used); the others run uncapped for now."
              />
            </Section>

            <Section id="hidden-notes" eyebrow="Editing the policy" title="Hidden notes">
              <p>
                Each section can carry <strong>hidden notes</strong>{" "}
                that Sift reads but the employee-facing policy does not
                include. Useful for sensitive exceptions —
                executive-only carve-outs, confidential ceiling
                adjustments — or admin-only context that helps the
                agent make better decisions without exposing it to
                employees.
              </p>
              <p>
                The editor marks hidden notes with a lock icon so their
                visibility scope is always obvious.
              </p>
              <Figure
                src="/docs/hidden-note.png"
                alt="Business Expenses section showing the public body text and a hidden note row marked with a lock icon"
                caption="The Business Expenses section with one hidden note. Employees never see the lock-marked row; the agent does."
              />
            </Section>

            {/* ─────────── POLICY SUGGESTIONS ─────────── */}

            <Section id="suggestions" eyebrow="Policy suggestions" title="What Sift surfaces">
              <p>
                Sift reviews your policy continuously and looks for
                places where clarification would improve enforcement.
                Suggestions appear in the left panel of the policy
                editor with a one-click Apply or Dismiss action. Four
                categories:
              </p>
              <ul>
                <li>
                  <strong>Needs more detail</strong> — vague terms like
                  &quot;reasonable&quot; without a dollar cap, or rules
                  that reference context the policy can&apos;t enforce.
                </li>
                <li>
                  <strong>Conflicting rules</strong> — two parts of the
                  policy contradict each other and could lead to
                  inconsistent outcomes.
                </li>
                <li>
                  <strong>Unintended manual reviews</strong> — language
                  that sends a high volume of transactions to{" "}
                  <em>Requires review</em> when it doesn&apos;t need to.
                </li>
                <li>
                  <strong>Missing coverage</strong> — common scenarios
                  the policy doesn&apos;t address, like remote work
                  expenses, gifts, or customer entertainment.
                </li>
              </ul>
              <p>
                Suggestions are informed by your policy text and recent
                spending patterns, so they refresh as your business
                changes. Accepting a suggestion uses the same diff
                preview as chat-driven edits — nothing is saved without
                your approval.
              </p>
            </Section>


            <div className="mt-16 mb-8 pt-8 border-t border-zinc-200 flex items-center justify-between">
              <Link
                href="/"
                className="text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to welcome
              </Link>
              <Link
                href="/dashboard"
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
    <section id={id} className="scroll-mt-20 mb-16 docs-prose">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-zinc-400 mb-2">
        {eyebrow}
      </p>
      <h2 className="text-[28px] font-bold tracking-tight text-zinc-900 leading-tight mb-5">
        {title}
      </h2>
      <div className="text-[14.5px] text-zinc-700 leading-[1.7] font-medium space-y-4">
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

function YouTubeEmbed({
  videoId,
  caption,
}: {
  videoId: string;
  caption: string;
}) {
  return (
    <figure className="my-7">
      <div className="relative w-full aspect-video rounded-[16px] overflow-hidden border border-zinc-200 shadow-sm bg-zinc-900">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?rel=0`}
          title="Sift product tour"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <figcaption className="text-[12.5px] text-zinc-500 mt-2.5 leading-relaxed font-medium">
        {caption}
      </figcaption>
    </figure>
  );
}

function Video({
  src,
  caption,
  poster,
}: {
  src: string;
  caption: string;
  poster?: string;
}) {
  return (
    <figure className="my-7">
      <div className="rounded-[16px] overflow-hidden border border-zinc-200 shadow-sm bg-zinc-900">
        <video
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          controls
          className="w-full h-auto block"
        />
      </div>
      <figcaption className="text-[12.5px] text-zinc-500 mt-2.5 leading-relaxed font-medium">
        {caption}
      </figcaption>
    </figure>
  );
}

function Figure({
  src,
  alt,
  caption,
  priority = false,
  maxWidth,
}: {
  src: string;
  alt: string;
  caption: string;
  priority?: boolean;
  /** Cap the rendered width (px) for portrait / narrow crops. */
  maxWidth?: number;
}) {
  const styleWrapper = maxWidth ? { maxWidth: `${maxWidth}px` } : undefined;
  return (
    <figure className="my-7" style={styleWrapper}>
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
