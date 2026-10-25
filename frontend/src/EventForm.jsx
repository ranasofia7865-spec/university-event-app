import { useState } from "react";
import "./EventForm.css";

const API = "http://127.0.0.1:8000";
const TYPES = ["Exam", "Event", "Meeting", "Holiday", "Deadline"];

export default function EventForm({ user, event, departments, onClose, onSaved }) {
  const editing = !!event;
  const [title, setTitle] = useState(event ? event.title : "");
  const [type, setType] = useState(event ? event.event_type : "Event");
  const [startDate, setStartDate] = useState(event ? event.event_date : "");
  const [endDate, setEndDate] = useState(event && event.end_date ? event.end_date : "");
  const [startTime, setStartTime] = useState(
    event && event.start_time ? event.start_time.slice(0, 5) : ""
  );
  const [endTime, setEndTime] = useState(
    event && event.end_time ? event.end_time.slice(0, 5) : ""
  );
  const [description, setDescription] = useState(
    event && event.description ? event.description : ""
  );
  const [deptId, setDeptId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      event_date: startDate,
      end_date: endDate || null,
      start_time: startTime ? startTime + ":00" : null,
      end_time: endTime ? endTime + ":00" : null,
      event_type: type,
    };
    if (!editing) {
      body.department_id = user.role === "Admin" && deptId ? Number(deptId) : null;
    }
    try {
      const res = await fetch(API + (editing ? "/events/" + event.id : "/events"), {
        method: editing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + user.token,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.detail === "string"
            ? data.detail
            : "Please check the form and try again"
        );
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
        <h3>{editing ? "Edit event" : "Add event"}</h3>
        <label htmlFor="ef-title">Event title</label>
        <input
          id="ef-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <div className="ef-row">
          <div>
            <label htmlFor="ef-type">Type</label>
            <select id="ef-type" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {!editing && user.role === "Admin" && (
            <div>
              <label htmlFor="ef-dept">Department</label>
              <select id="ef-dept" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                <option value="">University-wide</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="ef-row">
          <div>
            <label htmlFor="ef-start">Start date</label>
            <input
              id="ef-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="ef-end">End date (optional)</label>
            <input
              id="ef-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="ef-row">
          <div>
            <label htmlFor="ef-st">Start time (optional)</label>
            <input
              id="ef-st"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="ef-et">End time (optional)</label>
            <input
              id="ef-et"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <label htmlFor="ef-desc">Description (optional)</label>
        <textarea
          id="ef-desc"
          rows="3"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {editing && (
          <p className="ef-note">
            If you change the date or time, the event is marked as Rescheduled.
          </p>
        )}
        {error && <div className="ef-error">{error}</div>}
        <div className="ef-actions">
          <button type="button" className="ef-secondary" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="ef-primary" disabled={busy}>
            {busy ? "Saving..." : "Save event"}
          </button>
        </div>
      </form>
    </div>
  );
}
