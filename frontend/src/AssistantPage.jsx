import { useState, useEffect, useRef } from "react";
import "./AssistantPage.css";
import Sidebar from "./Sidebar";

const API = "http://127.0.0.1:8000";
const MAX_TEXT = 600;
const EXAMPLES = [
  "Notice for BSIT students: FYP proposal defense on 20 November at 10 am in Lab 2. Submit the proposal by 15 November.",
  "Library will be closed on Friday for all students.",
  "Mid-term exams start on 12 October for BSCS and BSIT, 12:30 to 2 pm.",
];

function labelOf(field) {
  return field.replace(/_/g, " ");
}

function groupOf(iso) {
  const d = new Date(iso && iso.endsWith("Z") ? iso : iso + "Z");
  const now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return "Earlier";
}

function NoticeText({ text }) {
  const parts = text.split(/(\{\w+\})/g);
  return (
    <p className="asp-text">
      {parts.map((p, i) =>
        /^\{\w+\}$/.test(p) ? (
          <span key={i} className="asp-ph">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

export function NoticeCard({ message, onSave, onCopy }) {
  const notice = message.notice;
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function startEdit() {
    setVals({ ...notice.values });
    setErr("");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setErr("");
    const problem = await onSave(message.id, vals);
    setSaving(false);
    if (problem) {
      setErr(problem);
    } else {
      setEditing(false);
    }
  }

  return (
    <div className="asp-notice">
      <div className="asp-notice-title">{notice.name}</div>
      <NoticeText text={notice.text} />
      <div className="asp-chips">
        {Object.keys(notice.values).map((f) => (
          <span key={f} className="asp-chip">
            {labelOf(f)}: {notice.values[f]}
          </span>
        ))}
        {notice.missing.map((f) => (
          <span key={f} className="asp-chip warn">
            {labelOf(f)} missing
          </span>
        ))}
      </div>
      {editing && (
        <div className="asp-edit">
          {notice.fields.map((f) => (
            <div key={f} className="asp-edit-field">
              <label htmlFor={"e-" + message.id + "-" + f}>{labelOf(f)}</label>
              <input
                id={"e-" + message.id + "-" + f}
                value={vals[f] || ""}
                onChange={(e) => setVals({ ...vals, [f]: e.target.value })}
              />
            </div>
          ))}
          {err && <div className="error">{err}</div>}
          <div className="asp-row">
            <button className="primary asp-btn" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button className="btn asp-btn" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {!editing && (
        <div className="asp-row">
          <button className="btn asp-btn" onClick={startEdit}>
            Edit
          </button>
          <button className="btn asp-btn" onClick={() => onCopy(notice)}>
            Copy
          </button>
          <button
            className="btn asp-btn"
            disabled
            title="Publishing to students comes in a later step"
          >
            Publish to students
          </button>
        </div>
      )}
    </div>
  );
}

export function MessageList({ messages, busy, onSave, onCopy }) {
  return (
    <div className="asp-messages">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="asp-user">
            {m.content}
          </div>
        ) : (
          <div key={m.id} className="asp-bot">
            <p className="asp-bot-line">{m.content}</p>
            {m.notice && <NoticeCard message={m} onSave={onSave} onCopy={onCopy} />}
          </div>
        )
      )}
      {busy && <div className="asp-bot asp-thinking">Thinking... this can take up to 40 seconds.</div>}
    </div>
  );
}

export function ChatSidebar({ chats, activeId, search, onSearch, onOpen, onNew, user, open }) {
  const shown = chats.filter((c) => c.title.toLowerCase().includes(search.trim().toLowerCase()));
  const groups = ["Today", "Yesterday", "Earlier"];
  const initials = (user.name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <aside className={"asp-side" + (open ? " open" : "")}>
      <button className="asp-new" onClick={onNew}>
        + New chat
      </button>
      <label htmlFor="asp-search" className="asp-hidden">
        Search chats
      </label>
      <input
        id="asp-search"
        className="asp-search"
        placeholder="Search chats"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className="asp-chatlist">
        {shown.length === 0 && <div className="asp-empty-list">No chats yet</div>}
        {groups.map((g) => {
          const items = shown.filter((c) => groupOf(c.updated_at) === g);
          if (items.length === 0) return null;
          return (
            <div key={g}>
              <div className="asp-group">{g.toUpperCase()}</div>
              {items.map((c) => (
                <button
                  key={c.id}
                  className={"asp-chatbtn" + (c.id === activeId ? " on" : "")}
                  onClick={() => onOpen(c.id)}
                >
                  {c.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="asp-me">
        <div className="asp-avatar">{initials}</div>
        <div>
          {user.name}
          <div className="asp-role">{user.role}</div>
        </div>
      </div>
    </aside>
  );
}

export default function AssistantPage({ user, onLogout, onNavigate }) {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState("New chat");
  const [messages, setMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const endRef = useRef(null);

  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + user.token,
  };

  async function call(path, options) {
    const res = await fetch(API + path, { ...options, headers: headers });
    if (res.status === 401) {
      onLogout();
      return null;
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      throw new Error(data && typeof data.detail === "string" ? data.detail : "Something went wrong");
    }
    return data;
  }

  function fail(err) {
    setError(
      err.message === "Failed to fetch"
        ? "Cannot reach the server. Is the backend running?"
        : err.message
    );
  }

  async function loadChats() {
    const d = await call("/assistant/chats");
    if (d) setChats(d);
  }

  useEffect(() => {
    loadChats().catch(fail);
    call("/templates")
      .then((d) => {
        if (d) setTemplates(d);
      })
      .catch(() => {});
  }, [user.token]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function openChat(id) {
    setError("");
    setNote("");
    setSideOpen(false);
    try {
      const d = await call("/assistant/chats/" + id);
      if (d) {
        setActiveId(id);
        setTitle(d.chat.title);
        setMessages(d.messages);
      }
    } catch (err) {
      fail(err);
    }
  }

  function newChat() {
    setActiveId(null);
    setTitle("New chat");
    setMessages([]);
    setError("");
    setNote("");
    setInput("");
    setSideOpen(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError("");
    setNote("");
    setBusy(true);
    try {
      let id = activeId;
      if (!id) {
        const c = await call("/assistant/chats", { method: "POST" });
        if (!c) return;
        id = c.id;
        setActiveId(id);
      }
      const d = await call("/assistant/chats/" + id + "/messages", {
        method: "POST",
        body: JSON.stringify({ text: text, template_id: templateId ? Number(templateId) : null }),
      });
      if (d) {
        setMessages((prev) => [...prev, ...d.messages]);
        setTitle(d.chat.title);
        setInput("");
        await loadChats();
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function removeChat() {
    if (!activeId) return;
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;
    try {
      await call("/assistant/chats/" + activeId, { method: "DELETE" });
      newChat();
      await loadChats();
    } catch (err) {
      fail(err);
    }
  }

  async function saveNotice(messageId, values) {
    try {
      const d = await call("/assistant/messages/" + messageId, {
        method: "PATCH",
        body: JSON.stringify({ values: values }),
      });
      if (d) setMessages((prev) => prev.map((m) => (m.id === messageId ? d : m)));
      return "";
    } catch (err) {
      return err.message === "Failed to fetch" ? "Cannot reach the server." : err.message;
    }
  }

  async function copyNotice(notice) {
    setError("");
    try {
      await navigator.clipboard.writeText(notice.text);
      setNote(
        notice.missing.length > 0
          ? "Copied, but " + notice.missing.length + " blank(s) are still empty."
          : "Notice copied."
      );
    } catch (e) {
      setError("Could not copy. Select the text and press Ctrl+C.");
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="shell">
      <Sidebar user={user} page="assistant" onNavigate={onNavigate} />
      <div className="main">
        <div className="bar">
          <div className="bar-title">AI assistant</div>
          <div className="who">
            {user.name} ({user.role})
            <button className="link" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>

        <div className="asp-app">
          <ChatSidebar
            chats={chats}
            activeId={activeId}
            search={search}
            onSearch={setSearch}
            onOpen={openChat}
            onNew={newChat}
            user={user}
            open={sideOpen}
          />
          <section className="asp-chat">
            <header className="asp-head">
              <button className="btn asp-chatsbtn" onClick={() => setSideOpen(!sideOpen)}>
                Chats
              </button>
              <h2>{title}</h2>
              <div className="asp-headright">
                <label htmlFor="asp-template" className="asp-hidden">
                  Template
                </label>
                <select id="asp-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Template: choose automatically</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {activeId && (
                  <button className="ef-danger asp-del" onClick={removeChat}>
                    Delete chat
                  </button>
                )}
              </div>
            </header>

            <div className="asp-scroll">
              {messages.length === 0 && !busy && (
                <div className="asp-welcome">
                  <h3>What notice do you want to make today?</h3>
                  <p>Type the details in one or two sentences. I will pick the template and fill it in.</p>
                  <div className="asp-examples">
                    {EXAMPLES.map((ex) => (
                      <button key={ex} className="asp-example" onClick={() => setInput(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <MessageList messages={messages} busy={busy} onSave={saveNotice} onCopy={copyNotice} />
              <div ref={endRef}></div>
            </div>

            {error && <div className="error asp-msg">{error}</div>}
            {note && <div className="asp-ok asp-msg">{note}</div>}

            <footer className="asp-foot">
              <div className="asp-composer">
                <button className="asp-ib" disabled title="Attaching pictures comes in a later step" aria-label="Attach a picture or file">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 12l-8.5 8.5a5 5 0 01-7-7L14 5a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 8" />
                  </svg>
                </button>
                <label htmlFor="asp-input" className="asp-hidden">
                  Message
                </label>
                <textarea
                  id="asp-input"
                  rows={1}
                  maxLength={MAX_TEXT}
                  placeholder={messages.length > 0 ? "Ask for a change, for example: venue is Lab 3" : "Type what notice you need..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                />
                <button className="asp-ib" disabled title="Voice notes come in a later step" aria-label="Record a voice note">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0014 0M12 18v3" />
                  </svg>
                </button>
                <button className="asp-ib asp-send" onClick={send} disabled={busy || !input.trim()} aria-label="Send">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>
              <div className="asp-hint">
                Only your sentence and the template blanks go to the AI. Do not type student names or private details.
              </div>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
