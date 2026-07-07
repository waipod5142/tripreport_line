import { useUser, useClerk } from "@clerk/clerk-react";
import { Clock } from "lucide-react";
import "../tripreport.css";

export default function PendingPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  return (
    <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card card-pad pop-in" style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ display: "grid", placeItems: "center", marginBottom: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--st-pending-bg)", color: "var(--st-pending)", display: "grid", placeItems: "center" }}>
            <Clock size={26} />
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>รอสิทธิ์การใช้งาน</div>
        <p className="muted" style={{ margin: "0 0 14px" }}>
          บัญชี {user?.primaryEmailAddress?.emailAddress} ยังไม่ได้รับสิทธิ์เข้าดูข้อมูล
          กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดสิทธิ์
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>ออกจากระบบ</button>
      </div>
    </div>
  );
}
