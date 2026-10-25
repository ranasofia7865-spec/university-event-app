import { useState, useEffect } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";
const ROLES = ["Admin", "Department Head", "Teacher", "Student"];

function formatDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Login({ onLogin }) {
  const [role, setRole] = useState("Student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Login failed");
      } else if (data.role !== role) {
        setError("This account is not a " + role + " account");
      } else {
        onLogin(data);
      }
    } catch (err) {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <h1>The Women University Multan</h1>
        <p>Event Management Reminder App</p>
        <p className="small">
          Institute of Computer Science and Information Technology
        </p>
      </div>
      <div className="login-right">
        <form className="login-card" onSubmit={submit}>
          <h2>Sign in</h2>
          <label htmlFor="role">Please select your role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Home({ user, onLogout }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(API + "/reminders/upcoming?days=90", {
      headers: { Authorization: "Bearer " + user.token },
    })
      .then(async (res) => {
        if (res.status === 401) {
          onLogout();
          return;
        }
        setItems(await res.json());
      })
      .catch(() => setError("Cannot reach the server. Is the backend running?"));
  }, [user.token]);

  return (
    <div>
      <div className="topbar">
        <div className="brand">Event Management Reminder App</div>
        <div className="who">
          {user.name} ({user.role})
          <button className="link" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
      <div className="content">
        <h2>Upcoming events (next 90 days)</h2>
        {error && <div className="error">{error}</div>}
        {!items && !error && <p>Loading...</p>}
        {items && items.length === 0 && <p>No upcoming events.</p>}
        {items &&
          items.map((e) => (
            <div key={e.id} className="event">
              <div className={"tag " + e.event_type.toLowerCase()}>{e.event_type}</div>
              <div className="event-main">
                <div className="event-title">{e.title}</div>
                <div className="event-date">
                  {formatDate(e.event_date)}
                  {e.end_date ? " to " + formatDate(e.end_date) : ""}
                </div>
              </div>
              <div className="label">{e.label}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  function handleLogin(data) {
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
  }

  function handleLogout() {
    localStorage.removeItem("user");
    setUser(null);
  }

  return user ? (
    <Home user={user} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}
