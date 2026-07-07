import { useState } from "react";
import { User, Truck } from "lucide-react";
import TripShell from "../components/TripShell";
import { useTripSummary } from "../hooks/useTrips";

const bkkToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

const thStyle = { textAlign: "left", padding: "9px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "9px 14px", verticalAlign: "top" };

function SummaryTable(props) {
  const { title, Icon, rows, otherKey, otherLabel } = props;
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-pad sec-title" style={{ borderBottom: "1px solid var(--border)" }}>
        <Icon size={17} />{title}
      </div>
      {rows.length === 0 ? (
        <div className="card-pad muted">ไม่มีข้อมูล</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                <th style={thStyle}>ชื่อ</th>
                <th style={thStyle}>รายงาน</th>
                <th style={thStyle}>เส้นทาง</th>
                <th style={thStyle}>{otherLabel}</th>
                <th style={thStyle}>ปัญหา</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.name} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{g.name}</td>
                  <td style={tdStyle} className="mono">{g.count}</td>
                  <td style={tdStyle}>{g.routes.join(" | ") || "–"}</td>
                  <td style={tdStyle} className="mono">{g[otherKey].join(", ") || "–"}</td>
                  <td style={{ ...tdStyle, color: g.problems.length ? "var(--danger)" : undefined }}>
                    {g.problems.join(" | ") || "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SummaryPage() {
  const [date, setDate] = useState(bkkToday());
  const { data, isLoading, isError } = useTripSummary(date);

  return (
    <TripShell>
      <div className="page fade-in">
        <div className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <label className="field-label">วันที่</label>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
          </div>
        </div>

        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ</div>
        ) : (
          <>
            <SummaryTable title="สรุปตามคนขับ" Icon={User} rows={data?.byDriver ?? []} otherKey="trucks" otherLabel="รถที่ใช้" />
            <SummaryTable title="สรุปตามรถ" Icon={Truck} rows={data?.byTruck ?? []} otherKey="drivers" otherLabel="คนขับ" />
          </>
        )}
      </div>
    </TripShell>
  );
}
