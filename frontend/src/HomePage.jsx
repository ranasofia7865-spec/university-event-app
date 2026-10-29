import { useState, useEffect } from "react";
import "./HomePage.css";

const API = "http://127.0.0.1:8000";
const FILTERS = ["All", "Timetable", "Datesheet", "FYP", "Event", "Exam", "Holiday", "Notice"];
const MANUAL = ["Timetable", "Datesheet", "FYP", "Event", "Notice"];

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtStamp(s) {
  if (!s) return "";
  return new Date(s + "Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function whenText(e) {
  return fmtDate(e.event_date) + (e.end_date ? " to " + fmtDate(e.end_date) : "");
}

function catOf(e) {
  if (e.event_type === "Holiday") return "Holiday";
  if (e.event_type === "Exam") return "Exam";
  if (e.event_type === "Deadline") return "Notice";
  return "Event";
}

function NotificationForm({ user, departments, onClose, onSaved }) {
  const [category, setCategory] = useState("Notice");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deptId, setDeptId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = {
      category: category,
      title: title.trim(),
      body: body.trim() || null,
      department_id: user.role === "Admin" && deptId ? Number(deptId) : null,
    };
    try {
      const res = await fetch(API + "/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + user.token,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.detail === "string" ? data.detail : "Please check the form");
      } else {
        onSaved();
      }
    } catch (err) {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ef-overlay">
      <form className="ef-card" onSubmit={submit}>
        <h3>Add notification</h3>
        <label htmlFor="nf-cat">Category</label>
        <select id="nf-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          {MANUAL.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label htmlFor="nf-title">Title</label>
        <input
          id="nf-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <label htmlFor="nf-body">Details (optional)</label>
        <textarea
          id="nf-body"
          rows="4"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {user.role === "Admin" && (
          <div>
            <label htmlFor="nf-dept">Who sees it</label>
            <select id="nf-dept" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">Everyone (university-wide)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <div className="ef-error">{error}</div>}
        <div className="ef-actions">
          <button type="button" className="ef-secondary" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="ef-primary" disabled={busy}>
            {busy ? "Saving..." : "Post notification"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function HomePage({ user, onLogout, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [changes, setChanges] = useState([]);
  const [eventCount, setEventCount] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(false);
  const [error, setError] = useState("");

  const staff = user.role !== "Student";
  const calendarPage = staff ? "calendar" : "events";
  const headers = { Authorization: "Bearer " + user.token };

  async function load(path) {
    const res = await fetch(API + path, { headers: headers });
    if (res.status === 401) {
      onLogout();
      return null;
    }
    return res.json();
  }

  function loadAll() {
    return Promise.all([
      load("/notifications"),
      load("/reminders/upcoming?days=30"),
      load("/reminders/changes"),
      load("/events"),
      load("/departments"),
    ])
      .then(([nt, up, ch, ev, dp]) => {
        if (Array.isArray(nt)) setNotifications(nt);
        if (Array.isArray(up)) setUpcoming(up);
        if (Array.isArray(ch)) setChanges(ch);
        if (Array.isArray(ev)) setEventCount(ev.length);
        if (Array.isArray(dp)) setDepartments(dp);
      })
      .catch(() => setError("Cannot reach the server. Is the backend running?"));
  }

  useEffect(() => {
    loadAll();
  }, [user.token]);

  async function removeNotification(id) {
    if (!window.confirm("Delete this notification?")) return;
    try {
      const res = await fetch(API + "/notifications/" + id, {
        method: "DELETE",
        headers: headers,
      });
      if (res.ok) loadAll();
    } catch (err) {
      setError("Cannot reach the server. Is the backend running?");
    }
  }

  function scrollToFeed() {
    const el = document.getElementById("feed");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  const feed = [];
  changes.forEach((e) =>
    feed.push({
      key: "c" + e.id,
      category: "Event",
      title: e.title + " (" + e.status + ")",
      sub: whenText(e),
      alert: true,
    })
  );
  notifications.forEach((n) =>
    feed.push({
      key: "n" + n.id,
      category: n.category,
      title: n.title,
      sub: "Posted " + fmtStamp(n.created_at),
      body: n.body,
      noticeId: n.id,
    })
  );
  upcoming.forEach((e) =>
    feed.push({
      key: "e" + e.id,
      category: catOf(e),
      title: e.title,
      sub: whenText(e) + " - " + e.label.toLowerCase(),
      body: e.description,
    })
  );
  const shown = feed.filter((f) => filter === "All" || f.category === filter);

  const heroItem = notifications.find((n) => n.category === "Datesheet") || notifications[0];
  const hero = heroItem
    ? {
        tag: heroItem.category.toUpperCase(),
        title: heroItem.title,
        sub: heroItem.body || "Posted " + fmtStamp(heroItem.created_at),
      }
    : {
        tag: "WELCOME",
        title: "The Women University Multan",
        sub: "Timetables, datesheets and notices in one place.",
      };

  const tiles = [
    { name: "Timetable", action: staff ? () => onNavigate("timetable") : null },
    { name: "Datesheet", action: null },
    { name: "Academic calendar", action: () => onNavigate(calendarPage) },
    { name: "FYP notices", action: () => { setFilter("FYP"); scrollToFeed(); } },
    { name: "Bonafide certificate", action: null },
    { name: "Department PDF", action: null },
  ];

  const stats = [
    [eventCount, "Academic dates"],
    [notifications.length, "Notices posted"],
    [upcoming.length, "Events in 30 days"],
    [changes.length, "Changes"],
  ];

  return (
    <div className="hp">
      <div className="hp-strip">
        <span>Institute of Computer Science and Information Technology</span>
        <span>
          {user.name} ({user.role})
          <button className="hp-link" onClick={onLogout}>
            Logout
          </button>
        </span>
      </div>
      <div className="hp-head">
        <div className="hp-logo">LOGO</div>
        <div className="hp-name">
          The Women University Multan
          <span>Event Management Reminder App</span>
        </div>
        <div className="hp-nav">
          <span className="on">Home</span>
          <button onClick={staff ? () => onNavigate("timetable") : undefined} className={staff ? "" : "off"}>Timetables</button>
          <button className="off">Datesheets</button>
          <button onClick={() => onNavigate(calendarPage)}>Calendar</button>
          <button onClick={() => { setFilter("FYP"); scrollToFeed(); }}>FYP</button>
          <button className="off">Certificates</button>
        </div>
      </div>
      <div className="hp-hero">
        <div className="hp-hero-text">
          <span className="hp-tag">{hero.tag}</span>
          <h1>{hero.title}</h1>
          <p>{hero.sub}</p>
          <button className="hp-cta" onClick={scrollToFeed}>
            See all notifications
          </button>
        </div>
        <div className="hp-photo">University photo goes here</div>
      </div>
      <div className="hp-tiles">
        {tiles.map((t) => (
          <button
            key={t.name}
            className={"hp-tile" + (t.action ? "" : " off")}
            onClick={t.action || undefined}
          >
            <span className="hp-dot">{t.name.charAt(0)}</span>
            <b>{t.name}</b>
            {!t.action && <small>coming soon</small>}
          </button>
        ))}
      </div>
      <div className="hp-latest">
        <span className="hp-latest-label">LATEST</span>
        <span className="hp-latest-text">
          {feed.length === 0
            ? "No notifications yet."
            : feed
                .slice(0, 3)
                .map((f) => f.title)
                .join("   |   ")}
        </span>
      </div>
      {error && <div className="hp-error">{error}</div>}
      <div className="hp-section" id="feed">
        <div className="hp-sechead">
          <h2>Latest notifications</h2>
          <div className="hp-chips">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={"hp-chip" + (filter === f ? " on" : "")}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 && <p className="hp-muted">Nothing here yet.</p>}
        {shown.map((f) => (
          <div key={f.key} className={"hp-card" + (f.alert ? " alert" : "")}>
            <span className={"hp-cat " + f.category.toLowerCase()}>{f.category}</span>
            <div className="hp-card-main">
              <div className="hp-card-title">{f.title}</div>
              <div className="hp-muted">{f.sub}</div>
              {open === f.key && f.body && <div className="hp-body">{f.body}</div>}
            </div>
            {f.body && (
              <button className="hp-btn" onClick={() => setOpen(open === f.key ? null : f.key)}>
                {open === f.key ? "Hide" : "Details"}
              </button>
            )}
            {staff && f.noticeId && (
              <button className="hp-btn danger" onClick={() => removeNotification(f.noticeId)}>
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="hp-section">
        <h2>Department PDFs</h2>
        <div className="hp-pdfs">
          {[
            ["Datesheet", "Mid-term datesheet, all classes"],
            ["Timetable", "Lecture timetable, all classes"],
            ["Calendar", "Academic calendar 2026-27"],
          ].map((p) => (
            <div key={p[1]} className="hp-pdf">
              <div className="hp-muted">{p[0]}</div>
              <b>{p[1]}</b>
              <p className="hp-muted">One PDF for the whole department</p>
              <button className="hp-btn off" disabled>
                Coming soon
              </button>
            </div>
          ))}
        </div>
      </div>
      {staff && (
        <div className="hp-staff">
          <div className="hp-muted">Staff only. Students do not see this bar.</div>
          <div className="hp-staffbtns">
            <button className="hp-solid" onClick={() => setForm(true)}>
              + Add notification
            </button>
            <button className="hp-solid" onClick={() => onNavigate("timetable")}>
              + Add class timetable
            </button>
            <button className="hp-solid off" disabled>
              + Add datesheet
            </button>
            <button className="hp-outline" onClick={() => onNavigate("templates")}>
              Templates
            </button>
            <button className="hp-outline off" disabled>
              Import students
            </button>
          </div>
        </div>
      )}
      <div className="hp-stats">
        {stats.map((s) => (
          <div key={s[1]}>
            <div className="hp-num">{s[0]}</div>
            <div>{s[1]}</div>
          </div>
        ))}
      </div>
      <div className="hp-foot">
        The Women University Multan, Institute of Computer Science and Information Technology
        <br />
        Kutchery Campus, Multan
      </div>
      {form && (
        <NotificationForm
          user={user}
          departments={departments}
          onClose={() => setForm(false)}
          onSaved={() => {
            setForm(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}
