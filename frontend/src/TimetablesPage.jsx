import { useState, useEffect } from "react";
import "./TimetablesPage.css";
import Sidebar from "./Sidebar";

const API = "http://127.0.0.1:8000";
const EMPTY_FORM = { program: "", semester: "", section: "", term: "" };

function cellKey(day, slot) {
  return day + "|" + slot;
}

export default function TimetablesPage({ user, onLogout, onNavigate }) {
  const [list, setList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tt, setTt] = useState(null);
  const [courses, setCourses] = useState([]);
  const [cells, setCells] = useState({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deptId, setDeptId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const jsonHeaders = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + user.token,
  };

  async function call(path, options) {
    const res = await fetch(API + path, { ...options, headers: jsonHeaders });
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
      throw new Error(
        data && typeof data.detail === "string" ? data.detail : "Something went wrong"
      );
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

  async function openTimetable(id) {
    const d = await call("/timetables/" + id);
    if (!d) return;
    setSelectedId(id);
    setTt(d);
    setCourses(
      d.courses.map((c) => ({
        code: c.code,
        subject: c.subject,
        credit_hours: c.credit_hours || "",
        faculty: c.faculty || "",
      }))
    );
    const map = {};
    d.slots.forEach((s) => {
      map[cellKey(s.day, s.slot)] = { course_code: s.course_code, room: s.room || "" };
    });
    setCells(map);
  }

  async function loadList(selectId) {
    try {
      const rows = await call("/timetables");
      if (!rows) return;
      setList(rows);
      const keep = selectId || selectedId;
      const found = rows.find((r) => r.id === keep);
      const id = found ? keep : rows.length > 0 ? rows[0].id : null;
      if (id) {
        await openTimetable(id);
      } else {
        setTt(null);
        setSelectedId(null);
      }
    } catch (err) {
      fail(err);
    }
  }

  async function refreshList() {
    const rows = await call("/timetables");
    if (rows) setList(rows);
  }

  useEffect(() => {
    loadList(null);
    call("/departments")
      .then((d) => {
        if (d) setDepartments(d);
      })
      .catch(() => {});
  }, [user.token]);

  async function create(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const body = { ...form };
      if (user.role === "Admin") body.department_id = deptId ? Number(deptId) : null;
      const created = await call("/timetables", { method: "POST", body: JSON.stringify(body) });
      if (created) {
        setAdding(false);
        setForm(EMPTY_FORM);
        await loadList(created.id);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError("");
    setMessage("");
    setBusy(true);
    const slots = [];
    Object.keys(cells).forEach((k) => {
      const c = cells[k];
      if (c.course_code) {
        const parts = k.split("|");
        slots.push({
          day: parts[0],
          slot: parts[1],
          course_code: c.course_code,
          room: c.room || null,
        });
      }
    });
    const cleanCourses = courses.filter((c) => c.code.trim() || c.subject.trim());
    try {
      const d = await call("/timetables/" + tt.id + "/content", {
        method: "PUT",
        body: JSON.stringify({ courses: cleanCourses, slots: slots }),
      });
      if (d) {
        await openTimetable(tt.id);
        await refreshList();
        setMessage("Saved");
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(action) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const d = await call("/timetables/" + tt.id + "/" + action, { method: "POST" });
      if (d) {
        await openTimetable(tt.id);
        await refreshList();
        setMessage(action === "publish" ? "Published. Students can see it now." : "Back to draft");
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this timetable? This cannot be undone.")) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await call("/timetables/" + tt.id, { method: "DELETE" });
      setSelectedId(null);
      await loadList(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  function updateCourse(i, field, value) {
    const old = courses[i].code;
    setCourses(courses.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
    if (field === "code" && old) {
      const next = {};
      Object.keys(cells).forEach((k) => {
        next[k] = cells[k].course_code === old ? { ...cells[k], course_code: value } : cells[k];
      });
      setCells(next);
    }
  }

  function addCourse() {
    setCourses([...courses, { code: "", subject: "", credit_hours: "", faculty: "" }]);
  }

  function removeCourse(i) {
    const old = courses[i].code;
    setCourses(courses.filter((c, idx) => idx !== i));
    const next = {};
    Object.keys(cells).forEach((k) => {
      if (cells[k].course_code !== old) next[k] = cells[k];
    });
    setCells(next);
  }

  function setCell(day, slot, patch) {
    const k = cellKey(day, slot);
    setCells({ ...cells, [k]: { course_code: "", room: "", ...cells[k], ...patch } });
  }

  function deptName(id) {
    if (!id) return "University-wide";
    const d = departments.find((x) => x.id === id);
    return d ? d.name : "Department";
  }

  const codes = courses.map((c) => c.code.trim()).filter((c) => c);

  return (
    <div className="shell">
      <Sidebar user={user} page="timetable" onNavigate={onNavigate} />
      <div className="main">
        <div className="bar">
          <div className="bar-title">Timetable</div>
          <div className="who">
            {user.name} ({user.role})
            <button className="link" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
        <div className="body">
          <div className="tt-list">
            <h3>Class timetables ({list.length} of 50)</h3>
            {list.map((t) => (
              <button
                key={t.id}
                className={"tt-item" + (selectedId === t.id ? " on" : "")}
                onClick={() => {
                  setError("");
                  setMessage("");
                  openTimetable(t.id).catch(fail);
                }}
              >
                <b>
                  {t.program} {t.semester} - {t.section}
                </b>
                <span>
                  {t.term} <i className={"tt-status " + t.status.toLowerCase()}>{t.status}</i>
                </span>
              </button>
            ))}
            {!adding && (
              <button
                className="primary tt-add"
                disabled={list.length >= 50}
                onClick={() => setAdding(true)}
              >
                + Add class timetable
              </button>
            )}
            {adding && (
              <form className="tt-newform" onSubmit={create}>
                <label htmlFor="n-program">Program</label>
                <input
                  id="n-program"
                  placeholder="BSIT"
                  value={form.program}
                  onChange={(e) => setForm({ ...form, program: e.target.value })}
                  required
                />
                <label htmlFor="n-sem">Semester</label>
                <input
                  id="n-sem"
                  placeholder="7th"
                  value={form.semester}
                  onChange={(e) => setForm({ ...form, semester: e.target.value })}
                  required
                />
                <label htmlFor="n-sec">Section</label>
                <input
                  id="n-sec"
                  placeholder="C"
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                  required
                />
                <label htmlFor="n-term">Term</label>
                <input
                  id="n-term"
                  placeholder="Fall 2026"
                  value={form.term}
                  onChange={(e) => setForm({ ...form, term: e.target.value })}
                  required
                />
                {user.role === "Admin" && (
                  <div>
                    <label htmlFor="n-dept">Department</label>
                    <select id="n-dept" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                      <option value="">University-wide</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="tt-newactions">
                  <button type="button" className="btn" onClick={() => setAdding(false)}>
                    Close
                  </button>
                  <button type="submit" className="primary tt-save" disabled={busy}>
                    Create
                  </button>
                </div>
              </form>
            )}
          </div>
          <div className="tt-editor">
            {error && <div className="error">{error}</div>}
            {message && <div className="tt-ok">{message}</div>}
            {!tt && (
              <p className="muted">No timetable yet. Click + Add class timetable to start.</p>
            )}
            {tt && (
              <div>
                <div className="tt-head">
                  <div className="tt-uni">The Women University Multan</div>
                  <div>{deptName(tt.department_id)}</div>
                  <div>Class-wise Timetable ({tt.term})</div>
                  <div className="tt-class">
                    {tt.program} {tt.semester} Semester - Section {tt.section}
                  </div>
                </div>
                <div className="tt-scroll">
                  <table className="tt-grid">
                    <thead>
                      <tr>
                        <th>Days / Time</th>
                        {tt.time_slots.map((s) => (
                          <th key={s}>{s}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tt.days.map((day) => (
                        <tr key={day}>
                          <th>{day}</th>
                          {tt.time_slots.map((slot) => {
                            const c = cells[cellKey(day, slot)] || { course_code: "", room: "" };
                            return (
                              <td key={slot}>
                                <select
                                  aria-label={day + " " + slot + " course"}
                                  value={c.course_code}
                                  onChange={(e) => setCell(day, slot, { course_code: e.target.value })}
                                >
                                  <option value="">-</option>
                                  {codes.map((code) => (
                                    <option key={code} value={code}>
                                      {code}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  aria-label={day + " " + slot + " room"}
                                  placeholder="Room"
                                  value={c.room}
                                  onChange={(e) => setCell(day, slot, { room: e.target.value })}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="tt-sub">Courses</h3>
                <div className="tt-scroll">
                  <table className="tt-courses">
                    <thead>
                      <tr>
                        <th>Course code</th>
                        <th>Subject</th>
                        <th>Cr. hrs.</th>
                        <th>Faculty</th>
                        <th className="noprint"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <input
                              aria-label="Course code"
                              value={c.code}
                              onChange={(e) => updateCourse(i, "code", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Subject"
                              value={c.subject}
                              onChange={(e) => updateCourse(i, "subject", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Credit hours"
                              value={c.credit_hours}
                              onChange={(e) => updateCourse(i, "credit_hours", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Faculty"
                              value={c.faculty}
                              onChange={(e) => updateCourse(i, "faculty", e.target.value)}
                            />
                          </td>
                          <td className="noprint">
                            <button className="btn" onClick={() => removeCourse(i)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn tt-addcourse noprint" onClick={addCourse}>
                  + Add course
                </button>
                <div className="tt-actions noprint">
                  <button className="primary tt-save" onClick={save} disabled={busy}>
                    Save
                  </button>
                  {tt.status === "Draft" ? (
                    <button className="btn" onClick={() => changeStatus("publish")} disabled={busy}>
                      Publish to students
                    </button>
                  ) : (
                    <button className="btn" onClick={() => changeStatus("unpublish")} disabled={busy}>
                      Unpublish
                    </button>
                  )}
                  <button className="btn" onClick={() => window.print()}>
                    Download PDF
                  </button>
                  {tt.status === "Published" && (
                    <a
                      className="btn tt-wa"
                      target="_blank"
                      rel="noreferrer"
                      href={
                        "https://wa.me/?text=" +
                        encodeURIComponent(
                          "The " + tt.program + " " + tt.semester + " Section " + tt.section +
                            " timetable (" + tt.term + ") is published in the Event Management app."
                        )
                      }
                    >
                      Share on WhatsApp
                    </a>
                  )}
                  <button className="ef-danger" onClick={remove} disabled={busy}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
