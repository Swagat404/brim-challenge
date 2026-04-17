# Sift — Demo Script

> **Audience:** BRIM Challenge judges
> **Runtime:** ~6 minutes (with a 3-minute fallback path)
> **Persona shown:** Avery Chen, Finance Manager at Brim Financial
> **The promise in one line:** *Sift is the finance manager's AI co-pilot — it reviews every transaction, drafts pre-approvals, and lets you talk to your spend in English.*

---

## Table of contents

- [The narrative arc](#the-narrative-arc)
- [Full 6-minute flow](#full-6-minute-flow)
  - [0:00 – 0:30 · Welcome + premise](#000--030--welcome--premise)
  - [0:30 – 1:30 · Act 1: The inbox](#030--130--act-1-the-inbox-the-daily-driver)
  - [1:30 – 2:30 · Act 2: OCR + AI re-evaluation](#130--230--act-2-the-ocr--re-evaluation-moment)
  - [2:30 – 3:30 · Act 3: Talk to your data](#230--330--act-3-talk-to-your-data)
  - [3:30 – 5:00 · Act 4: The policy workflow (the climax)](#330--500--act-4-the-policy-workflow-the-climax)
  - [5:00 – 5:45 · Act 5: Reports + close](#500--545--act-5-reports--close)
- [Deep dive: the policy workflow](#-deep-dive-the-policy-workflow-90s)
- [Things that can go wrong](#things-that-can-go-wrong-rehearse-these)
- [Five lines to over-rehearse](#the-five-lines-to-over-rehearse)
- [The 3-minute version](#the-3-minute-version-if-time-gets-cut)

---

## The narrative arc

Three acts, told in order:

1. **It reviews.** AI filters 4,400 transactions to the 5 the manager actually has to decide today.
2. **It reasons.** Drop in a paper receipt; watch Claude Vision extract structured data and the agent re-reason about the approval in real time.
3. **It governs.** The manager doesn't just enforce the policy — she edits it through conversation, with diffs and one-click accept.

End on: **"the manager is teaching the agent."**

---

## Full 6-minute flow

### 0:00 – 0:30 · Welcome + premise

| Action | Talking line |
|---|---|
| Open `http://localhost:3000/welcome` | — |
| Move the cursor a bit so the cube reacts | *"Brim Financial's fleet ops team has 50 employees and 4,400 card transactions over six months. Their finance manager, Avery, can't review every charge. So we built her an AI co-pilot called Sift."* |
| Click **Try it out →** | — |

---

### 0:30 – 1:30 · Act 1: The inbox (the daily driver)

| Action | Talking line |
|---|---|
| Lands on `/` (Dashboard). Point at the **5 Pending Approvals** tile. | *"Out of 4,400 transactions, the AI surfaced 5 that need a human. That's the first promise — filter the noise."* |
| Click **Approvals** in the sidebar. | *"Each row has the AI's recommendation. Approve. Approve. Reject."* |
| Click into the **HARBOUR 60 STEAKHOUSE — Olivia Park $445** approval. | — |
| In the right panel, point at the **AI Recommendation** card. | *"Sift recommends review. Here's why, in plain English."* |
| Hover the **citation badge** so the policy popover appears. | *"And here's the exact policy clause it's citing."* |
| Point at the **Submission status badges**. | *"Receipt missing, attendees missing, business purpose missing. The AI knows what's missing because the policy says so."* |
| Pause. | *"Watch what happens when I upload the receipt."* |

---

### 1:30 – 2:30 · Act 2: The OCR + re-evaluation moment

> **This is your "wow" moment. Don't rush it.**

| Action | Talking line |
|---|---|
| In the right drawer, scroll to the receipt upload widget. | — |
| Drop in `ChatGPT Image Apr 17, 2026, 01_13_44 AM.png` (Harbour 60 receipt). | *"This is real Claude Vision. No template, no regex. The receipt is a photo of paper."* |
| ~10s later: fields populate (server SARAH, table 14, 4 guests, line items, $497.80 total). | *"And the agent re-reasoned. New context, new recommendation."* |
| The AI Recommendation card refreshes. Point at the new reasoning. | — |
| Click **Approve**. | *"One click. Done. Activity logged in the audit trail."* |
| Show the **Activity feed** updating. | — |

---

### 2:30 – 3:30 · Act 3: Talk to your data

| Action | Talking line |
|---|---|
| Click **Ask Sift** in the sidebar. | — |
| Type: `What did Operations spend on fuel last quarter? Show me a chart.` | *"Plain English in. Chart and analysis out. No SQL, no dashboards."* |
| Watch the box loader → streaming answer + chart. | — |
| Follow up: `How does that compare to maintenance?` | *"And it remembers the context. Real conversation, not a search box."* |

---

### 3:30 – 5:00 · Act 4: The policy workflow (the climax)

> **Read the [deep dive](#-deep-dive-the-policy-workflow-90s) below.**

This is the part the audience hasn't seen 50 times today. Slow down here.

---

### 5:00 – 5:45 · Act 5: Reports + close

| Action | Talking line |
|---|---|
| Click **Reports** in the sidebar. | — |
| Open **Tobias Grant's Q1 report**. | *"Sift bundles related transactions automatically — 24 mechanic charges across three months, grouped, with policy flags inline."* |
| Click **Export** → CSV downloads. | *"Sign off, export to accounting, done."* |
| Pause. Hold for a beat. | **Closing line:** *"Sift turns 4,400 transactions into 5 decisions, with a real audit trail and a policy that the AI helps you keep current. That's expense intelligence."* |

---

## 🎯 Deep dive: the policy workflow (90s)

This is the most novel part of the product. It's also the most fragile, so do it deliberately.

### The story you're telling

> *"The AI doesn't just enforce the policy. It tells you when the policy is wrong, drafts the fix, and lets you accept it with one click. The manager teaches the agent."*

### The exact 90-second sequence

#### Step 1 — Open the policy editor
Click **Policy** in the sidebar. Pause one second so the audience absorbs the three-pane layout.

> *"Sift sees policy editing as a conversation between three things: the AI's suggestions on the left, the policy itself in the middle, and a chat assistant on the right."*

#### Step 2 — Point at the leftmost panel
"Sift Suggestions: 6 gaps in your policy."

Click the **first suggestion card** — *"Reasonable parking and entertainment undefined"*. Read the AI's note out loud:

> *"The policy uses 'reasonable entertainment of customers' without any dollar cap. The $445 Harbour 60 dinner illustrates this — the agent had no ceiling against which to evaluate spend per head."*

Then say:
> *"This is the agent telling Avery: hey, your policy has a hole. Fix it."*

#### Step 3 — Don't click Apply. Use the chat.
Move to the **chat sidebar on the right** and type:

```
Add a $200 per-person cap on customer entertainment.
```

#### Step 4 — Wait for the proposal
Box loader → streaming answer. The chat will say something like *"Proposed. Adding to submission requirements. Diff is live in the editor."*

#### Step 5 — Show the diff
The middle pane auto-jumps to the **Submission Requirements tab**. The new rule appears in **green**, no other red noise.

> *"Inline diff. Green for added, red for removed. No other policy text touched."*

#### Step 6 — Accept
Click **Accept & save** in the dark proposal banner.

> *"One click. The policy is updated. From this moment, every new transaction gets evaluated against the new rule."*

#### Step 7 — Optional kicker
Back in the chat sidebar, type:

```
Show transactions affected by my last edit.
```

> *"Sift can tell me which approvals would have been re-evaluated under the new rule. So I see the impact of my change before I close the loop."*

### Why this lands

- It's a real **closed loop**: AI flags gap → AI drafts fix → human approves → AI applies fix → AI shows impact.
- The diff visualization is **proof of trust** — the manager sees exactly what's changing, no black box.
- It demonstrates that the AI is **not just executing**, it's **collaborating**.

### Backup line if the chat is slow

While the box loader is spinning:

> *"This is Claude Sonnet drafting a structured policy edit. Watching it think is part of the trust-building — you can see it's not pulling from a template."*

---

## Things that can go wrong (rehearse these)

| Risk | Mitigation |
|---|---|
| Receipt upload takes >15s | Pre-upload it once before the demo so the OCR call is warm. Have a screenshot as a backup. |
| Chat returns empty / errors | Have a canned successful chat session in localStorage. Hard-refresh `/chat` — the persisted history will be there. |
| Policy proposal goes sideways | Backup phrasing memorized: *"Tighten the alcohol rule to require a guest list."* Known to produce a clean diff. |
| Cube doesn't load (no WebGL) | Skip `/welcome`. Start at the dashboard. The cube is a flourish, not the demo. |
| Anthropic API is down | Pre-record the receipt-upload moment as a 30s screen capture as a fallback. |

---

## The five lines to over-rehearse

These should roll off without thinking. Memorize them word-for-word.

1. **Opening** — *"4,400 transactions. 5 things Avery has to decide today. That's the AI's job — filter the noise."*
2. **OCR** — *"This is real Claude Vision. The receipt is a photo of paper. Watch the agent re-reason with new context."*
3. **Chat** — *"Plain English in. Chart and analysis out. No SQL, no dashboards."*
4. **Policy (the killer line)** — *"The AI doesn't just enforce the policy. It tells you when the policy is wrong, drafts the fix, and lets you accept it with one click. The manager teaches the agent."*
5. **Close** — *"Sift turns 4,400 transactions into 5 decisions, with a real audit trail and a policy that the AI helps you keep current."*

---

## The 3-minute version (if time gets cut)

Drop in this order:
1. The welcome page (open `/` directly instead).
2. The reports export demo.
3. The follow-up chat question.

**Keep no matter what:**
- The "5 of 4,400" framing.
- The receipt upload + AI re-evaluation.
- The policy editor proposal + accept.

Those three moments **are the product**. Everything else is supporting evidence.

---

## Pre-demo checklist

Run through this 10 minutes before walking on stage.

- [ ] Backend running on `:8000` — `curl http://localhost:8000/api/analytics/agent-stats` returns JSON
- [ ] Frontend running on `:3000` — `/welcome` renders the cube
- [ ] Database seeded — `sqlite3 brim_expenses.db "SELECT COUNT(*) FROM approvals WHERE status='pending';"` returns `5`
- [ ] Receipt files copied to `/tmp/` (so the file picker doesn't time out on the long path)
- [ ] Browser zoom at 100%, dev tools closed, no other tabs in the window
- [ ] Anthropic API key valid — send one test chat to warm the connection
- [ ] Pre-load `/chat` and ask one throwaway question so the persisted-history is non-empty

---

## Appendix: receipt assets

| File | Use for | Approval ID | Transaction rowid |
|---|---|---|---|
| `ChatGPT Image Apr 17, 2026, 01_13_44 AM.png` | Harbour 60 — clean OCR + re-evaluation | #2043 | 4330 |
| `ChatGPT Image Apr 17, 2026, 01_12_37 AM.png` | Petro-Canada — *intentional mismatch* (powerful: AI catches the receipt doesn't match the transaction) | #2046 | 4470 |
