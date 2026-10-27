import { useState, useEffect } from "react";
import "./TemplatesPage.css";
import Sidebar from "./Sidebar";

const API = "http://127.0.0.1:8000";

function fieldType(f) {
  if (/date|deadline/.test(f)) return "date";
  if (/time/.test(f)) return "time";
  return "text";
}

function niceValue(f, v) {
  if (!v) return "";
  if (fieldType(f) === "date") {
    return new Date(v + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if (fieldType(f) === "time") {
    const parts = v.split(":");
    const h = Number(parts[0]);
    const ap = h >= 12 ? "PM" : "AM";
    return (h % 12 || 12) + ":" + parts[1] + " " + ap;
  }
  return v;
}

function label(f) {
  const t = f.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function TemplatesPage({ user, onLogout, onNavigate }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const headers = { Authorization: "Bearer " + user.token };

  useEffect(() => {
    fetch(API + "/templates", { headers: headers })
      .then(async (res) => {
        if (res.status === 401) {
          onLogout();
          return null;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Could not load templates");
          return null;
        }
        return data;
      })
      .then((data) => {
        if (data) {
          setTemplates(data);
          if (data.length > 0) setSelected(data[0]);
        }
      })
      .catch(() => setError("Cannot reach the server. Is the backend running?"));
  }, [user.token]);

  function choose(t) {
    setSelected(t);
    setValues({});
    setResult(null);
    setCopied(false);
  }

  async function preview(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCopied(false);
    const filled = {};
    selected.fields.forEach((f) => {
      filled[f] = niceValue(f, values[f] || "");
    });
    try {
      const res = await fetch(API + "/templates/" + selected.id + "/fill", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ values: filled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not fill the template");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  function copyText() {
    navigator.clipboard.writeText(result.text).then(() => setCopied(true));
  }

  return (
    <div className="shell">
      <Sidebar user={user} page="templates" onNavigate={onNavigate} />
      <div className="main">
        <div className="bar">
          <div className="bar-title">Templates</div>
          <div className="who">
            {user.name} ({user.role})
            <button className="link" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
        <div className="body">
          <div className="tp-list">
            <h3>Choose a template</h3>
            {templates.map((t) => (
              <button
                key={t.id}
                className={"tp-card" + (selected && selected.id === t.id ? " on" : "")}
                onClick={() => choose(t)}
              >
                <b>{t.name}</b>
                <span>{t.type}</span>
              </button>
            ))}
          </div>
          <div className="tp-form">
            {error && <div className="error">{error}</div>}
            {selected && (
              <form onSubmit={preview}>
                <h3>Fill: {selected.name}</h3>
                {selected.fields.map((f) => (
                  <div key={f} className="tp-field">
                    <label htmlFor={"f-" + f}>{label(f)}</label>
                    <input
                      id={"f-" + f}
                      type={fieldType(f)}
                      value={values[f] || ""}
                      onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                    />
                  </div>
                ))}
                <button className="primary tp-btn" type="submit" disabled={busy}>
                  {busy ? "Working..." : "Preview"}
                </button>
              </form>
            )}
          </div>
          <div className="tp-preview">
            <h3>Preview</h3>
            {!result && <p className="muted">Fill the form and click Preview.</p>}
            {result && (
              <div>
                <div className="tp-text">{result.text}</div>
                {result.missing.length > 0 && (
                  <div className="tp-missing">
                    Still empty: {result.missing.map(label).join(", ")}
                  </div>
                )}
                <button className="btn tp-copy" onClick={copyText}>
                  {copied ? "Copied" : "Copy text"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
