import TripShell from "../components/TripShell";
import { useUsers, useUpdateUserRole } from "../hooks/useUsers";
import { useMe } from "../hooks/useMe";

const ROLE_OPTIONS = [
  { value: "pending", label: "รอสิทธิ์ (pending)" },
  { value: "staff", label: "พนักงาน (staff)" },
  { value: "admin", label: "ผู้ดูแลระบบ (admin)" },
];

const thStyle = { textAlign: "left", padding: "10px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "8px 14px", verticalAlign: "middle" };

export default function AdminUsersPage() {
  const { data: users = [], isLoading, isError } = useUsers();
  const { data: me } = useMe();
  const { mutate, isPending } = useUpdateUserRole();

  return (
    <TripShell>
      <div className="page fade-in">
        <p className="muted" style={{ marginTop: 0 }}>
          ผู้สมัครใหม่จะได้สถานะ "รอสิทธิ์" โดยอัตโนมัติ — เปลี่ยนเป็น "พนักงาน" เพื่อเปิดสิทธิ์ดูรายงาน
        </p>
        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ</div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={thStyle}>ผู้ใช้งาน</th>
                  <th style={thStyle}>อีเมล</th>
                  <th style={thStyle}>สิทธิ์</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {u.imageUrl ? (
                          <img src={u.imageUrl} alt="" className="avatar" style={{ width: 30, height: 30, objectFit: "cover" }} />
                        ) : (
                          <div className="avatar" style={{ width: 30, height: 30, background: "#1F52C9", fontSize: 13 }}>
                            {(u.name || "?").charAt(0)}
                          </div>
                        )}
                        <span style={{ fontWeight: 600 }}>{u.name || "–"}</span>
                        {u.id === me?.id && <span className="chip" style={{ height: 22 }}>คุณ</span>}
                      </div>
                    </td>
                    <td style={tdStyle} className="muted">{u.email}</td>
                    <td style={tdStyle}>
                      <select
                        className="field"
                        value={u.role}
                        disabled={isPending || u.id === me?.id}
                        onChange={(e) => mutate({ id: u.id, role: e.target.value })}
                        style={{ width: 200, height: 36 }}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TripShell>
  );
}
