import { Link, useLocation } from "react-router";
import { useUser, useClerk } from "@clerk/clerk-react";
import { useState } from "react";
import { Truck, ClipboardList, MessageSquare, CalendarDays, Users, Shield, Menu, X, LogOut } from "lucide-react";
import { useMe } from "../hooks/useMe";
import "../tripreport.css";

const NAV = [
  { path: "/",             label: "รายงานเที่ยว", Icon: ClipboardList },
  { path: "/conversation", label: "บทสนทนา",      Icon: MessageSquare },
  { path: "/summary",      label: "สรุปรายวัน",   Icon: CalendarDays },
  { path: "/drivers",      label: "คนขับ",        Icon: Users },
];
const ADMIN_NAV = [{ path: "/admin/users", label: "ผู้ใช้งาน", Icon: Shield }];

const PAGE_TITLES = {
  "/":             "รายงานเที่ยววิ่งรถบรรทุก",
  "/conversation": "บทสนทนากลุ่ม LINE",
  "/summary":      "สรุปรายวัน",
  "/drivers":      "รายชื่อคนขับ",
  "/admin/users":  "จัดการผู้ใช้งาน",
};

const ROLE_LABELS = { pending: "รอสิทธิ์", staff: "พนักงาน", admin: "ผู้ดูแลระบบ" };

function todayLabel() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function TripShell({ children }) {
  const location = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: me } = useMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const title = PAGE_TITLES[location.pathname] ?? "TripReport";
  const navItems = me?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="cf app">
      <div className={`overlay${sidebarOpen ? " show" : ""}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู">
          <X size={15} />
        </button>

        <div className="brand">
          <div className="brand-logo"><Truck size={20} strokeWidth={2} /></div>
          <div>
            <div className="brand-name">TripReport</div>
            <div className="brand-sub">รายงานเที่ยวรถบรรทุก</div>
          </div>
        </div>

        <div className="nav-group-label">เมนูหลัก</div>
        <nav className="nav">
          {navItems.map((item) => {
            const { path, label, Icon } = item;
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setSidebarOpen(false)}
                className={`nav-item${location.pathname === path ? " active" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="avatar" style={{ width: 34, height: 34, objectFit: "cover" }} />
            ) : (
              <div className="avatar" style={{ width: 34, height: 34, background: "#1F52C9", fontSize: 14 }}>
                {(user?.fullName || "?").charAt(0)}
              </div>
            )}
            <div style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.fullName ?? "ผู้ใช้งาน"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{ROLE_LABELS[me?.role] ?? ""}</div>
            </div>
            <button
              onClick={() => signOut()}
              title="ออกจากระบบ"
              style={{ border: "none", background: "none", color: "var(--ink-3)", cursor: "pointer", padding: 4 }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="เปิดเมนู">
            <Menu size={18} />
          </button>
          <h1>{title}</h1>
          <div className="chip" style={{ height: 32 }}>
            <CalendarDays size={14} />
            วันนี้ · {todayLabel()}
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
