import { useState, useEffect, useRef } from "react";
import "./TimetablesPage.css";
import Sidebar from "./Sidebar";
import logo from "./logo.png";

const API = "http://127.0.0.1:8000";
const MAX_SLIDES = 50;

function cellKey(day, slot) {
  return day + "|" + slot;
}

function semesterKey(value) {
  const m = /^\s*(\d+)/.exec(value || "");
  return m ? parseInt(m[1], 10) : 99;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Same order as the PDF: program, semester number, section
function sortSlides(items) {
  return [...items].sort(
    (a, b) =>
      compare(a.program, b.program) ||
      semesterKey(a.semester) - semesterKey(b.semester) ||
      compare(a.section, b.section)
  );
}

function nextSection(section) {
  const s = (section || "").trim();
  if (/^[A-Ya-y]$/.test(s)) return String.fromCharCode(s.charCodeAt(0) + 1);
  return "";
}

export default function TimetablesPage({ user, onLogout, onNavigate }) {
  const [list, setList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [term, setTerm] = useState("Fall 2026");
  const [selectedId, setSelectedId] = useState(null);
  const [tt, setTt] = useState(null);
  const [courses, setCourses] = useState([]);
  const [cells, setCells] = useState({});
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ term: "Fall 2026", program: "", semester: "", section: "" });
  const [copyCourses, setCopyCourses] = useState(true);
  const [deptId, setDeptId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const picked = useRef(false);

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

  async function openSheet(id) {
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
    setDirty(false);
  }

  function clearSlide() {
    setTt(null);
    setSelectedId(null);
    setCourses([]);
    setCells({});
    setDirty(false);
  }

  async function loadList(selectId, forceTerm) {
    try {
      const rows = await call("/timetables");
      if (!rows) return;
      setList(rows);
      let t = forceTerm || term;
      if (forceTerm) {
        setTerm(t);
      } else if (!picked.current) {
        const hasDefault = rows.some((x) => x.term === t);
        if (!hasDefault && rows.length > 0) {
          t = rows[0].term;
          setTerm(t);
        }
      }
      picked.current = true;
      const shownNow = sortSlides(rows.filter((x) => x.term === t));
      const keep = selectId || selectedId;
      const found = shownNow.find((x) => x.id === keep);
      const id = found ? found.id : shownNow.length > 0 ? shownNow[0].id : null;
      if (id) {
        await openSheet(id);
      } else {
        clearSlide();
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

  const shown = sortSlides(list.filter((x) => x.term === term));
  const pos = shown.findIndex((x) => x.id === selectedId);

  const terms = Array.from(new Set(list.map((x) => x.term)));
  if (!terms.includes(term)) terms.push(term);
  terms.sort();

  function leaveOk() {
    return !dirty || window.confirm("This slide has unsaved changes. Leave without saving?");
  }

  function goTo(id) {
    if (id === selectedId) return;
    if (!leaveOk()) return;
    setError("");
    setMessage("");
    openSheet(id).catch(fail);
  }

  function goStep(step) {
    const next = shown[pos + step];
    if (next) goTo(next.id);
  }

  function changeTerm(t) {
    if (t === term) return;
    if (!leaveOk()) return;
    setError("");
    setMessage("");
    setTerm(t);
    const first = sortSlides(list.filter((x) => x.term === t))[0];
    if (first) {
      openSheet(first.id).catch(fail);
    } else {
      clearSlide();
    }
  }

  function openNew() {
    if (!leaveOk()) return;
    const base = tt || {};
    setForm({
      term: term,
      program: base.program || "",
      semester: base.semester || "",
      section: nextSection(base.section),
    });
    setCopyCourses(!!tt);
    setError("");
    setMessage("");
    setAdding(true);
  }

  async function create(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const body = {
        program: form.program,
        semester: form.semester,
        section: form.section,
        term: form.term,
      };
      if (user.role === "Admin") body.department_id = deptId ? Number(deptId) : null;
      const created = await call("/timetables", { method: "POST", body: JSON.stringify(body) });
      if (created) {
        let note = "New slide added. Fill it in and click Save.";
        if (copyCourses && tt) {
          const same = courses.filter((c) => c.code.trim() && c.subject.trim());
          if (same.length > 0) {
            try {
              await call("/timetables/" + created.id + "/content", {
                method: "PUT",
                body: JSON.stringify({ courses: same, slots: [] }),
              });
              note = "New slide added with the same course list. Add the classes and click Save.";
            } catch (err) {
              note = "New slide added, but the courses could not be copied: " + err.message;
            }
          }
        }
        setAdding(false);
        await loadList(created.id, created.term);
        setMessage(note);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    setError("");
    setMessage("");
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
    setBusy(true);
    try {
      const d = await call("/timetables/" + tt.id + "/content", {
        method: "PUT",
        body: JSON.stringify({ courses: cleanCourses, slots: slots }),
      });
      if (!d) return false;
      await openSheet(tt.id);
      await refreshList();
      setMessage("Saved");
      return true;
    } catch (err) {
      fail(err);
      return false;
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
        await openSheet(tt.id);
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
    if (!window.confirm("Delete this slide? This cannot be undone.")) return;
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

  async function downloadPdf() {
    if (dirty) {
      const ok = await saveCurrent();
      if (!ok) return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const url = "/timetables/pdf?term=" + encodeURIComponent(term);
      const res = await fetch(API + url, { headers: { Authorization: "Bearer " + user.token } });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) {
        let data = null;
        try {
          data = await res.json();
        } catch (e) {
          data = null;
        }
        setError(data && typeof data.detail === "string" ? data.detail : "Could not make the PDF");
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "Class_Timetables_Department.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMessage("One PDF with " + shown.length + " slides was downloaded.");
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
    setDirty(true);
  }

  function addCourse() {
    setCourses([...courses, { code: "", subject: "", credit_hours: "", faculty: "" }]);
    setDirty(true);
  }

  function removeCourse(i) {
    const old = courses[i].code;
    setCourses(courses.filter((c, idx) => idx !== i));
    const next = {};
    Object.keys(cells).forEach((k) => {
      if (cells[k].course_code !== old) next[k] = cells[k];
    });
    setCells(next);
    setDirty(true);
  }

  function setCell(day, slot, patch) {
    const k = cellKey(day, slot);
    setCells({ ...cells, [k]: { course_code: "", room: "", ...cells[k], ...patch } });
    setDirty(true);
  }

  function deptName(id) {
    if (!id) return "";
    const d = departments.find((x) => x.id === id);
    return d ? d.name : "";
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

        <div className="ttp-toolbar">
          <div className="ttp-view">
            <label htmlFor="t-view">Showing</label>
            <select id="t-view" value={term} onChange={(e) => changeTerm(e.target.value)}>
              {terms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="ttp-count">
              {shown.length} of {MAX_SLIDES} slides
            </span>
          </div>
          <div className="ttp-toolbar-actions">
            <button className="btn ttp-newbtn" onClick={openNew} disabled={busy || list.length >= MAX_SLIDES}>
              + New slide
            </button>
            <button className="primary ttp-pdfbtn" onClick={downloadPdf} disabled={busy || shown.length === 0}>
              Download ONE PDF ({shown.length} slides)
            </button>
          </div>
        </div>

        {adding && (
          <form className="ttp-newform" onSubmit={create}>
            <div className="ttp-newgrid">
              <div>
                <label htmlFor="n-term">Term</label>
                <input
                  id="n-term"
                  placeholder="Fall 2026"
                  value={form.term}
                  onChange={(e) => setForm({ ...form, term: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="n-program">Program</label>
                <input
                  id="n-program"
                  placeholder="BSIT"
                  value={form.program}
                  onChange={(e) => setForm({ ...form, program: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="n-sem">Semester</label>
                <input
                  id="n-sem"
                  placeholder="7th"
                  value={form.semester}
                  onChange={(e) => setForm({ ...form, semester: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="n-sec">Section</label>
                <input
                  id="n-sec"
                  placeholder="C"
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                  required
                />
              </div>
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
            </div>
            {tt && (
              <label className="ttp-check">
                <input type="checkbox" checked={copyCourses} onChange={(e) => setCopyCourses(e.target.checked)} />
                Copy the course list of the slide I am on
              </label>
            )}
            <div className="ttp-newactions">
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Close
              </button>
              <button type="submit" className="primary ttp-save" disabled={busy}>
                Add slide
              </button>
            </div>
          </form>
        )}

        <div className="ttp-body">
          <div className="ttp-strip">
            {shown.map((t, i) => (
              <button
                key={t.id}
                className={"ttp-thumb" + (selectedId === t.id ? " on" : "")}
                onClick={() => goTo(t.id)}
              >
                <span className="ttp-thumb-no">{i + 1}</span>
                <span className="ttp-thumb-text">
                  <b>
                    {t.program} {t.semester}
                  </b>
                  <span>
                    Section {t.section} · {t.slot_count} classes
                  </span>
                  <i className={"ttp-status " + t.status.toLowerCase()}>{t.status}</i>
                </span>
              </button>
            ))}
            <button className="ttp-thumb ttp-thumb-add" onClick={openNew} disabled={busy || list.length >= MAX_SLIDES}>
              + New slide
            </button>
          </div>

          <div className="ttp-stage">
            {error && <div className="error">{error}</div>}
            {message && <div className="ttp-ok">{message}</div>}
            {!tt && <p className="muted">No slide yet. Click + New slide to make the first one.</p>}
            {tt && (
              <div>
                <div className="ttp-slide">
                  <div className="ttp-slide-head">
                    <img src={logo} alt="University logo" className="ttp-logo" />
                    <div className="ttp-titles">
                      <div className="ttp-uni">The Women University Multan</div>
                      {deptName(tt.department_id) && <div className="ttp-dept">{deptName(tt.department_id)}</div>}
                      <div className="ttp-termline">Class-wise Timetable ({tt.term})</div>
                      <div className="ttp-classline">
                        {tt.program} {tt.semester} Semester - Section {tt.section}
                      </div>
                    </div>
                  </div>

                  <div className="ttp-scroll">
                    <table className="ttp-grid">
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

                  <div className="ttp-label">Courses</div>
                  <div className="ttp-scroll">
                    <table className="ttp-courses">
                      <colgroup>
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "46%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "30%" }} />
                        <col style={{ width: "40px" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Course code</th>
                          <th>Subject</th>
                          <th>Cr. hrs.</th>
                          <th>Faculty</th>
                          <th className="ttp-x"></th>
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
                            <td className="ttp-x">
                              <button className="ttp-xbtn" aria-label="Remove this course" onClick={() => removeCourse(i)}>
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn ttp-addrow" onClick={addCourse}>
                    + Add course
                  </button>
                </div>

                <div className="ttp-nav">
                  <button className="btn" onClick={() => goStep(-1)} disabled={busy || pos <= 0}>
                    ◀ Previous slide
                  </button>
                  <span className="ttp-pos">
                    Slide {pos + 1} of {shown.length}
                    {dirty && <i className="ttp-unsaved"> · unsaved changes</i>}
                  </span>
                  <button className="btn" onClick={() => goStep(1)} disabled={busy || pos < 0 || pos >= shown.length - 1}>
                    Next slide ▶
                  </button>
                </div>

                <div className="ttp-actions">
                  <button className="primary ttp-save" onClick={saveCurrent} disabled={busy}>
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
                  <button className="ef-danger" onClick={remove} disabled={busy}>
                    Delete slide
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
