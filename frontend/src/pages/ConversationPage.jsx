import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import TripShell from "../components/TripShell";
import { useLineMessages } from "../hooks/useLineMessages";

const bkkToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const bkkTime = (iso) =>
  new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

const thStyle = { textAlign: "left", padding: "10px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 14px", verticalAlign: "top" };

// text shown verbatim; non-text mirrors the sheet's "(non-text)" markers
const TYPE_LABEL = { image: "(รูปภาพ)", sticker: "(สติกเกอร์)", video: "(วิดีโอ)", audio: "(เสียง)", file: "(ไฟล์)", location: "(ตำแหน่ง)" };
const contentOf = (m) => (m.type === "text" ? m.text || "" : TYPE_LABEL[m.type] || `(${m.type})`);

export default function ConversationPage() {
  const [date, setDate] = useState(bkkToday());
  const [driver, setDriver] = useState("");
  const { data: messages = [], isLoading, isError, refetch, isFetching } = useLineMessages({ date });

  const drivers = useMemo(() => [...new Set(messages.map((m) => m.driverName).filter(Boolean))], [messages]);
  const rows = messages.filter((m) => !driver || m.driverName === driver);

  return (
    <TripShell>
      <div className="page fade-in">
        <div className="card card-pad" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <label className="field-label">วันที่</label>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
          </div>
          <div>
            <label className="field-label">คนขับ</label>
            <select className="field" value={driver} onChange={(e) => setDriver(e.target.value)} style={{ width: 180 }}>
              <option value="">ทั้งหมด</option>
              {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()} style={{ height: 42 }}>
            <RefreshCw size={14} className={isFetching ? "spin" : ""} />
            รีเฟรช
          </button>
          <div className="chip" style={{ marginLeft: "auto" }}>{rows.length} ข้อความ</div>
        </div>

        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ — ลองรีเฟรชอีกครั้ง</div>
        ) : rows.length === 0 ? (
          <div className="card card-pad muted">ไม่มีข้อความในวันที่เลือก</div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  {["เวลา", "คนขับ", "ข้อความ", ""].map((h, i) => (
                    <th key={i} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle} className="mono">{bkkTime(m.reportedAt)}</td>
                    <td style={tdStyle}>{m.driverName}</td>
                    <td style={{ ...tdStyle, maxWidth: 480 }}>
                      <span style={{ whiteSpace: "pre-wrap", color: m.type === "text" ? undefined : "var(--ink-3)" }}>
                        {contentOf(m)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {m.isTripReport && (
                        <span className="badge badge-delivered"><span className="dot" />เที่ยววิ่ง</span>
                      )}
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
