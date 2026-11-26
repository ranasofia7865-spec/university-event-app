import { useState, useEffect, useRef } from "react";
import "./AssistantPage.css";
import Sidebar from "./Sidebar";
import { voiceSupported, startRecording } from "./voice";
import { prepareAttachment } from "./attach";
import { downloadBlob, printBlob } from "./pdfTools";

const API = "http://127.0.0.1:8000";
const MAX_TEXT = 600;
const MAX_SECONDS = 60;
const EXAMPLES = [
  "Make a PDF datesheet from this (attach a picture or PDF of it)",
  "Make a timetable PDF from this picture",
  "Write a notice about the final term exams",
  "Remind all students about the spring fee submission last date",
  "Write a notice for the winter vacations",
  "When do the mid-term exams start?",
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
    const problem = await onSave(message.id, { values: vals });
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

export function AttachmentChip({ attachment, onRemove }) {
  return (
    <div className="asp-attach">
      {attachment.preview ? (
        <img className="asp-attach-thumb" src={attachment.preview} alt="Attached picture" />
      ) : (
        <span className="asp-attach-pdf">PDF</span>
      )}
      <span className="asp-attach-name">{attachment.name}</span>
      <button className="asp-attach-x" onClick={onRemove} aria-label="Remove the attached file" title="Remove">
        ×
      </button>
    </div>
  );
}

export function WrittenNotice({ message, onSave, onCopy, onPublish }) {
  const notice = message.notice;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  function startEdit() {
    setTitle(notice.title);
    setBody(notice.body);
    setErr("");
    setEditing(true);
  }

  async function save() {
    setWorking(true);
    setErr("");
    const problem = await onSave(message.id, { title: title, body: body });
    setWorking(false);
    if (problem) setErr(problem);
    else setEditing(false);
  }

  async function publish() {
    setWorking(true);
    setErr("");
    const problem = await onPublish(message.id);
    setWorking(false);
    if (problem) setErr(problem);
  }

  return (
    <div className="asp-notice">
      <div className="asp-chips asp-chips-top">
        <span className="asp-chip">{notice.category}</span>
        <span className="asp-chip">For: {notice.audience}</span>
        {notice.published && <span className="asp-chip done">Published to students</span>}
      </div>
      {editing ? (
        <div className="asp-edit asp-edit-wide">
          <div className="asp-edit-field">
            <label htmlFor={"t-" + message.id}>Title</label>
            <input id={"t-" + message.id} value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="asp-edit-field">
            <label htmlFor={"b-" + message.id}>Notice text</label>
            <textarea id={"b-" + message.id} rows={12} value={body} maxLength={2500} onChange={(e) => setBody(e.target.value)} />
          </div>
          {err && <div className="error">{err}</div>}
          <div className="asp-row">
            <button className="primary asp-btn" onClick={save} disabled={working}>
              {working ? "Saving..." : "Save changes"}
            </button>
            <button className="btn asp-btn" onClick={() => setEditing(false)} disabled={working}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="asp-notice-title">{notice.title}</div>
          <div className="asp-body">{notice.body}</div>
          {err && <div className="error">{err}</div>}
          <div className="asp-row">
            {!notice.published && (
              <button className="primary asp-btn" onClick={publish} disabled={working}>
                {working ? "Publishing..." : "Publish to students"}
              </button>
            )}
            {!notice.published && (
              <button className="btn asp-btn" onClick={startEdit} disabled={working}>
                Edit
              </button>
            )}
            <button className="btn asp-btn" onClick={() => onCopy(notice)}>
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const p = iso.split("-");
  return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : iso;
}

function SheetPreview({ kind, sheet }) {
  if (kind === "datesheet") {
    return (
      <div className="asp-scroll-x">
        <table className="asp-mini asp-ds">
          <thead>
            <tr>
              <th>Sr</th>
              <th>Date</th>
              <th>Subject</th>
              <th>Time</th>
              <th>Venue</th>
              <th>Instructor</th>
              <th>Duty</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{formatDate(r.date)}</td>
                <td>{r.subject}</td>
                <td>{r.time}</td>
                <td>{r.venue}</td>
                <td>{r.instructor}</td>
                <td className="asp-duty">{r.duty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const cell = {};
  sheet.slots.forEach((c) => {
    cell[c.day + "|" + c.slot] = c;
  });
  return (
    <div className="asp-scroll-x">
      <table className="asp-mini">
        <thead>
          <tr>
            <th>Days / Time</th>
            {sheet.time_slots.map((t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.days.map((d) => (
            <tr key={d}>
              <th>{d}</th>
              {sheet.time_slots.map((t) => {
                const c = cell[d + "|" + t];
                return <td key={t}>{c ? c.course_code + (c.room ? " (" + c.room + ")" : "") : ""}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {sheet.courses.length > 0 && (
        <table className="asp-mini asp-courses-mini">
          <thead>
            <tr>
              <th>Code</th>
              <th>Subject</th>
              <th>Cr. hrs.</th>
              <th>Faculty</th>
            </tr>
          </thead>
          <tbody>
            {sheet.courses.map((c, i) => (
              <tr key={i}>
                <td>{c.code}</td>
                <td>{c.subject}</td>
                <td>{c.credit_hours}</td>
                <td>{c.faculty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GeneralPreview({ doc }) {
  return (
    <div className="asp-gen">
      {doc.subtitle && <div className="asp-gen-sub">{doc.subtitle}</div>}
      {doc.blocks.map((b, i) => {
        if (b.type === "heading") return <h4 key={i}>{b.text}</h4>;
        if (b.type === "paragraph") return <p key={i}>{b.text}</p>;
        if (b.type === "bullets")
          return (
            <ul key={i}>
              {b.items.map((t, j) => (
                <li key={j}>{t}</li>
              ))}
            </ul>
          );
        if (b.type === "numbered")
          return (
            <ol key={i}>
              {b.items.map((t, j) => (
                <li key={j}>{t}</li>
              ))}
            </ol>
          );
        return (
          <div key={i} className="asp-scroll-x">
            <table className="asp-mini">
              <thead>
                <tr>
                  {b.columns.map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {doc.signature && doc.signature.length > 0 && (
        <div className="asp-gen-sign">
          {doc.signature.map((l, i) => (
            <div key={i}>{i === 0 ? <b>{l}</b> : l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentCard({ message, onPdf, onSaveDrafts, onOpenScreen }) {
  const doc = message.notice.document;
  const [open, setOpen] = useState(0);
  const [working, setWorking] = useState("");
  const [err, setErr] = useState("");
  const [failed, setFailed] = useState([]);
  const savedCount = (message.notice.saved || []).length;
  const screen = doc.kind === "datesheet" ? "Datesheet" : "Timetable";

  async function saveDrafts() {
    setWorking("save");
    setErr("");
    setFailed([]);
    const r = await onSaveDrafts(message.id);
    setWorking("");
    if (r.problem) setErr(r.problem);
    setFailed(r.failed || []);
  }

  async function run(mode) {
    setWorking(mode);
    setErr("");
    const problem = await onPdf(message.id, mode, doc);
    setWorking("");
    if (problem) setErr(problem);
  }

  return (
    <div className="asp-notice">
      <div className="asp-chips asp-chips-top">
        <span className="asp-chip">{doc.kind === "datesheet" ? "Datesheet" : doc.kind === "timetable" ? "Timetable" : "Document"}</span>
        {doc.term && <span className="asp-chip">{doc.term}</span>}
        {doc.kind !== "document" && (
          <span className="asp-chip">
            {doc.sheets.length} class{doc.sheets.length === 1 ? "" : "es"}
          </span>
        )}
        {savedCount > 0 && <span className="asp-chip done">{savedCount} saved as drafts</span>}
      </div>
      <div className="asp-notice-title">{doc.title}</div>
      <p className="asp-doc-note">Please check the details below, then download or print the PDF.</p>
      {doc.kind === "document" && <GeneralPreview doc={doc} />}
      {doc.kind !== "document" && doc.sheets.map((s, i) => (
        <div key={i} className="asp-sheet">
          <button className={"asp-sheet-head" + (open === i ? " on" : "")} onClick={() => setOpen(open === i ? -1 : i)}>
            <b>
              {s.program} {s.semester} {s.section ? "Section " + s.section : ""}
            </b>
            <span>{doc.kind === "datesheet" ? s.rows.length + " papers" : s.slots.length + " classes"}</span>
          </button>
          {open === i && <SheetPreview kind={doc.kind} sheet={s} />}
        </div>
      ))}
      {err && <div className="error">{err}</div>}
      <div className="asp-row">
        <button className="primary asp-btn" onClick={() => run("download")} disabled={!!working}>
          {working === "download" ? "Making PDF..." : "Download PDF"}
        </button>
        <button className="btn asp-btn" onClick={() => run("print")} disabled={!!working}>
          {working === "print" ? "Preparing..." : "Print"}
        </button>
        {doc.kind !== "document" && (
          <button className="btn asp-btn" onClick={saveDrafts} disabled={!!working}>
            {working === "save" ? "Saving..." : "Save to the " + screen + " screen"}
          </button>
        )}
        {savedCount > 0 && (
          <button className="btn asp-btn" onClick={() => onOpenScreen(doc.kind)}>
            Open the {screen} screen
          </button>
        )}
      </div>
      {failed.length > 0 && (
        <div className="asp-failed">
          <b>These could not be saved:</b>
          <ul>
            {failed.map((f, i) => (
              <li key={i}>
                <b>{f.label}:</b> {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MessageList({ messages, busy, onSave, onCopy, onPublish, onPdf, onSaveDrafts, onOpenScreen }) {
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
            {m.notice && m.notice.body && (
              <WrittenNotice message={m} onSave={onSave} onCopy={onCopy} onPublish={onPublish} />
            )}
            {m.notice && m.notice.document && <DocumentCard message={m} onPdf={onPdf} onSaveDrafts={onSaveDrafts} onOpenScreen={onOpenScreen} />}
            {m.notice && !m.notice.body && !m.notice.document && <NoticeCard message={m} onSave={onSave} onCopy={onCopy} />}
          </div>
        )
      )}
      {busy && <div className="asp-bot asp-thinking">Thinking... a file can take up to a minute.</div>}
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
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [attachment, setAttachment] = useState(null);
  const recRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [listening, setListening] = useState(false);

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

  async function pickFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setNote("");
    try {
      setAttachment(await prepareAttachment(file));
    } catch (err) {
      setAttachment(null);
      setError(err.message);
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && !attachment) || busy) return;
    setError("");
    setNote("");
    setBusy(true);
    const tempId = "tmp-" + Date.now();
    const sentFile = attachment;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: (text + (sentFile ? "\n[Attached file: " + sentFile.name + "]" : "")).trim() },
    ]);
    setInput("");
    try {
      let id = activeId;
      if (!id) {
        const c = await call("/assistant/chats", { method: "POST" });
        if (!c) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setInput(text);
          return;
        }
        id = c.id;
        setActiveId(id);
      }
      const d = await call("/assistant/chats/" + id + "/messages", {
        method: "POST",
        body: JSON.stringify({
          text: text,
          template_id: templateId ? Number(templateId) : null,
          attachment: sentFile ? { name: sentFile.name, mime: sentFile.mime, data: sentFile.data } : null,
        }),
      });
      if (d) {
        setMessages((prev) => [...prev.filter((m) => m.id !== tempId), ...d.messages]);
        setTitle(d.chat.title);
        setAttachment(null);
        await loadChats();
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!recording) return undefined;
    const timer = setInterval(() => {
      const s = recRef.current ? Math.floor(recRef.current.seconds()) : 0;
      setSeconds(s);
      if (s >= MAX_SECONDS) stopVoice();
    }, 400);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      if (recRef.current) recRef.current.cancel();
    };
  }, []);

  async function startVoice() {
    setError("");
    setNote("");
    if (!voiceSupported()) {
      setError("This browser cannot record voice. Please use Google Chrome.");
      return;
    }
    try {
      recRef.current = await startRecording();
      setSeconds(0);
      setRecording(true);
    } catch (err) {
      recRef.current = null;
      setError(
        err && err.name === "NotAllowedError"
          ? "The microphone is blocked. Click the lock icon next to the address, allow the microphone, and try again."
          : "No microphone was found. Check that it is connected."
      );
    }
  }

  async function stopVoice() {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setRecording(false);
    setListening(true);
    try {
      const wav = await rec.stop();
      const res = await fetch(API + "/assistant/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/wav", Authorization: "Bearer " + user.token },
        body: wav,
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
      if (!res.ok) {
        setError(data && typeof data.detail === "string" ? data.detail : "Could not turn the voice into text.");
        return;
      }
      setInput((prev) => (prev.trim() ? prev.trim() + " " + data.text : data.text).slice(0, MAX_TEXT));
      setNote("Voice converted to text. Check it, fix it if needed, then press Send.");
      if (inputRef.current) inputRef.current.focus();
    } catch (err) {
      setError(
        err && err.message === "Failed to fetch"
          ? "Cannot reach the server. Is the backend running?"
          : "Could not read the recording. Please try again."
      );
    } finally {
      setListening(false);
    }
  }

  function toggleVoice() {
    if (listening) return;
    if (recording) stopVoice();
    else startVoice();
  }

  function soon(what) {
    setError("");
    setNote(what + " are coming in the next update. For now, type your request.");
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

  async function documentPdf(messageId, mode, doc) {
    try {
      const res = await fetch(API + "/assistant/messages/" + messageId + "/pdf", {
        method: "POST",
        headers: { Authorization: "Bearer " + user.token },
      });
      if (res.status === 401) {
        onLogout();
        return "";
      }
      if (!res.ok) {
        let data = null;
        try {
          data = await res.json();
        } catch (e) {
          data = null;
        }
        return data && typeof data.detail === "string" ? data.detail : "The PDF could not be built.";
      }
      const blob = await res.blob();
      if (mode === "print") {
        printBlob(blob);
        setNote("The print window is opening.");
      } else {
        downloadBlob(blob, (doc.title || "Document").replace(/[^A-Za-z0-9]+/g, "_") + ".pdf");
        setNote("PDF downloaded.");
      }
      return "";
    } catch (err) {
      return err.message === "Failed to fetch" ? "Cannot reach the server." : "The PDF could not be built.";
    }
  }

  async function saveDrafts(messageId) {
    try {
      const d = await call("/assistant/messages/" + messageId + "/save-drafts", { method: "POST" });
      if (!d) return { problem: "", failed: [] };
      setMessages((prev) => prev.map((m) => (m.id === messageId ? d.message : m)));
      if (d.saved.length > 0) {
        setNote(d.saved.length + " saved as drafts. Open the screen to check and publish them.");
      }
      return { problem: "", failed: d.failed };
    } catch (err) {
      return { problem: err.message === "Failed to fetch" ? "Cannot reach the server." : err.message, failed: [] };
    }
  }

  function openScreen(kind) {
    onNavigate(kind === "datesheet" ? "datesheet" : "timetable");
  }

  async function publishNotice(messageId) {
    const who = user.role === "Admin" ? "ALL students of the university" : "the students of your department";
    if (!window.confirm("Publish this notice to " + who + " now? They will see it on their Home page.")) return "";
    try {
      const d = await call("/assistant/messages/" + messageId + "/publish", { method: "POST" });
      if (d) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? d : m)));
        setNote("Published. Students can now see it on their Home page.");
      }
      return "";
    } catch (err) {
      return err.message === "Failed to fetch" ? "Cannot reach the server." : err.message;
    }
  }

  async function saveNotice(messageId, payload) {
    try {
      const d = await call("/assistant/messages/" + messageId, {
        method: "PATCH",
        body: JSON.stringify(payload),
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
      if (notice.body) {
        await navigator.clipboard.writeText(notice.title + "\n\n" + notice.body);
        setNote("Notice copied.");
      } else {
        await navigator.clipboard.writeText(notice.text);
        setNote(
          notice.missing.length > 0
            ? "Copied, but " + notice.missing.length + " blank(s) are still empty."
            : "Notice copied."
        );
      }
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
                  <p>Ask me to write any university notice, or ask a question about the calendar. I read your university calendar and write the full notice.</p>
                  <div className="asp-examples">
                    {EXAMPLES.map((ex) => (
                      <button key={ex} className="asp-example" onClick={() => setInput(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <MessageList messages={messages} busy={busy} onSave={saveNotice} onCopy={copyNotice} onPublish={publishNotice} onPdf={documentPdf} onSaveDrafts={saveDrafts} onOpenScreen={openScreen} />
              <div ref={endRef}></div>
            </div>

            {error && <div className="error asp-msg">{error}</div>}
            {note && <div className="asp-ok asp-msg">{note}</div>}

            <footer className="asp-foot">
              {recording && (
                <div className="asp-recbar">
                  <span className="asp-dot"></span>Recording {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}. Speak your
                  notice, then click the red button to stop.
                </div>
              )}
              {listening && <div className="asp-recbar listening">Turning your voice into text...</div>}
              {attachment && <AttachmentChip attachment={attachment} onRemove={() => setAttachment(null)} />}
              <div className="asp-composer">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="asp-hidden"
                  onChange={pickFile}
                  tabIndex={-1}
                />
                <button
                  className="asp-ib asp-tool"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  disabled={busy}
                  title="Attach a picture or PDF"
                  aria-label="Attach a picture or PDF"
                >
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
                  placeholder={messages.length > 0 ? "Ask for a change, for example: make it shorter" : "Ask me to write a notice or make a PDF..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  ref={inputRef}
                />
                <button
                  className={"asp-ib asp-tool" + (recording ? " rec" : "")}
                  onClick={toggleVoice}
                  disabled={listening}
                  title={recording ? "Stop recording" : "Record a voice note"}
                  aria-label={recording ? "Stop recording" : "Record a voice note"}
                >
                  {recording ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0014 0M12 18v3" />
                    </svg>
                  )}
                </button>
                <button className="asp-ib asp-send" onClick={send} disabled={busy || recording || listening || (!input.trim() && !attachment)} aria-label="Send">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>
              <div className="asp-hint">
                Your sentence, voice note or attached file goes to Google's AI to make the notice. Do not say or type student names or private details.
              </div>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
