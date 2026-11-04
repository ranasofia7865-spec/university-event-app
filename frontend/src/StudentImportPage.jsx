import { useState, useEffect } from "react";
import "./StudentImportPage.css";
import Sidebar from "./Sidebar";

const API = "http://127.0.0.1:8000";
const MAX_ROWS = 300;

function detectDelimiter(text) {
  const first = text.split(/\r?\n/)[0] || "";
  let best = ",";
  let bestCount = -1;
  [",", ";", "\t"].forEach((d) => {
    const n = first.split(d).length - 1;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  });
  return best;
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function headerKey(h) {
  const k = (h || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (k === "email" || k === "emailaddress") return "email";
  if (k === "fullname" || k === "name" || k === "studentname") return "full_name";
  if (k === "studentid" || k === "id" || k === "rollno" || k === "rollnumber") return "student_id";
  return "";
}

function readStudents(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const table = parseCsv(clean, detectDelimiter(clean));
  if (table.length === 0) return { error: "The file is empty." };
  const cols = {};
  table[0].forEach((h, i) => {
    const key = headerKey(h);
    if (key && cols[key] === undefined) cols[key] = i;
  });
  const missing = ["email", "full_name", "student_id"].filter((k) => cols[k] === undefined);
  if (missing.length > 0) {
    return {
      error:
        "The first row must have the columns Email, Full Name, Student ID. I found: " +
        table[0].map((h) => h.trim()).join(", "),
    };
  }
  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const item = {
      line: i + 1,
      email: (r[cols.email] || "").trim(),
      full_name: (r[cols.full_name] || "").trim(),
      student_id: (r[cols.student_id] || "").trim(),
    };
    if (item.email || item.full_name || item.student_id) rows.push(item);
  }
  return { rows: rows };
}

export default function StudentImportPage({ user, onLogout, onNavigate }) {
  const [departments, setDepartments] = useState([]);
  const [deptId, setDeptId] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [check, setCheck] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = user.role === "Admin";

  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + user.token,
  };

  async function send(body) {
    const res = await fetch(API + "/students/import", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });
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

  useEffect(() => {
    if (!isAdmin) return;
    fetch(API + "/departments", { headers: headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setDepartments(d);
        if (d.length > 0) setDeptId(String(d[0].id));
      })
      .catch(() => {});
  }, [user.token]);

  function body(list, dry) {
    const b = { rows: list, dry_run: dry };
    if (isAdmin) b.department_id = deptId ? Number(deptId) : null;
    return b;
  }

  async function runCheck(list) {
    setBusy(true);
    try {
      const data = await send(body(list, true));
      if (data) setCheck(data);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    setError("");
    setCheck(null);
    setDone(null);
    setRows([]);
    if (!file) return;
    setFileName(file.name);
    let text = "";
    try {
      text = await file.text();
    } catch (err) {
      setError("Could not read the file.");
      return;
    }
    const result = readStudents(text);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.rows.length === 0) {
      setError("The file has a header row but no students.");
      return;
    }
    if (result.rows.length > MAX_ROWS) {
      setError(
        "The file has " + result.rows.length + " students. The maximum is " + MAX_ROWS + " per file. Please split it."
      );
      return;
    }
    setRows(result.rows);
    await runCheck(result.rows);
  }

  async function doImport() {
    if (!check || check.ok === 0) return;
    if (!window.confirm("Create " + check.ok + " student accounts now?")) return;
    setError("");
    setBusy(true);
    try {
      const data = await send(body(rows, false));
      if (data) {
        setDone(data);
        setCheck(null);
        setRows([]);
        setFileName("");
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  function downloadSample() {
    const csv =
      "Email,Full Name,Student ID\r\n" +
      "ayesha.khan@example.com,Ayesha Khan,23-BSIT-014\r\n" +
      "sara.ali@example.com,Sara Ali,23-BSIT-015\r\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "students_sample.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const skipped = (check && check.skipped) || (done && done.skipped) || [];

  return (
    <div className="shell">
      <Sidebar user={user} page="students" onNavigate={onNavigate} />
      <div className="main">
        <div className="bar">
          <div className="bar-title">Import students</div>
          <div className="who">
            {user.name} ({user.role})
            <button className="link" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>

        <div className="sip-wrap">
          <div className="sip-card">
            <h3>1. Choose your CSV file</h3>
            <p className="sip-note">
              The first row must be: <b>Email, Full Name, Student ID</b>. Each student logs in with their email, and
              their first password is their Student ID. Up to {MAX_ROWS} students per file.
            </p>
            <div className="sip-row">
              <button className="btn sip-btn" onClick={downloadSample}>
                Download a sample CSV
              </button>
            </div>

            {isAdmin && (
              <div className="sip-dept">
                <label htmlFor="s-dept">Department for these students</label>
                <select
                  id="s-dept"
                  value={deptId}
                  onChange={(e) => {
                    setDeptId(e.target.value);
                    setCheck(null);
                    if (rows.length > 0) runCheck(rows);
                  }}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="sip-file" htmlFor="s-file">
              {fileName ? "File: " + fileName + " (click to choose another)" : "Click here to choose a .csv file"}
            </label>
            <input id="s-file" className="sip-fileinput" type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} />
            <p className="sip-note">
              Tip: if you made the file in Excel, use <b>Save As, CSV</b>. Student IDs that start with 0 should be
              formatted as text.
            </p>
          </div>

          {error && <div className="error">{error}</div>}
          {busy && <div className="sip-wait">Working... importing can take about a minute for a big file. Please wait.</div>}

          {check && (
            <div className="sip-card">
              <h3>2. Check result</h3>
              <p className="sip-big">
                <b>{check.ok}</b> students are ready to import
                {check.skipped.length > 0 && (
                  <span>
                    , <b>{check.skipped.length}</b> rows will be skipped
                  </span>
                )}
                .
              </p>
              <div className="sip-scroll">
                <table className="sip-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Email</th>
                      <th>Full Name</th>
                      <th>Student ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((r) => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        <td>{r.email}</td>
                        <td>{r.full_name}</td>
                        <td>{r.student_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && <p className="sip-note">Showing the first 8 of {rows.length} rows.</p>}
              <button className="primary sip-import" onClick={doImport} disabled={busy || check.ok === 0}>
                Import {check.ok} students
              </button>
            </div>
          )}

          {done && (
            <div className="sip-card sip-success">
              <h3>Done</h3>
              <p className="sip-big">
                <b>{done.created}</b> student accounts were created.
                {done.skipped.length > 0 && (
                  <span>
                    {" "}
                    <b>{done.skipped.length}</b> rows were skipped.
                  </span>
                )}
              </p>
              <p className="sip-note">Students log in with their email and their Student ID as the password.</p>
            </div>
          )}

          {skipped.length > 0 && (
            <div className="sip-card">
              <h3>Skipped rows</h3>
              <div className="sip-scroll">
                <table className="sip-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Email</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skipped.map((s, i) => (
                      <tr key={i}>
                        <td>{s.line}</td>
                        <td>{s.email}</td>
                        <td>{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
