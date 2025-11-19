"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

type AgentResponse = {
  done: boolean;
  nextQuestion?: string;
  summary?: GardenSummary;
};

type GardenSummary = {
  styles: string[];
  moodWords: string[];
  plantPalette: string[];
  features: string[];
  usagePlan: string[];
  sunlight: string | null;
  maintenance: string | null;
  climate: string | null;
  notes: string[];
};

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<GardenSummary | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Kick off with first question
    if (messages.length === 0 && !loading && !summary) {
      void askAgent([]);
    }
  }, [messages, loading, summary]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, summary]);

  async function askAgent(conv: Message[]) {
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conv }),
      });
      const data: AgentResponse = await res.json();
      if (data.summary) setSummary(data.summary);
      if (data.nextQuestion) {
        setMessages((m) => [...m, { role: "assistant", content: data.nextQuestion! }]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, I hit a snag. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const next = [...messages, { role: "user", content: input.trim() } as Message];
    setMessages(next);
    setInput("");
    await askAgent(next);
  }

  function restart() {
    setMessages([]);
    setSummary(null);
    setInput("");
  }

  const quickReplies = useMemo(
    () => [
      "Modern & minimal",
      "Cottage & romantic",
      "Mediterranean & dry",
      "Zen & calm",
      "Tropical & lush",
      "I have kids and a dog",
      "Low maintenance",
      "Full sun",
      "Mostly shade",
      "I love lavender and grasses",
      "I dislike roses"
    ],
    []
  );

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Find your garden style</div>
        <div className="card-subtle">An adaptive questionnaire to learn your taste, plants you love, how you'll use the space, and the feelings you want.</div>
      </div>

      <div className="card-body">
        <div className="chat" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="bubble">{m.content}</div>
            </div>
          ))}

          {summary && (
            <div className="section">
              <h4>Garden concept</h4>
              <div className="badges" style={{ marginBottom: 10 }}>
                {summary.styles.map((s) => (
                  <span key={s} className="badge">{s}</span>
                ))}
              </div>
              <div className="badges" style={{ marginBottom: 10 }}>
                {summary.moodWords.map((m) => (
                  <span key={m} className="badge">{m}</span>
                ))}
              </div>
              <div className="section" style={{ marginBottom: 10 }}>
                <h4>Plant palette</h4>
                <ul>
                  {summary.plantPalette.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="section" style={{ marginBottom: 10 }}>
                <h4>Features</h4>
                <ul>
                  {summary.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              <div className="section" style={{ marginBottom: 10 }}>
                <h4>How you'll use it</h4>
                <ul>
                  {summary.usagePlan.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
              <div className="badges">
                {summary.sunlight && <span className="badge">Sun: {summary.sunlight}</span>}
                {summary.maintenance && <span className="badge">Maintenance: {summary.maintenance}</span>}
                {summary.climate && <span className="badge">Climate: {summary.climate}</span>}
              </div>
              {summary.notes.length > 0 && (
                <div className="card-subtle" style={{ marginTop: 8 }}>
                  {summary.notes.join(" ? ")}
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button className="secondary" onClick={restart}>Start over</button>
              </div>
            </div>
          )}
        </div>

        {!summary && (
          <div className="badges">
            {quickReplies.map((q) => (
              <button
                key={q}
                className="secondary"
                onClick={() => {
                  const next = [...messages, { role: "user", content: q } as Message];
                  setMessages(next);
                  void askAgent(next);
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {!summary && (
        <form className="input-row" onSubmit={onSubmit}>
          <input
            type="text"
            placeholder={loading ? "Thinking..." : "Type your answer..."}
            value={input}
            disabled={loading}
            onChange={(e) => setInput(e.target.value)}
          />
          <button disabled={loading || !input.trim()} type="submit">
            {loading ? "..." : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
