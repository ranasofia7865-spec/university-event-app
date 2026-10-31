export default function Sidebar({ user, page, onNavigate }) {
  const staff = user.role !== "Student";
  const items = [{ key: "home", name: "Home" }, { key: "calendar", name: "Calendar" }];
  if (staff) {
    items.push({ key: "templates", name: "Templates" });
    items.push({ key: "datesheet", name: "Datesheet" });
    items.push({ key: "timetable", name: "Timetable" });
  }
  if (user.role === "Admin") {
    items.push({ key: "users", name: "Users", soon: true });
  }
  return (
    <div className="side">
      <div className="side-title">
        Women University Multan
        <span>Event Management</span>
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
