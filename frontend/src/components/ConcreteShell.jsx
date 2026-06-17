import { Link, useLocation, useNavigate } from "react-router";
import { useUser } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import {
  Layers, ShoppingCart, Package, BellIcon, CalendarDays,
  Truck, User, Menu, X, ClipboardList,
} from "lucide-react";
import { useSwitchRole } from "../hooks/useDispatcher";
import "../concreteflow.css";

const CUSTOMER_NAV = [
  { path: "/order",     label: "สั่งคอนกรีต",    Icon: ShoppingCart },
  { path: "/my-orders", label: "ออเดอร์ของฉัน",  Icon: Package },
];

const DISPATCHER_NAV = [
  { path: "/dispatch",  label: "จัดการออเดอร์",  Icon: ClipboardList },
];

const TRUCK_NAV = [
  { path: "/trucks",    label: "มุมมองรถโม่",     Icon: Truck },
];

const PAGE_TITLES = {
  "/order":     "สั่งคอนกรีตผสมเสร็จ",
  "/my-orders": "ออเดอร์ของฉัน",
  "/dispatch":  "จัดการออเดอร์",
};

const ROLE_DEFAULT = {
  customer:   "/my-orders",
  dispatcher: "/dispatch",
  driver:     "/trucks",
  admin:      "/admin",
};

const ROLES = [
  { key: "dispatcher", label: "ฝ่ายจัดส่ง",  Icon: Layers },
  { key: "customer",   label: "ลูกค้า",       Icon: User  },
  { key: "driver",     label: "มุมมองรถโม่",  Icon: Truck },
];

function currentView(pathname) {
  if (pathname.startsWith("/dispatch") || pathname.startsWith("/schedule") || pathname.startsWith("/monitor")) return "dispatcher";
  if (pathname.startsWith("/trucks")) return "driver";
  if (pathname.startsWith("/admin"))  return "admin";
  return "customer";
}

function todayLabel() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function AvatarCircle({ name, size = 34, bg = "#1F52C9" }) {
  const initial = (name || "?").replace(/^(คุณ|บ\.|หจก\. )/, "").trim().charAt(0);
  return (
    <div className="avatar" style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}>
      {initial}
    </div>
  );
}

const ROLE_LABELS = { customer: "ลูกค้า", dispatcher: "ฝ่ายจัดส่ง", driver: "มุมมองรถโม่", admin: "ผู้ดูแลระบบ" };

export default function ConcreteShell({ children, contentRef }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user }  = useUser();
  const view      = currentView(location.pathname);
  const title     = PAGE_TITLES[location.pathname] ?? "ConcreteFlow";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState(null);
  const { mutate: switchRole } = useSwitchRole();

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const navItems = view === "dispatcher" ? DISPATCHER_NAV
                 : view === "driver"     ? TRUCK_NAV
                 : CUSTOMER_NAV;

  function handleRoleSwitch(roleKey) {
    if (switchingTo) return;
    setSwitchingTo(roleKey);
    switchRole(roleKey, {
      onSuccess: () => {
        setSwitchingTo(null);
        navigate(ROLE_DEFAULT[roleKey]);
      },
      onError: () => setSwitchingTo(null),
    });
  }

  return (
    <div className="cf app">
      <div className={`overlay${sidebarOpen ? " show" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู">
          <X size={15} />
        </button>

        <div className="brand">
          <div className="brand-logo"><Layers size={20} strokeWidth={2} /></div>
          <div>
            <div className="brand-name">ConcreteFlow</div>
            <div className="brand-sub">นครคอนกรีต Ready-Mix</div>
          </div>
        </div>

        <div className="nav-group-label">
          {view === "dispatcher" ? "ฝ่ายจัดส่ง · Dispatcher" : "ลูกค้า · Customer"}
        </div>
        <nav className="nav">
          {navItems.map(({ path, label, Icon }) => (
            <Link
              key={path}
              to={path}
              className={`nav-item${location.pathname === path ? " active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {/* Demo role switcher */}
        <div className="nav-group-label" style={{ marginTop: 8 }}>มุมมองสาธิต</div>
        <nav className="nav" style={{ gap: 2 }}>
          {ROLES.map(({ key, label, Icon }) => {
            const isActive = view === key || (view === "customer" && key === "customer");
            const isLoading = switchingTo === key;
            return (
              <button
                key={key}
                className={`nav-item${isActive ? " active" : ""}`}
                style={{ cursor: isLoading ? "wait" : "pointer", opacity: isLoading ? 0.7 : 1 }}
                onClick={() => !isActive && handleRoleSwitch(key)}
                disabled={isActive || !!switchingTo}
              >
                <Icon size={18} />
                <span>{label}</span>
                {isActive && (
                  <span style={{ marginLeft: "auto", color: "var(--primary)", fontSize: 11, fontWeight: 700 }}>
                    ✓
                  </span>
                )}
                {isLoading && (
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)" }}>…</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AvatarCircle name={user?.fullName ?? user?.username ?? "U"} />
            <div style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.fullName ?? user?.username ?? "ผู้ใช้งาน"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {ROLE_LABELS[view] ?? "ลูกค้า"}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
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
          <button style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer" }}>
            <BellIcon size={18} />
          </button>
        </header>
        <div className="content" ref={contentRef}>{children}</div>
      </div>
    </div>
  );
}
