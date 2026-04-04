"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, User, Loader2, Zap, TruckIcon, BarChart3, ShieldAlert, FileText, MessageSquare } from "lucide-react";
import { streamChat } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import Chart from "@/components/Chart";
import { AIChatInput } from "@/components/ui/ai-chat-input";

const PLACEHOLDERS = [
  "What did marketing spend on software last quarter?",
  "Compare spending across all departments",
  "Which employees are over budget? Show a chart",
  "Show fuel spend trends by month for Operations",
  "Find all policy violations and rank by severity",
  "Generate an expense report for Olivia Park's San Diego trip",
];

const SUGGESTION_GROUPS = [
  {
    title: "Spend Analysis",
    icon: BarChart3,
    items: [
      "Compare spending across all departments this quarter",
      "What did Sales spend on client entertainment?",
    ],
  },
  {
    title: "Compliance",
    icon: ShieldAlert,
    items: [
      "Find all policy violations and rank by severity",
      "Which employees have the most flagged transactions?",
    ],
  },
  {
    title: "Reports",
    icon: FileText,
    items: [
      "Generate an expense report for Olivia Park's San Diego trip",
      "Show fuel spend trends by month for Operations",
    ],
  },
];

function makeId() {
  return Math.random().toString(36).slice(2);
}

function getSessionId() {
  if (typeof window === "undefined") return "ssr";
  let id = sessionStorage.getItem("brim_session");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("brim_session", id);
  }
  return id;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: ChatMessage = { id: makeId(), role: "user", content: text };
    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      toolProgress: [],
    };

    setMessages((m) => [...m, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      for await (const event of streamChat(text, getSessionId())) {
        if (event.type === "text_delta" && event.text) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + event.text }
                : msg
            )
          );
        } else if (event.type === "tool_start") {
          const progressMsg = event.tool_name ? `Querying ${event.tool_name}...` : "Processing...";
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, toolProgress: [...(msg.toolProgress ?? []), progressMsg] }
                : msg
            )
          );
        } else if (event.type === "chart" && event.chart) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, chart: event.chart } : msg
            )
          );
        } else if (event.type === "done" || event.type === "error") {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, isStreaming: false, content: msg.content || (event.error ?? "Done.") }
                : msg
            )
          );
        }
      }
    } catch (err) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                isStreaming: false,
                content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
              }
            : msg
        )
      );
    } finally {
      setStreaming(false);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId ? { ...msg, isStreaming: false } : msg
        )
      );
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-screen relative">
      {/* Subtle warm gradient background */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(240,253,244,0.4) 0%, rgba(248,250,252,1) 40%, rgba(248,250,252,1) 60%, rgba(240,249,255,0.3) 100%)",
        }}
      />

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 px-6 py-3 flex-shrink-0 z-10">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-slate-900 text-sm">
              Expense Intelligence
            </h1>
            <p className="text-[11px] text-slate-500">
              Ask anything about spending, compliance, or trends
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
            <Zap className="w-3 h-3" />
            Claude Sonnet
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto z-10">
        {!hasMessages ? (
          <WelcomeScreen onSuggest={send} />
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 z-10 px-6 py-4 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc]/95 to-transparent">
        <AIChatInput
          placeholders={PLACEHOLDERS}
          onSend={send}
          disabled={streaming}
          loading={streaming}
        />
      </div>
    </div>
  );
}

function WelcomeScreen({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-6">
      <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-5">
        <TruckIcon className="w-7 h-7 text-green-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-1.5">
        Fleet Expense Intelligence
      </h2>
      <p className="text-sm text-slate-500 max-w-md text-center mb-10 leading-relaxed">
        Ask questions about spending patterns, compliance, or generate expense
        reports. Powered by Claude with direct database access.
      </p>

      <div className="grid grid-cols-3 gap-4 max-w-3xl w-full">
        {SUGGESTION_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <div className="flex items-center gap-2 px-1 mb-2">
              <group.icon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {group.title}
              </span>
            </div>
            {group.items.map((item) => (
              <button
                key={item}
                onClick={() => onSuggest(item)}
                className="w-full text-left px-3.5 py-3 rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50/50 text-[13px] text-slate-600 transition-all leading-snug bg-white/60"
              >
                {item}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex items-start gap-2.5 max-w-[70%]">
          <div className="bg-green-600 text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-[13px] leading-relaxed">
            {msg.content}
          </div>
          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
            <User className="w-3 h-3 text-slate-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot className="w-3 h-3 text-green-600" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.toolProgress && msg.toolProgress.length > 0 && (
          <div className="mb-2 space-y-0.5">
            {msg.toolProgress.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[11px] text-slate-400"
              >
                <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />
                {p}
              </div>
            ))}
          </div>
        )}

        {msg.content && (
          <div className="text-[13px] text-slate-800 leading-relaxed">
            <div
              className="chat-prose"
              dangerouslySetInnerHTML={{
                __html: formatMarkdown(msg.content),
              }}
            />
            {msg.isStreaming && (
              <span className="cursor-blink inline-block w-0.5 h-3.5 bg-slate-400 ml-0.5 align-middle" />
            )}
          </div>
        )}

        {msg.chart && !msg.isStreaming && (
          <div className="mt-3 bg-white border border-slate-200/80 rounded-xl p-4">
            <Chart chart={msg.chart} />
          </div>
        )}
      </div>
    </div>
  );
}

function formatMarkdown(text: string): string {
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Extract and convert tables
  escaped = escaped.replace(
    /((?:^\|.+\|$\n?)+)/gm,
    (_match, tableBlock: string) => {
      const rows = tableBlock.trim().split("\n").filter((r: string) => r.trim());
      if (rows.length < 2) return tableBlock;

      const parseRow = (r: string) =>
        r.split("|").slice(1, -1).map((c: string) => c.trim());

      const isSeparator = (r: string) => /^\|[\s\-:|]+\|$/.test(r.trim());

      let headerRow = parseRow(rows[0]);
      let dataStart = 1;
      if (rows.length > 1 && isSeparator(rows[1])) {
        dataStart = 2;
      }

      let html = '<div class="overflow-x-auto my-3"><table class="w-full text-[12px] border-collapse">';
      html += "<thead><tr>";
      for (const cell of headerRow) {
        html += `<th class="text-left px-3 py-2 border-b-2 border-slate-200 font-semibold text-slate-600 bg-slate-50/80 whitespace-nowrap">${cell}</th>`;
      }
      html += "</tr></thead><tbody>";

      for (let i = dataStart; i < rows.length; i++) {
        if (isSeparator(rows[i])) continue;
        const cells = parseRow(rows[i]);
        html += `<tr class="border-b border-slate-100 hover:bg-slate-50/50">`;
        for (let j = 0; j < cells.length; j++) {
          const isNumeric = /^\$?[\d,.]+%?$/.test(cells[j]);
          html += `<td class="px-3 py-1.5 ${isNumeric ? "tabular-nums font-medium" : ""} text-slate-700 whitespace-nowrap">${cells[j]}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table></div>";
      return html;
    }
  );

  return escaped
    // Horizontal rules
    .replace(/^---+$/gm, '<hr class="my-4 border-slate-200" />')
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code class='bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-mono'>$1</code>")
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-slate-900 text-[13px] mt-4 mb-1.5">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-slate-900 text-sm mt-5 mb-1.5">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-slate-900 text-base mt-5 mb-2">$1</h1>')
    // Numbered lists
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-700">$2</li>')
    // Bullet lists
    .replace(/^[•\-] (.+)$/gm, '<li class="ml-4 list-disc text-slate-700">$1</li>')
    // Wrap consecutive <li> in <ul>/<ol>
    .replace(/((?:<li class="ml-4 list-disc[^>]*>.*?<\/li>\n?)+)/g, (m) => `<ul class="pl-1 space-y-0.5 my-2">${m}</ul>`)
    .replace(/((?:<li class="ml-4 list-decimal[^>]*>.*?<\/li>\n?)+)/g, (m) => `<ol class="pl-1 space-y-0.5 my-2">${m}</ol>`)
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="mt-2.5">')
    .replace(/\n/g, "<br/>");
}
