import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  answerQuestion,
  clearChatHistory,
  getChatHistory,
} from "../services/chat.server";
import {
  getPlanContext,
  requireFeature,
} from "../services/plan-access.server";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { features } = await getPlanContext(billing);
  requireFeature(features, "merchantAi");
  const history = await getChatHistory(session.shop);
  return {
    messages: history.map((m) => ({
      role: m.role as "user" | "assistant",
      text: m.text,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { features } = await getPlanContext(billing);
  requireFeature(features, "merchantAi");
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "ask");

  if (intent === "clear") {
    await clearChatHistory(session.shop);
    return { cleared: true };
  }

  const question = String(formData.get("question") ?? "").trim();
  if (!question) {
    return { answer: "Please type a question about your bundle inventory." };
  }

  try {
    const answer = await answerQuestion(session.shop, question);
    return { answer };
  } catch (error) {
    console.error("[app.chat] ask failed", error);
    return {
      answer:
        "I hit an error while looking that up. Please try again in a moment.",
      error: true,
    };
  }
};

const SUGGESTIONS = [
  "Which bundles are blocked and why?",
  "Any components running low?",
  "Give me a full inventory summary",
  "Are there location issues?",
  "What should I restock first?",
];

function renderMarkdown(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code style="background:#f1f1f1;padding:1px 4px;border-radius:3px;font-size:13px">$1</code>')
    .replace(/^• /gm, "‣ ")
    .replace(/^- /gm, "‣ ")
    .replace(/\n/g, "<br/>");
}

export default function ChatPage() {
  const { messages: savedMessages } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const clearFetcher = useFetcher();

  const greeting: Message = {
    role: "assistant",
    text: "**Welcome to BundleGuard Assistant!** 👋\n\nI can answer questions about your bundle inventory — blocked bundles, low stock, component health, location gaps, and more.\n\nTry one of the suggestions below, or type your own question.",
  };

  const [messages, setMessages] = useState<Message[]>(() =>
    savedMessages.length > 0 ? savedMessages : [greeting],
  );
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFetcherState = useRef(fetcher.state);

  useEffect(() => {
    if (
      prevFetcherState.current !== "idle" &&
      fetcher.state === "idle" &&
      fetcher.data &&
      "answer" in fetcher.data
    ) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: fetcher.data!.answer as string },
      ]);
    }
    prevFetcherState.current = fetcher.state;
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
    if (clearFetcher.state === "idle" && clearFetcher.data && "cleared" in (clearFetcher.data as Record<string, unknown>)) {
      setMessages([greeting]);
    }
  }, [clearFetcher.state, clearFetcher.data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, fetcher.state]);

  const sendMessage = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q || fetcher.state !== "idle") return;
      setMessages((prev) => [...prev, { role: "user", text: q }]);
      setInput("");
      fetcher.submit({ question: q, intent: "ask" }, { method: "POST" });
      inputRef.current?.focus();
    },
    [fetcher],
  );

  const isThinking = fetcher.state !== "idle";
  const showSuggestions = messages.length <= 1;

  return (
    <s-page heading="BundleGuard Assistant">
      <s-link slot="breadcrumb-actions" href="/app">
        Dashboard
      </s-link>
      <s-button
        slot="secondary-actions"
        variant="tertiary"
        onClick={() =>
          clearFetcher.submit({ intent: "clear" }, { method: "POST" })
        }
      >
        Clear history
      </s-button>

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/ai">AI hub</s-link>
          <s-text type="strong">Merchant chat</s-text>
          <s-link href="/app/shopper">Shopper settings</s-link>
          <s-link href="/app/assistant/conversations">Conversations</s-link>
          <s-link href="/app/assistant/analytics">Analytics</s-link>
          <s-link href="/app/assistant/settings">Settings</s-link>
        </s-stack>
      </s-section>

      <s-section>
        {/* Chat window */}
        <div style={styles.chatContainer}>
          {/* Header bar */}
          <div style={styles.header}>
            <div style={styles.headerDot} />
            <span style={styles.headerTitle}>BundleGuard AI</span>
            <span style={styles.headerStatus}>
              {isThinking ? "Typing…" : "Online"}
            </span>
          </div>

          {/* Messages area */}
          <div ref={scrollRef} style={styles.messagesArea}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: "14px",
                  alignItems: "flex-end",
                  gap: "8px",
                }}
              >
                {msg.role === "assistant" && <div style={styles.avatar}>BG</div>}
                <div
                  style={
                    msg.role === "user"
                      ? styles.userBubble
                      : styles.assistantBubble
                  }
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(msg.text),
                  }}
                />
              </div>
            ))}

            {/* Typing indicator */}
            {isThinking && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  marginBottom: "14px",
                  alignItems: "flex-end",
                  gap: "8px",
                }}
              >
                <div style={styles.avatar}>BG</div>
                <div style={styles.typingBubble}>
                  <div style={styles.typingDots}>
                    <span style={{ ...styles.dot, animationDelay: "0ms" }} />
                    <span style={{ ...styles.dot, animationDelay: "150ms" }} />
                    <span style={{ ...styles.dot, animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Suggestion chips */}
          {showSuggestions && (
            <div style={styles.suggestionsRow}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  style={styles.chip}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.background = "#e8f5e9";
                    (e.target as HTMLButtonElement).style.borderColor = "#008060";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.background = "#fff";
                    (e.target as HTMLButtonElement).style.borderColor = "#e1e3e5";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div style={styles.inputBar}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask about your bundles…"
              style={styles.input}
              disabled={isThinking}
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={isThinking || !input.trim()}
              style={{
                ...styles.sendBtn,
                opacity: isThinking || !input.trim() ? 0.5 : 1,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* CSS animation for typing dots */}
        <style>{`
          @keyframes blink {
            0%, 80%, 100% { opacity: 0.3; }
            40% { opacity: 1; }
          }
        `}</style>
      </s-section>

      {/* Sidebar */}
      <s-section slot="aside" heading="What can I ask?">
        <s-stack direction="block" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Inventory questions</s-text>
            <s-paragraph>
              "Which bundles are blocked?" · "Why is my Summer Kit out of stock?"
              · "What should I restock first?"
            </s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Component lookups</s-text>
            <s-paragraph>
              "What's the status of SKU-123?" · "Which components are running
              low?" · "Show me component health"
            </s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Location audit</s-text>
            <s-paragraph>
              "Any warehouse issues?" · "Location gaps?" · "Which location is
              short on stock?"
            </s-paragraph>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-text type="strong">Summaries</s-text>
            <s-paragraph>
              "Give me a full summary" · "How healthy are my bundles?" · "Quick
              overview"
            </s-paragraph>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

const styles: Record<string, CSSProperties> = {
  chatContainer: {
    border: "1px solid #e1e3e5",
    borderRadius: "16px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: "560px",
    background: "#fff",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 18px",
    background: "linear-gradient(135deg, #004c3f 0%, #008060 100%)",
    color: "#fff",
  },
  headerDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#5be9b9",
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: "15px",
    flex: 1,
  },
  headerStatus: {
    fontSize: "12px",
    opacity: 0.85,
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "18px",
    background: "#fafbfc",
  },
  avatar: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #004c3f, #008060)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: 700,
    flexShrink: 0,
  },
  userBubble: {
    maxWidth: "72%",
    padding: "10px 14px",
    borderRadius: "16px 16px 4px 16px",
    background: "#008060",
    color: "#fff",
    fontSize: "14px",
    lineHeight: "1.55",
    wordBreak: "break-word" as const,
  },
  assistantBubble: {
    maxWidth: "72%",
    padding: "10px 14px",
    borderRadius: "16px 16px 16px 4px",
    background: "#fff",
    color: "#202223",
    fontSize: "14px",
    lineHeight: "1.55",
    border: "1px solid #e8e9eb",
    wordBreak: "break-word" as const,
  },
  typingBubble: {
    padding: "12px 18px",
    borderRadius: "16px 16px 16px 4px",
    background: "#fff",
    border: "1px solid #e8e9eb",
  },
  typingDots: {
    display: "flex",
    gap: "4px",
    alignItems: "center",
  },
  dot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#8c9196",
    display: "inline-block",
    animation: "blink 1.2s infinite",
  },
  suggestionsRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap" as const,
    padding: "0 18px 12px",
    background: "#fafbfc",
  },
  chip: {
    padding: "7px 14px",
    borderRadius: "20px",
    border: "1px solid #e1e3e5",
    background: "#fff",
    cursor: "pointer",
    fontSize: "13px",
    color: "#202223",
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  },
  inputBar: {
    display: "flex",
    gap: "8px",
    padding: "12px 14px",
    borderTop: "1px solid #e8e9eb",
    background: "#fff",
    alignItems: "center",
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: "24px",
    border: "1px solid #d2d5d8",
    fontSize: "14px",
    outline: "none",
    background: "#fafbfc",
    transition: "border-color 0.15s",
  },
  sendBtn: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    border: "none",
    background: "#008060",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 0.15s",
    flexShrink: 0,
  },
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
