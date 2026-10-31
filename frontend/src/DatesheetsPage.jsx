import { useState, useEffect, useRef } from "react";
import "./DatesheetsPage.css";
import Sidebar from "./Sidebar";
import logo from "./logo.png";

const API = "http://127.0.0.1:8000";
const MAX_SLIDES = 50;
const EMPTY_ROW = { exam_date: "", subject: "", time_text: "", venue: "", instructor: "", duty: "" };
const EMPTY_SIGS = { incharge_bsit: "", incharge_bscs: "", director: "" };

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

function noEnter(e) {
  if (e.key === "Enter") e.preventDefault();
}

export default function DatesheetsPage({ user, onLogout, onNavigate }) {
  const [list, setList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [kind, setKind] = useState("Mid-term");
  const [term, setTerm] = useState("Fall 2026");
  const [selectedId, setSelectedId] = useState(null);
  const [ds, setDs] = useState(null);
  const [rows, setRows] = useState([]);
  const [sigs, setSigs] = useState(EMPTY_SIGS);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: "Mid-term", term: "Fall 2026", program: "", semester: "", session: "", section: "" });
  const [copyContent, setCopyContent] = useState(true);
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
    const d = await call("/datesheets/" + id);
    if (!d) return;
    setSelectedId(id);
    setDs(d);
    setRows(
      d.rows.map((r) => ({
        exam_date: r.exam_date || "",
        subject: r.subject || "",
        time_text: r.time_text || "",
        venue: r.venue || "",
        instructor: r.instructor || "",
        duty: r.duty || "",
      }))
    );
    setSigs({
      incharge_bsit: d.incharge_bsit || "",
      incharge_bscs: d.incharge_bscs || "",
      director: d.director || "",
    });
    setDirty(false);
  }

  function clearSlide() {
    setDs(null);
    setSelectedId(null);
    setRows([]);
    setSigs(EMPTY_SIGS);
    setDirty(false);
  }

  async function loadList(selectId, forceKind, forceTerm) {
    try {
      const data = await call("/datesheets");
      if (!data) return;
      setList(data);
      let k = forceKind || kind;
      let t = forceTerm || term;
      if (forceKind) {
        setKind(k);
        setTerm(t);
      } else if (!picked.current) {
        const hasDefault = data.some((x) => x.kind === k && x.term === t);
        if (!hasDefault && data.length > 0) {
          k = data[0].kind;
          t = data[0].term;
          setKind(k);
          setTerm(t);
        }
      }
      picked.current = true;
      const shownNow = sortSlides(data.filter((x) => x.kind === k && x.term === t));
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
    const data = await call("/datesheets");
    if (data) setList(data);
  }

  useEffect(() => {
    loadList(null);
    call("/departments")
      .then((d) => {
        if (d) setDepartments(d);
      })
      .catch(() => {});
  }, [user.token]);

  const shown = sortSlides(list.filter((x) => x.kind === kind && x.term === term));
  const pos = shown.findIndex((x) => x.id === selectedId);

  const comboKeys = Array.from(new Set(list.map((x) => x.kind + "|" + x.term)));
  if (!comboKeys.includes(kind + "|" + term)) comboKeys.push(kind + "|" + term);
  comboKeys.sort();

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

  function changeView(key) {
    const cut = key.indexOf("|");
    const k = key.slice(0, cut);
    const t = key.slice(cut + 1);
    if (k === kind && t === term) return;
    if (!leaveOk()) return;
    setError("");
    setMessage("");
    setKind(k);
    setTerm(t);
    const first = sortSlides(list.filter((x) => x.kind === k && x.term === t))[0];
    if (first) {
      openSheet(first.id).catch(fail);
    } else {
      clearSlide();
    }
  }

  function openNew() {
    if (!leaveOk()) return;
    const base = ds || {};
    setForm({
      kind: kind,
      term: term,
      program: base.program || "",
      semester: base.semester || "",
      session: base.session || "",
      section: nextSection(base.section),
    });
    setCopyContent(!!ds);
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
      const body = { ...form };
      if (user.role === "Admin") body.department_id = deptId ? Number(deptId) : null;
      if (copyContent && ds) body.copy_from = ds.id;
      const created = await call("/datesheets", { method: "POST", body: JSON.stringify(body) });
      if (created) {
        setAdding(false);
        await loadList(created.id, created.kind, created.term);
        setMessage("New slide added. Fill it in and click Save.");
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
    const used = rows.filter((r) => r.subject.trim() || r.exam_date);
    for (let i = 0; i < used.length; i++) {
      if (!used[i].exam_date) {
        setError("Row " + (i + 1) + ": pick a date.");
        return false;
      }
      if (!used[i].subject.trim()) {
        setError("Row " + (i + 1) + ": write the subject.");
        return false;
      }
    }
    setBusy(true);
    try {
      const d = await call("/datesheets/" + ds.id, {
        method: "PUT",
        body: JSON.stringify({ ...sigs, rows: used }),
      });
      if (!d) return false;
      await openSheet(ds.id);
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
      const d = await call("/datesheets/" + ds.id + "/" + action, { method: "POST" });
      if (d) {
        await openSheet(ds.id);
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
      await call("/datesheets/" + ds.id, { method: "DELETE" });
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
      const url = "/datesheets/pdf?kind=" + encodeURIComponent(kind) + "&term=" + encodeURIComponent(term);
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
      link.download = kind.replace(" ", "_") + "_Datesheet_Department.pdf";
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

  function setRow(i, patch) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function changeInstructor(i, value) {
    const r = rows[i];
    const patch = { instructor: value };
    if (r.duty === "" || r.duty === r.instructor) patch.duty = value;
    setRow(i, patch);
  }

  function addRow() {
    const last = rows.length > 0 ? rows[rows.length - 1] : null;
    setRows([
      ...rows,
      { ...EMPTY_ROW, time_text: last ? last.time_text : "", venue: last ? last.venue : "" },
    ]);
    setDirty(true);
  }

  function removeRow(i) {
    setRows(rows.filter((r, idx) => idx !== i));
    setDirty(true);
  }

  function setSig(patch) {
    setSigs({ ...sigs, ...patch });
    setDirty(true);
  }

  return (
    <div className="shell">
      <Sidebar user={user} page="datesheet" onNavigate={onNavigate} />
      <div className="main">
        <div className="bar">
          <div className="bar-title">Datesheets</div>
          <div className="who">
            {user.name} ({user.role})
            <button className="link" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>

        <div className="dsp-toolbar">
          <div className="dsp-view">
            <label htmlFor="d-view">Showing</label>
            <select id="d-view" value={kind + "|" + term} onChange={(e) => changeView(e.target.value)}>
              {comboKeys.map((key) => {
                const cut = key.indexOf("|");
                return (
                  <option key={key} value={key}>
                    {key.slice(0, cut)}, {key.slice(cut + 1)}
                  </option>
                );
              })}
            </select>
            <span className="dsp-count">
              {shown.length} of {MAX_SLIDES} slides
            </span>
          </div>
          <div className="dsp-toolbar-actions">
            <button className="btn dsp-newbtn" onClick={openNew} disabled={busy || list.length >= MAX_SLIDES}>
              + New slide
            </button>
            <button className="primary dsp-pdfbtn" onClick={downloadPdf} disabled={busy || shown.length === 0}>
              Download ONE PDF ({shown.length} slides)
            </button>
          </div>
        </div>

        {adding && (
          <form className="dsp-newform" onSubmit={create}>
            <div className="dsp-newgrid">
              <div>
                <label htmlFor="n-kind">Type</label>
                <select id="n-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option>Mid-term</option>
                  <option>Final term</option>
                </select>
              </div>
              <div>
                <label htmlFor="n-term">Term</label>
                <input id="n-term" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="n-program">Program</label>
                <input
                  id="n-program"
                  placeholder="BSCS"
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
                <label htmlFor="n-session">Session</label>
                <input
                  id="n-session"
                  placeholder="2023-2027"
                  value={form.session}
                  onChange={(e) => setForm({ ...form, session: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="n-section">Section</label>
                <input
                  id="n-section"
                  placeholder="A"
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
            {ds && (
              <label className="dsp-check">
                <input type="checkbox" checked={copyContent} onChange={(e) => setCopyContent(e.target.checked)} />
                Copy the rows and signatures of the slide I am on (saved version)
              </label>
            )}
            <div className="dsp-newactions">
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Close
              </button>
              <button type="submit" className="primary dsp-save" disabled={busy}>
                Add slide
              </button>
            </div>
          </form>
        )}

        <div className="dsp-body">
          <div className="dsp-strip">
            {shown.map((t, i) => (
              <button
                key={t.id}
                className={"dsp-thumb" + (selectedId === t.id ? " on" : "")}
                onClick={() => goTo(t.id)}
              >
                <span className="dsp-thumb-no">{i + 1}</span>
                <span className="dsp-thumb-text">
                  <b>
                    {t.program} {t.semester}
                  </b>
                  <span>
                    Section {t.section} · {t.row_count} rows
                  </span>
                  <i className={"dsp-status " + t.status.toLowerCase()}>{t.status}</i>
                </span>
              </button>
            ))}
            <button className="dsp-thumb dsp-thumb-add" onClick={openNew} disabled={busy || list.length >= MAX_SLIDES}>
              + New slide
            </button>
          </div>

          <div className="dsp-stage">
            {error && <div className="error">{error}</div>}
            {message && <div className="dsp-ok">{message}</div>}
            {!ds && <p className="muted">No slide yet. Click + New slide to make the first one.</p>}
            {ds && (
              <div>
                <div className="dsp-slide">
                  <div className="dsp-slide-head">
                    <img src={logo} alt="University logo" className="dsp-logo" />
                    <div className="dsp-titles">
                      <div className="dsp-uni">The Women University Multan</div>
                      <div className="dsp-inst">INSTITUTE OF COMPUTER SCIENCE &amp; INFORMATION TECHNOLOGY</div>
                    </div>
                  </div>
                  <div className="dsp-classline">
                    {ds.program} {ds.semester} Semester, Session ({ds.session}) Section {ds.section}
                  </div>
                  <div className="dsp-scroll">
                    <table className="dsp-table">
                      <colgroup>
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: "24%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "19%" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "40px" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Sr No</th>
                          <th>Date</th>
                          <th>Subject</th>
                          <th>Time</th>
                          <th>Venue</th>
                          <th>Instructor</th>
                          <th className="dsp-duty-h">DUTY</th>
                          <th className="dsp-x"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>
                              <input
                                type="date"
                                aria-label="Date"
                                value={r.exam_date}
                                onChange={(e) => setRow(i, { exam_date: e.target.value })}
                              />
                            </td>
                            <td>
                              <textarea
                                rows={1}
                                aria-label="Subject"
                                value={r.subject}
                                onKeyDown={noEnter}
                                onChange={(e) => setRow(i, { subject: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                aria-label="Time"
                                placeholder="12:30-02:00"
                                value={r.time_text}
                                onChange={(e) => setRow(i, { time_text: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                aria-label="Venue"
                                value={r.venue}
                                onChange={(e) => setRow(i, { venue: e.target.value })}
                              />
                            </td>
                            <td>
                              <textarea
                                rows={1}
                                aria-label="Instructor"
                                value={r.instructor}
                                onKeyDown={noEnter}
                                onChange={(e) => changeInstructor(i, e.target.value)}
                              />
                            </td>
                            <td className="dsp-duty">
                              <textarea
                                rows={1}
                                aria-label="Duty"
                                value={r.duty}
                                onKeyDown={noEnter}
                                onChange={(e) => setRow(i, { duty: e.target.value })}
                              />
                            </td>
                            <td className="dsp-x">
                              <button className="dsp-xbtn" aria-label="Remove this row" onClick={() => removeRow(i)}>
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn dsp-addrow" onClick={addRow}>
                    + Add row
                  </button>
                  <div className="dsp-sigrow">
                    <div className="dsp-sig">
                      <input
                        aria-label="Examination Incharge BSIT Morning name"
                        placeholder="Ms. ____________"
                        value={sigs.incharge_bsit}
                        onChange={(e) => setSig({ incharge_bsit: e.target.value })}
                      />
                      <div>Examination Incharge BSIT Morning</div>
                      <div>Institute of CS&amp;IT</div>
                    </div>
                    <div className="dsp-sig">
                      <input
                        aria-label="Examination Incharge BSCS Morning name"
                        placeholder="Ms. ____________"
                        value={sigs.incharge_bscs}
                        onChange={(e) => setSig({ incharge_bscs: e.target.value })}
                      />
                      <div>Examination Incharge BSCS Morning</div>
                      <div>Institute of CS&amp;IT</div>
                    </div>
                    <div className="dsp-sig">
                      <input
                        aria-label="Director name"
                        placeholder="Dr. ____________"
                        value={sigs.director}
                        onChange={(e) => setSig({ director: e.target.value })}
                      />
                      <div>Director</div>
                      <div>Institute of CS&amp;IT</div>
                    </div>
                  </div>
                </div>

                <div className="dsp-nav">
                  <button className="btn" onClick={() => goStep(-1)} disabled={busy || pos <= 0}>
                    ◀ Previous slide
                  </button>
                  <span className="dsp-pos">
                    Slide {pos + 1} of {shown.length}
                    {dirty && <i className="dsp-unsaved"> · unsaved changes</i>}
                  </span>
                  <button className="btn" onClick={() => goStep(1)} disabled={busy || pos < 0 || pos >= shown.length - 1}>
                    Next slide ▶
                  </button>
                </div>

                <div className="dsp-actions">
                  <button className="primary dsp-save" onClick={saveCurrent} disabled={busy}>
                    Save
                  </button>
                  {ds.status === "Draft" ? (
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
