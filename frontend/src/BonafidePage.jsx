import { useState } from "react";
import "./BonafidePage.css";
import Sidebar from "./Sidebar";
import logo from "./logo.png";

const API = "http://127.0.0.1:8000";
const SEMESTERS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const STORE = "bonafide_class_details";

function todayText() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return dd + "-" + mm + "-" + d.getFullYear();
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveClass(f) {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify({
        shift: f.shift,
        program: f.program,
        session: f.session,
        section: f.section,
        semester: f.semester,
      })
    );
  } catch (e) {
    // saving is only a convenience
  }
}

function Val({ text, blank }) {
  const t = (text || "").trim();
  return t ? <b>{t}</b> : <span>{blank || "____________________"}</span>;
}

export default function BonafidePage({ user, onLogout, onNavigate }) {
  const [f, setF] = useState(() => ({
    student_name: "",
    father_name: "",
    roll_no: "",
    shift: "",
    program: "",
    session: "",
    section: "",
    semester: "",
    date_text: todayText(),
    ...loadSaved(),
  }));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function set(patch) {
    setF({ ...f, ...patch });
    setMessage("");
  }

  function clearStudent() {
    setF({ ...f, student_name: "", father_name: "", roll_no: "" });
    setMessage("");
    setError("");
  }

  async function download() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const res = await fetch(API + "/certificates/bonafide/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + user.token,
        },
        body: JSON.stringify(f),
      });
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
        setError(data && typeof data.detail === "string" ? data.detail : "Could not make the certificate");
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const nm = f.student_name.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Student";
      link.download = "Bonafide_" + nm + ".pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      saveClass(f);
      setMessage("Certificate downloaded. Class details are remembered for the next student.");
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot reach the server. Is the backend running?"
          : err.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Sidebar user={user} page="bonafide" onNavigate={onNavigate} />
      <div className="main">
        <div className="bar">
          <div className="bar-title">Bonafide certificate</div>
          <div className="who">
            {user.name} ({user.role})
            <button className="link" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>

        <div className="bfp-body">
          <div className="bfp-form">
            <h3>Student details</h3>
            <label htmlFor="b-name">Student name</label>
            <input id="b-name" value={f.student_name} onChange={(e) => set({ student_name: e.target.value })} />
            <label htmlFor="b-father">Father's name (D/O)</label>
            <input id="b-father" value={f.father_name} onChange={(e) => set({ father_name: e.target.value })} />
            <label htmlFor="b-roll">University roll no</label>
            <input id="b-roll" value={f.roll_no} onChange={(e) => set({ roll_no: e.target.value })} />

            <h3>Class details</h3>
            <div className="bfp-two">
              <div>
                <label htmlFor="b-shift">Class timing</label>
                <select id="b-shift" value={f.shift} onChange={(e) => set({ shift: e.target.value })}>
                  <option value="">Choose</option>
                  <option>Morning</option>
                  <option>Evening</option>
                </select>
              </div>
              <div>
                <label htmlFor="b-program">Program</label>
                <select id="b-program" value={f.program} onChange={(e) => set({ program: e.target.value })}>
                  <option value="">Choose</option>
                  <option>BSCS</option>
                  <option>BSIT</option>
                </select>
              </div>
              <div>
                <label htmlFor="b-session">Session</label>
                <input
                  id="b-session"
                  placeholder="2023-2027"
                  value={f.session}
                  onChange={(e) => set({ session: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="b-section">Section</label>
                <select id="b-section" value={f.section} onChange={(e) => set({ section: e.target.value })}>
                  <option value="">Choose</option>
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                  <option>D</option>
                </select>
              </div>
              <div>
                <label htmlFor="b-sem">Semester</label>
                <select id="b-sem" value={f.semester} onChange={(e) => set({ semester: e.target.value })}>
                  <option value="">Choose</option>
                  {SEMESTERS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="b-date">Dated</label>
                <input
                  id="b-date"
                  placeholder="31-10-2026"
                  value={f.date_text}
                  onChange={(e) => set({ date_text: e.target.value })}
                />
              </div>
            </div>

            {error && <div className="error">{error}</div>}
            {message && <div className="bfp-ok">{message}</div>}
            <div className="bfp-actions">
              <button className="primary bfp-dl" onClick={download} disabled={busy}>
                {busy ? "Making PDF..." : "Download certificate PDF"}
              </button>
              <button className="btn bfp-clear" onClick={clearStudent} disabled={busy}>
                Next student (clear name, father, roll no)
              </button>
            </div>
            <p className="bfp-hint">Empty fields stay as blank lines, so you can also print it and fill it by hand.</p>
          </div>

          <div className="bfp-previewbox">
            <div className="bfp-paper">
              <div className="bfp-border"></div>
              <svg className="bfp-svg" viewBox="0 0 792 612" aria-hidden="true">
                <defs>
                  <path id="bfp-arch" d="M 60 192.6 A 1100 1100 0 0 1 732 192.6" />
                </defs>
                <text
                  fontFamily="Arial Black, Arial, Helvetica, sans-serif"
                  fontWeight="900"
                  fontSize="38"
                  textAnchor="middle"
                >
                  <textPath href="#bfp-arch" startOffset="50%" textLength="610" lengthAdjust="spacingAndGlyphs">
                    THE WOMEN UNIVERSITY MULTAN
                  </textPath>
                </text>
                <image href={logo} x="357" y="197" width="78" height="65" preserveAspectRatio="xMidYMid meet" />
                <text
                  x="396"
                  y="285"
                  textAnchor="middle"
                  fontFamily="Times New Roman, Times, serif"
                  fontWeight="bold"
                  fontSize="20"
                  textDecoration="underline"
                >
                  BONAFIDE CERTIFICATE
                </text>
              </svg>
              <p className="bfp-text">
                Certified that Ms. <Val text={f.student_name} /> D/O <Val text={f.father_name} /> University Roll No:{" "}
                <Val text={f.roll_no} /> is a regular student of this university enrolled in class (
                <Val text={f.shift} blank="Morning/Evening" />), (<Val text={f.program} blank="BSCS/ BSIT" />) during the
                Session: <Val text={f.session} blank="___________" />, Section:{" "}
                <Val text={f.section} blank="A, B, C, and D" />. She is currently studying in{" "}
                <Val text={f.semester} blank="________" /> Semester.
              </p>
              <div className="bfp-date">
                Dated: {f.date_text.trim() ? <b>{f.date_text}</b> : "______________________"}
              </div>
              <div className="bfp-sign">
                <b>Dr. Khadija Kanwal</b>
                <div>Director</div>
                <div>Institute of CS&amp; IT</div>
              </div>
            </div>
            <div className="bfp-caption">Preview. The downloaded PDF has the same layout.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
