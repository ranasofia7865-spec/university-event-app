import { useState, useEffect } from "react";
import "./StudentPage.css";

const API = "http://127.0.0.1:8000";

function fmtDate(d) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmt(s) {
  return fmtDate(new Date(s + "T00:00:00"));
}

function whenText(e) {
  return fmt(e.event_date) + (e.end_date ? " to " + fmt(e.end_date) : "");
}

function timeText(e) {
  if (!e.start_time) return "All day";
  const start = e.start_time.slice(0, 5);
  const end = e.end_time ? " to " + e.end_time.slice(0, 5) : "";
  return start + end;
}

function scheduleDays(e) {
  const out = [];
  const start = new Date(e.event_date + "T00:00:00");
  const end = new Date((e.end_date || e.event_date) + "T00:00:00");
  for (
    let d = new Date(start);
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    out.push(fmtDate(d));
  }
  return out;
}

export default function StudentPage({ user, onLogout }) {
  const [items, setItems] = useState(null);
  const [changes, setChanges] = useState([]);
  const [depts, setDepts] = useState({});
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const headers = { Authorization: "Bearer " + user.token };
    async function load(path) {
      const res = await fetch(API + path, { headers: headers });
      if (res.status === 401) {
        onLogout();
        return null;
      }
      return res.json();
    }
    Promise.all([
      load("/reminders/upcoming?days=365"),
      load("/reminders/changes"),
      load("/departments"),
    ])
      .then(([up, ch, dp]) => {
        if (up) setItems(up);
        if (ch) setChanges(ch);
        if (dp) {
          const map = {};
          dp.forEach((d) => {
            map[d.id] = d.name;
          });
          setDepts(map);
        }
      })
      .catch(() => setError("Cannot reach the server. Is the backend running?"));
  }, [user.token]);

  function department(e) {
    if (!e.department_id) return "University-wide";
    return depts[e.department_id] || "Department";
  }

  return (
    <div className="sp">
      <div className="sp-top">
        <div className="sp-logo">Logo</div>
        <div className="sp-name">
          The Women University Multan
          <span>Event Management Reminder App</span>
        </div>
        <div className="sp-nav">
          <span className="sp-who">{user.name}</span>
          <button className="sp-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
      <div className="sp-body">
        <div className="sp-main">
          {error && <div className="sp-error">{error}</div>}
          {changes.length > 0 && (
            <div className="sp-changes">
              {changes.map((c) => (
                <div key={c.id}>
                  {c.status}: {c.title} ({whenText(c)})
                </div>
              ))}
            </div>
          )}
          {!selected && (
            <div>
              <h2>Upcoming events</h2>
              {!items && !error && <p className="sp-muted">Loading...</p>}
              {items && items.length === 0 && (
                <p className="sp-muted">No upcoming events.</p>
              )}
              <div className="sp-list">
                {items &&
                  items.map((e) => (
                    <button key={e.id} className="sp-row" onClick={() => setSelected(e)}>
                      <div className="sp-title">{e.title}</div>
                      <div className="sp-meta">
                        <b>Upcoming event</b> ({e.event_type}) - {whenText(e)}
                      </div>
                    </button>
                  ))}
              </div>
              {items && items.length > 0 && (
                <p className="sp-muted">Click an event to see its details.</p>
              )}
            </div>
          )}
          {selected && (
            <div>
              <button className="sp-back" onClick={() => setSelected(null)}>
                Back to upcoming events
              </button>
              <h2>{selected.title}</h2>
              <div className="sp-meta big">
                <b>Upcoming event</b> ({selected.event_type}) - {selected.label.toLowerCase()}
              </div>
              <div className="sp-detail">
                <div className="sp-line"><span>Date</span><div>{whenText(selected)}</div></div>
                <div className="sp-line"><span>Time</span><div>{timeText(selected)}</div></div>
                <div className="sp-line"><span>Department</span><div>{department(selected)}</div></div>
                <div className="sp-line"><span>Status</span><div>{selected.status}</div></div>
              </div>
              <h3>Schedule</h3>
              <div className="sp-detail">
                {scheduleDays(selected).map((d) => (
                  <div key={d} className="sp-line"><span>{d}</span><div>{timeText(selected)}</div></div>
                ))}
              </div>
              <h3>Description</h3>
              <p className="sp-muted">{selected.description || "No description added."}</p>
            </div>
          )}
        </div>
        <div className="sp-side">
          <div className="sp-pic">University picture goes here</div>
          <div className="sp-uni">The Women University Multan</div>
          <div className="sp-muted">Kutchery Campus, Multan</div>
        </div>
      </div>
    </div>
  );
}
