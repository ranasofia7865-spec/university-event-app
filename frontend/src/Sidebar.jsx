import logo from "./logo.png";

export default function Sidebar({ user, page, onNavigate }) {
  const staff = user.role !== "Student";
  const items = [{ key: "home", name: "Home" }, { key: "calendar", name: "Calendar" }];
  if (staff) {
    items.push({ key: "templates", name: "Templates" });
    items.push({ key: "assistant", name: "AI assistant" });
    items.push({ key: "datesheet", name: "Datesheet" });
    items.push({ key: "certificate", name: "Certificate" });
    items.push({ key: "timetable", name: "Timetable" });
  }
  if (user.role === "Admin" || user.role === "Department Head") {
    items.push({ key: "students", name: "Students" });
  }
  if (user.role === "Admin") {
    items.push({ key: "users", name: "Users", soon: true });
  }
  return (
    <div className="side">
      <div className="side-title side-brand">
        <img className="side-logo" src={logo} alt="University logo" />
        <div>
          Women University Multan
          <span>Event Management</span>
        </div>
      </div>
      {items.map((item) =>
        item.soon ? (
          <div key={item.key} className="side-item soon">
            {item.name}
            <small> soon</small>
          </div>
        ) : (
          <button
            key={item.key}
            className={"side-item side-btn" + (page === item.key ? " on" : "")}
            onClick={() => onNavigate(item.key)}
          >
            {item.name}
          </button>
        )
      )}
    </div>
  );
}
