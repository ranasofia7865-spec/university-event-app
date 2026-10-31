import { useState, useEffect } from "react";
import "./App.css";
import StudentPage from "./StudentPage";
import CalendarPage from "./CalendarPage";
import TemplatesPage from "./TemplatesPage";
import HomePage from "./HomePage";
import DatesheetsPage from "./DatesheetsPage";
import TimetablesPage from "./TimetablesPage";

const API = "http://127.0.0.1:8000";
const ROLES = ["Admin", "Department Head", "Teacher", "Student"];
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

export default function App() {
  const [page, setPage] = useState("home");
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
    setPage("home");
    setUser(null);
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }
  if (page === "home") {
    return <HomePage user={user} onLogout={handleLogout} onNavigate={setPage} />;
  }
  if (user.role === "Student") {
    return <StudentPage user={user} onLogout={handleLogout} onNavigate={setPage} />;
  }
  if (page === "datesheet") {
    return <DatesheetsPage user={user} onLogout={handleLogout} onNavigate={setPage} />;
  }
  if (page === "templates") {
    return <TemplatesPage user={user} onLogout={handleLogout} onNavigate={setPage} />;
  }
  if (page === "timetable") {
    return <TimetablesPage user={user} onLogout={handleLogout} onNavigate={setPage} />;
  }
  return <CalendarPage user={user} onLogout={handleLogout} onNavigate={setPage} />;
}
