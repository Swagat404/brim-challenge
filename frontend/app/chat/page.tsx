"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Zap, BarChart3, ShieldAlert, FileText, MessageSquare } from "lucide-react";
import { streamChat } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import Chart from "@/components/Chart";
import { AIChatInput } from "@/components/ui/ai-chat-input";
import { GenerativeArtScene } from "@/components/ui/anomalous-matter-hero";

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
    <div className="absolute inset-0 flex flex-col bg-transparent">
      {/* Header */}
      <div className="px-6 py-6 border-b border-zinc-100 bg-white/70 backdrop-blur-xl flex-shrink-0 z-10 rounded-t-[24px]">
        <h1 className="font-bold text-zinc-900 text-[24px] tracking-tight leading-none mb-1.5">
          Ask AI
        </h1>
        <p className="text-[14px] font-medium text-zinc-500">
          Ask anything about spending, compliance, or trends
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto z-10 min-h-0">
        {!hasMessages ? (
          <WelcomeScreen onSuggest={send} />
        ) : (
          <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 z-10 px-8 py-8 bg-white/70 backdrop-blur-xl border-t border-zinc-200/40 rounded-b-[24px]">
        <div className="max-w-4xl mx-auto">
          <AIChatInput
            placeholders={PLACEHOLDERS}
            onSend={send}
            disabled={streaming}
            loading={streaming}
          />
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 relative w-full pt-10 pb-20">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40 flex items-center justify-center">
        <div className="w-[600px] h-[600px] relative">
          <GenerativeArtScene />
        </div>
      </div>
      <div className="relative z-10 flex flex-col items-center w-full">
        <h2 className="text-[36px] font-bold text-zinc-900 mb-3 tracking-tight mt-12">How can I help you today?</h2>
        <p className="text-[15px] font-medium text-zinc-500 mb-12 max-w-md text-center">
          I can analyze spending, check policy compliance, generate expense reports, and uncover trends.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          {SUGGESTION_GROUPS.map((group, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1 px-1">
                <group.icon className="w-4 h-4 text-zinc-400" />
                <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">{group.title}</span>
              </div>
              {group.items.map((item, j) => (
                <button
                  key={j}
                  onClick={() => onSuggest(item)}
                  className="text-left p-5 bg-white/80 backdrop-blur-md rounded-[20px] border border-zinc-200/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-[14px] font-medium text-zinc-700 leading-snug"
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex items-start gap-3 max-w-[70%]">
          <div className="bg-zinc-900 text-white rounded-[24px] rounded-tr-[4px] px-5 py-3.5 text-[14px] font-medium leading-relaxed shadow-sm">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5 border border-zinc-200/60 shadow-sm">
        <Bot className="w-4 h-4 text-zinc-600" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.toolProgress && msg.toolProgress.length > 0 && (
          <div className="mb-4 space-y-2">
            {msg.toolProgress.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-[13px] font-medium text-zinc-500"
              >
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                {p}
              </div>
            ))}
          </div>
        )}

        {msg.content && (
          <div className="text-[15px] text-zinc-800 leading-relaxed font-medium">
            <div
              className="chat-prose"
              dangerouslySetInnerHTML={{
                __html: formatMarkdown(msg.content),
              }}
            />
            {msg.isStreaming && (
              <span className="cursor-blink inline-block w-1.5 h-4 bg-zinc-400 ml-1 align-middle rounded-full" />
            )}
          </div>
        )}

        {msg.chart && !msg.isStreaming && (
          <div className="mt-5 bg-white border border-zinc-200/60 rounded-[24px] p-6 shadow-sm">
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

      const headerRow = parseRow(rows[0]);
      let dataStart = 1;
      if (rows.length > 1 && isSeparator(rows[1])) {
        dataStart = 2;
      }

      let html = '<div class="overflow-x-auto my-5 bg-white rounded-[16px] border border-zinc-200/60 shadow-sm"><table class="w-full text-[13px] border-collapse">';
      html += "<thead><tr>";
      for (const cell of headerRow) {
        html += `<th class="text-left px-5 py-3 border-b border-zinc-200 font-bold text-zinc-500 uppercase tracking-wider bg-zinc-50 whitespace-nowrap">${cell}</th>`;
      }
      html += "</tr></thead><tbody class=\"divide-y divide-zinc-100\">";

      for (let i = dataStart; i < rows.length; i++) {
        if (isSeparator(rows[i])) continue;
        const cells = parseRow(rows[i]);
        html += `<tr class="hover:bg-zinc-50 transition-colors">`;
        for (let j = 0; j < cells.length; j++) {
          const isNumeric = /^\$?[\d,.]+%?$/.test(cells[j]);
          html += `<td class="px-5 py-3 ${isNumeric ? "tabular-nums font-bold" : "font-medium"} text-zinc-800 whitespace-nowrap">${cells[j]}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table></div>";
      return html;
    }
  );

  return escaped
    // Horizontal rules
    .replace(/^---+$/gm, '<hr class="my-6 border-zinc-200" />')
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, "<strong class='font-bold text-zinc-900'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code class='bg-zinc-100 text-zinc-800 px-1.5 py-0.5 rounded-md text-[12px] font-mono border border-zinc-200/60'>$1</code>")
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-zinc-900 text-[15px] mt-6 mb-2 tracking-tight">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-zinc-900 text-[18px] mt-8 mb-3 tracking-tight">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-zinc-900 text-[24px] mt-8 mb-4 tracking-tight">$1</h1>')
    // Numbered lists
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-5 list-decimal text-zinc-700 my-1">$2</li>')
    // Bullet lists
    .replace(/^[•\-] (.+)$/gm, '<li class="ml-5 list-disc text-zinc-700 my-1">$1</li>')
    // Wrap consecutive <li> in <ul>/<ol>
    .replace(/((?:<li class="ml-5 list-disc[^>]*>.*?<\/li>\n?)+)/g, (m) => `<ul class="pl-1 space-y-1 my-3">${m}</ul>`)
    .replace(/((?:<li class="ml-5 list-decimal[^>]*>.*?<\/li>\n?)+)/g, (m) => `<ol class="pl-1 space-y-1 my-3">${m}</ol>`)
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, "<br/>");
}
