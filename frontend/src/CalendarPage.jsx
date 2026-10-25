import { useState, useEffect } from "react";
import "./App.css";
import EventForm from "./EventForm";

const API = "http://127.0.0.1:8000";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateKey(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeText(e) {
  if (!e.start_time) return "All day";
  const start = e.start_time.slice(0, 5);
  const end = e.end_time ? " to " + e.end_time.slice(0, 5) : "";
  return start + end;
}

export default function CalendarPage({ user, onLogout }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [changes, setChanges] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [error, setError] = useState("");

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
      load("/events"),
      load("/reminders/upcoming?days=30"),
      load("/reminders/changes"),
      load("/departments"),
    ])
      .then(([ev, up, ch, dp]) => {
        if (ev) setEvents(ev);
        if (up) setUpcoming(up);
        if (ch) setChanges(ch);
        if (dp) setDepartments(dp);
      })
      .catch(() => setError("Cannot reach the server. Is the backend running?"));
  }

  useEffect(() => {
    loadAll();
  }, [user.token]);

  function deptName(e) {
    if (!e.department_id) return "University-wide";
    const d = departments.find((x) => x.id === e.department_id);
    return d ? d.name : "Department";
  }

  async function cancelEvent(e) {
    if (!window.confirm("Cancel this event? Students will see it as cancelled.")) return;
    setDetailError("");
    try {
      const res = await fetch(API + "/events/" + e.id + "/cancel", {
        method: "POST",
        headers: headers,
      });
      const data = await res.json();
      if (!res.ok) {
        setDetailError(data.detail || "Could not cancel the event");
      } else {
        setDetail(null);
        loadAll();
      }
    } catch (err) {
      setDetailError("Cannot reach the server. Is the backend running?");
    }
  }

  function saved() {
    setForm(null);
    setDetail(null);
    loadAll();
  }

  const year = month.getFullYear();
  const m = month.getMonth();
  const offset = (new Date(year, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const todayKey = dateKey(today);

  const cells = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(year, m, 1 - offset + i);
    const key = dateKey(d);
    const dayEvents = events.filter(
      (e) => e.event_date <= key && key <= (e.end_date || e.event_date)
    );
    cells.push({ d: d, key: key, inMonth: d.getMonth() === m, dayEvents: dayEvents });
  }

  const staff = user.role !== "Student";
  const menu = [{ name: "Calendar", on: true }];
  if (staff) {
    menu.push({ name: "Templates", on: false });
    menu.push({ name: "Timetable", on: false });
  }
  if (user.role === "Admin") {
    menu.push({ name: "Users", on: false });
  }

  return (
    <div className="shell">
      <div className="side">
        <div className="side-title">
          Women University Multan
          <span>Event Management</span>
        </div>
        {menu.map((item) => (
          <div key={item.name} className={"side-item" + (item.on ? " on" : " soon")}>
            {item.name}
            {!item.on && <small> soon</small>}
          </div>
        ))}
      </div>
      <div className="main">
        <div className="bar">
          <div className="bar-title">Event Calendar</div>
          <div className="who">
            {user.name} ({user.role})
            <button className="link" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
        <div className="body">
          <div className="cal-wrap">
            <div className="cal-head">
              <div className="cal-title">
                {MONTHS[m]} {year}
              </div>
              <div className="cal-nav">
                <button className="btn" onClick={() => setMonth(new Date(year, m - 1, 1))}>
                  Previous
                </button>
                <button
                  className="btn"
                  onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
                >
                  Today
                </button>
                <button className="btn" onClick={() => setMonth(new Date(year, m + 1, 1))}>
                  Next
                </button>
                {staff && (
                  <button className="add-btn" onClick={() => setForm({ event: null })}>
                    + Add event
                  </button>
                )}
              </div>
            </div>
            {error && <div className="error">{error}</div>}
            <div className="legend">
              <span className="chip exam">Exam</span>
              <span className="chip event">Event</span>
              <span className="chip meeting">Meeting</span>
              <span className="chip holiday">Holiday</span>
              <span className="chip deadline">Deadline</span>
            </div>
            <div className="cal-grid">
              {DAYS.map((n) => (
                <div key={n} className="cal-dh">
                  {n}
                </div>
              ))}
              {cells.map((c) => (
                <div key={c.key} className={"cal-cell" + (c.inMonth ? "" : " out")}>
                  <span className={c.key === todayKey ? "cal-today" : "cal-num"}>
                    {c.d.getDate()}
                  </span>
                  {c.dayEvents.slice(0, 3).map((e) => (
                    <button
                      key={e.id}
                      className={
                        "chip chip-btn " + e.event_type.toLowerCase() +
                        (e.status === "Cancelled" ? " cancelled" : "")
                      }
                      title={e.title}
                      onClick={() => {
                        setDetailError("");
                        setDetail(e);
                      }}
                    >
                      {e.title}
                    </button>
                  ))}
                  {c.dayEvents.length > 3 && (
                    <div className="more">+{c.dayEvents.length - 3} more</div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3>Upcoming (next 30 days)</h3>
            {upcoming.length === 0 && <p className="muted">No upcoming events.</p>}
            {upcoming.slice(0, 6).map((e) => (
              <div key={e.id} className="rem">
                <b>{e.title}</b>
                <div className="muted">
                  {formatDate(e.event_date)}
                  {e.end_date ? " to " + formatDate(e.end_date) : ""}
                </div>
                <div className="rem-label">{e.label}</div>
              </div>
            ))}
            <h3>Changes</h3>
            {changes.length === 0 && <p className="muted">No rescheduled or cancelled events.</p>}
            {changes.map((e) => (
              <div key={e.id} className="rem">
                <b>{e.title}</b>
                <div className="muted">
                  {e.status}: {formatDate(e.event_date)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {form && (
        <EventForm
          user={user}
          event={form.event}
          departments={departments}
          onClose={() => setForm(null)}
          onSaved={saved}
        />
      )}
      {detail && !form && (
        <div className="ef-overlay">
          <div className="ef-card">
            <h3>{detail.title}</h3>
            <div className="ef-line"><span>Type</span><div>{detail.event_type}</div></div>
            <div className="ef-line">
              <span>Date</span>
              <div>
                {formatDate(detail.event_date)}
                {detail.end_date ? " to " + formatDate(detail.end_date) : ""}
              </div>
            </div>
            <div className="ef-line"><span>Time</span><div>{timeText(detail)}</div></div>
            <div className="ef-line"><span>Department</span><div>{deptName(detail)}</div></div>
            <div className="ef-line"><span>Status</span><div>{detail.status}</div></div>
            <div className="ef-line">
              <span>Description</span>
              <div>{detail.description || "No description added."}</div>
            </div>
            {detailError && <div className="ef-error">{detailError}</div>}
            <div className="ef-actions">
              <button className="ef-secondary" onClick={() => setDetail(null)}>
                Close
              </button>
              {staff && detail.status !== "Cancelled" && (
                <button className="ef-danger" onClick={() => cancelEvent(detail)}>
                  Cancel event
                </button>
              )}
              {staff && detail.status !== "Cancelled" && (
                <button className="ef-primary" onClick={() => setForm({ event: detail })}>
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
