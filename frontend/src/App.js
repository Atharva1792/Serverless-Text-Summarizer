import { useState, useRef, useEffect } from "react";

// ── Paste your API Gateway base URL below ─────────────────────────────────
const API_BASE = "https://12v0z0wmp7.execute-api.ap-south-1.amazonaws.com/dev";

const SUMMARY_LENGTHS = {
  short:    { label: "Short",    desc: "2–3 sentences" },
  medium:   { label: "Medium",   desc: "Key points"    },
  detailed: { label: "Detailed", desc: "Full breakdown" },
};

const SAMPLE_TEXTS = [
  {
    label: "Call transcript",
    text: `Customer: Hi, I've been having issues with my internet connection for the past three days. It keeps dropping every hour or so and I work from home so this is really affecting my productivity.\n\nAgent: I'm sorry to hear that, Mr. Johnson. I can see your account here. Let me run a remote diagnostic on your modem. It looks like your modem firmware is two versions behind and we're also seeing some signal interference on your line. I'm going to push a firmware update now and I'm also going to schedule a technician visit for Thursday between 2 and 4 PM to check the physical line.\n\nCustomer: That works for me. Will there be any cost?\n\nAgent: No, this is fully covered under your current plan. You'll receive a confirmation SMS shortly. Is there anything else I can help you with?\n\nCustomer: No, that's great. Thank you for sorting this out so quickly.`,
  },
  {
    label: "Meeting notes",
    text: `Q3 Product Roadmap Meeting — September 12\nAttendees: Sarah (PM), Dev Team, Design Lead\n\nThe team reviewed progress on the mobile redesign project, which is currently 80% complete with a target launch of October 1st. The checkout flow has been fully redesigned based on user research showing a 34% drop-off at the payment screen. Design presented three new payment screen mockups and the team voted to proceed with Option B.\n\nKey blockers: API integration with Stripe's new 3DS authentication is delayed due to compliance review. Engineering estimates 1 additional week. Marketing confirmed they need the final build by September 25th. Sarah will escalate the compliance issue with legal by end of day. Next sync is September 19th.`,
  },
  {
    label: "AWS blog excerpt",
    text: `AWS took all of that feedback from customers, and today we are excited to announce Amazon Bedrock, a new service that makes FMs from AI21 Labs, Anthropic, Stability AI, and Amazon accessible via an API. Bedrock is the easiest way for customers to build and scale generative AI-based applications using FMs, democratizing access for all builders. Bedrock will offer the ability to access a range of powerful FMs for text and images—including Amazons Titan FMs, which consist of two new LLMs we're also announcing today—through a scalable, reliable, and secure AWS managed service. With Bedrock's serverless experience, customers can easily find the right model for what they're trying to get done, get started quickly, privately customize FMs with their own data, and easily integrate and deploy them into their applications using the AWS tools and capabilities they are familiar with, without having to manage any infrastructure.`,
  },
];

function CopyIcon({ copied }) {
  return copied ? (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 7.5L6 11.5L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="4" y="4" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M10.5 3.5l-.5 7a1 1 0 0 1-1 .95H4a1 1 0 0 1-1-.95l-.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L8.2 5.8H13L9.4 8.6L10.7 13L7 10.2L3.3 13L4.6 8.6L1 5.8H5.8L7 1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15"/>
    </svg>
  );
}

export default function App() {
  const [inputText, setInputText]     = useState("");
  const [summaryLength, setLength]    = useState("medium");
  const [summary, setSummary]         = useState("");
  const [isLoading, setIsLoading]     = useState(false);
  const [isFetchingHistory, setFetchingHistory] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [history, setHistory]         = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [wordCount, setWordCount]     = useState(0);
  const [error, setError]             = useState("");
  const [lastResult, setLastResult]   = useState(null);

  useEffect(() => {
    setWordCount(inputText.trim().split(/\s+/).filter(Boolean).length);
  }, [inputText]);

  // Load history from DynamoDB on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    setFetchingHistory(true);
    try {
      const res   = await fetch(`${API_BASE}/history`);
      const outer = await res.json();
      // Lambda proxy integration wraps the real payload as a JSON-stringified `body`
      const inner = typeof outer.body === "string" ? JSON.parse(outer.body) : outer;
      if (inner.history) setHistory(inner.history);
    } catch (e) {
      console.error("Could not load history:", e);
    } finally {
      setFetchingHistory(false);
    }
  }

  async function handleSummarize() {
    if (!inputText.trim() || wordCount < 10) {
      setError("Please enter at least 10 words to summarize.");
      return;
    }
    if (inputText.length > 7500) {
      setError("Input too long. Please shorten it.");
      return;
    }
    setError("");
    setIsLoading(true);
    setSummary("");
    setLastResult(null);

    try {
      // Lambda proxy integration expects: { body: "<stringified inner payload>" }
      const res = await fetch(`${API_BASE}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: JSON.stringify({ text: inputText.trim(), length: summaryLength }),
        }),
      });

      const outer = await res.json();
      // Unwrap the stringified body from Lambda proxy response
      const data  = typeof outer.body === "string" ? JSON.parse(outer.body) : outer;

      const statusCode = outer.statusCode ?? res.status;

      if (statusCode === 403) {
        setError("Service is temporarily paused. Please try later.");
        return;
      }
      if (statusCode !== 200) {
        setError(data.error || "Unable to generate summary. Try again.");
        return;
      }
      setSummary(data.summary);
      setLastResult(data);

      // Optimistically prepend to local history (Lambda already wrote to DynamoDB)
      setHistory(prev => [{
        id:           data.id,
        timestamp:    data.timestamp,
        inputSnippet: inputText.trim().slice(0, 80) + (inputText.length > 80 ? "\u2026" : ""),
        inputLength:  wordCount,
        summary:      data.summary,
        length:       data.length,
      }, ...prev].slice(0, 20));

    } catch (e) {
      setError("Network error. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy() {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleHistoryLoad(entry) {
    setSummary(entry.summary);
    setLength(entry.length);
    setShowHistory(false);
  }

  const charCount = inputText.length;
  const charLimit = 8000;
  const charPct   = Math.min((charCount / charLimit) * 100, 100);

  const summaryWords = summary.trim().split(/\s+/).filter(Boolean).length;
  const compression  = wordCount > 0
    ? Math.round((1 - summaryWords / wordCount) * 100)
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", fontFamily: "var(--font-sans)" }}>

      {/* Nav */}
      <header style={{
        background: "var(--color-background-primary)",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        padding: "0 2rem", height: "56px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SparkleIcon />
          </div>
          <span style={{ fontWeight: 500, fontSize: "15px", color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
            SummarizeAI
          </span>
        </div>
        <button
          onClick={() => { setShowHistory(v => !v); if (!showHistory) fetchHistory(); }}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "6px 12px", borderRadius: "var(--border-radius-md)",
            border: "0.5px solid var(--color-border-secondary)",
            background: showHistory ? "var(--color-background-secondary)" : "transparent",
            color: "var(--color-text-secondary)", fontSize: "13px", cursor: "pointer",
          }}
        >
          {isFetchingHistory ? (
            <span style={{ width: "12px", height: "12px", border: "1.5px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M7 4.5V7l2 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          History {history.length > 0 && <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{history.length}</span>}
        </button>
      </header>

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* History Panel */}
        {showHistory && (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", marginBottom: "1.5rem", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>Past summaries</span>
              <button onClick={fetchHistory} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>
                Refresh
              </button>
            </div>
            {history.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "13px" }}>No summaries yet</div>
            ) : (
              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => handleHistoryLoad(entry)}
                    style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: "12px" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "13px", color: "var(--color-text-primary)", margin: "0 0 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {entry.inputSnippet}
                      </p>
                      <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0 }}>
                        {new Date(entry.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {entry.inputLength} words · {SUMMARY_LENGTHS[entry.length]?.label}
                      </p>
                    </div>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)", whiteSpace: "nowrap" }}>
                      {entry.length}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Main Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

          {/* Input Panel */}
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>Input text</span>
              <span style={{ fontSize: "11px", color: charCount > charLimit * 0.9 ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>
                {wordCount} words · {charCount}/{charLimit}
              </span>
            </div>
            <div style={{ padding: "10px 18px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", gap: "6px" }}>
              {SAMPLE_TEXTS.map((s) => (
                <button key={s.label} onClick={() => { setInputText(s.text); setSummary(""); setError(""); }}
                  style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "20px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <textarea
              value={inputText}
              onChange={e => { if (e.target.value.length <= charLimit) setInputText(e.target.value); setError(""); setSummary(""); }}
              placeholder="Paste a call transcript, meeting notes, article, or any short text…"
              style={{ flex: 1, border: "none", outline: "none", resize: "none", padding: "16px 18px", fontSize: "14px", lineHeight: "1.7", color: "var(--color-text-primary)", background: "transparent", fontFamily: "var(--font-sans)", minHeight: "340px" }}
            />
            <div style={{ height: "2px", background: "var(--color-background-secondary)" }}>
              <div style={{ height: "100%", width: `${charPct}%`, transition: "width 0.2s", background: charPct > 90 ? "#e24b4a" : "#1d9e75" }} />
            </div>
          </div>
          
          {/* Right: Controls + Output */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Length selector + button */}
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "0 0 10px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Summary length</p>
              <div style={{ display: "flex", gap: "8px" }}>
                {Object.entries(SUMMARY_LENGTHS).map(([key, val]) => (
                  <button key={key} onClick={() => setLength(key)}
                    style={{ flex: 1, padding: "10px 6px", borderRadius: "var(--border-radius-md)", border: summaryLength === key ? "1.5px solid #0f172a" : "0.5px solid var(--color-border-tertiary)", background: summaryLength === key ? "#0f172a" : "transparent", color: summaryLength === key ? "#fff" : "var(--color-text-secondary)", cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: 500 }}>{val.label}</span>
                    <span style={{ fontSize: "10px", opacity: 0.7 }}>{val.desc}</span>
                  </button>
                ))}
              </div>

              {error && (
                <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--color-text-danger)", padding: "8px 12px", background: "var(--color-background-danger)", borderRadius: "var(--border-radius-md)" }}>
                  {error}
                </p>
              )}

              <button
                onClick={handleSummarize}
                disabled={isLoading || !inputText.trim()}
                style={{ width: "100%", marginTop: "12px", padding: "11px", borderRadius: "var(--border-radius-md)", background: isLoading || !inputText.trim() ? "var(--color-background-secondary)" : "#0f172a", color: isLoading || !inputText.trim() ? "var(--color-text-secondary)" : "#fff", border: "none", cursor: isLoading || !inputText.trim() ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 500, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {isLoading ? (
                  <><span style={{ width: "13px", height: "13px", border: "1.5px solid #999", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Summarizing…</>
                ) : (
                  <><SparkleIcon /> Summarize with Nova Lite</>
                )}
              </button>
            </div>

            {/* Output */}
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>Summary</span>
                {summary && (
                  <button onClick={handleCopy}
                    style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: copied ? "var(--color-text-success)" : "var(--color-text-secondary)", background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "4px 10px", cursor: "pointer" }}
                  >
                    <CopyIcon copied={copied} />{copied ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
              <div style={{ flex: 1, padding: "16px 18px", overflowY: "auto", minHeight: "220px" }}>
                {isLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "4px" }}>
                    {[100, 90, 75].map((w, i) => (
                      <div key={i} style={{ height: "13px", borderRadius: "4px", background: "var(--color-background-secondary)", width: `${w}%`, animation: "pulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                ) : summary ? (
                  <div style={{ fontSize: "14px", lineHeight: "1.75", color: "var(--color-text-primary)", whiteSpace: "pre-wrap" }}>{summary}</div>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)", fontSize: "13px", textAlign: "center", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "20px", opacity: 0.3 }}>◈</span>
                    <span>Your summary will appear here</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        {summary && !isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "1rem" }}>
            {[
              { label: "Input words",   value: wordCount      },
              { label: "Summary words", value: summaryWords   },
              { label: "Compression",   value: `${compression}%` },
            ].map(stat => (
              <div key={stat.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "14px 16px" }}>
                <p style={{ margin: "0 0 4px", fontSize: "11px", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</p>
                <p style={{ margin: 0, fontSize: "22px", fontWeight: 500, color: "var(--color-text-primary)" }}>{stat.value}</p>
              </div>
            ))}
          </div>
        )}
      </main>
      <footer
        style={{
          marginTop: "2rem",
          padding: "1rem",
          textAlign: "center",
          fontSize: "12px",
          color: "var(--color-text-secondary)",
          borderTop: "0.5px solid var(--color-border-tertiary)",
          opacity: 0.8
        }}
      >
        Built by{" "}
        <a
          href="https://www.linkedin.com/in/atharva-gujar-25a8b6249"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--color-text-primary)",
            textDecoration: "none",
            fontWeight: 500
          }}
          onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
          onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
        >
          Atharva
        </a>{" "}
        · Powered by Bedrock
      </footer>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.9; } }
        textarea::placeholder { color: var(--color-text-tertiary); }
        * { box-sizing: border-box; }
        button:focus-visible { outline: 2px solid #378add; outline-offset: 2px; }
        @media (max-width: 640px) {
          main > div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          main > div[style*="repeat(3"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
