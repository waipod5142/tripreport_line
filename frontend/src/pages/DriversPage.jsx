import { useState } from "react";
import TripShell from "../components/TripShell";
import { useLineDrivers, useUpdateLineDriver } from "../hooks/useLineDrivers";

const thStyle = { textAlign: "left", padding: "10px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "8px 14px", verticalAlign: "middle" };

function DriverRow({ d }) {
  const [manualName, setManualName] = useState(d.manualName ?? "");
  const [defaultTruck, setDefaultTruck] = useState(d.defaultTruck ?? "");
  const { mutate, isPending } = useUpdateLineDriver();
  const dirty = manualName !== (d.manualName ?? "") || defaultTruck !== (d.defaultTruck ?? "");

  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={tdStyle}>{d.lineDisplayName || <span className="muted">(ไม่ทราบ)</span>}</td>
      <td style={{ ...tdStyle, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }} className="mono muted">
        {d.lineUserId}
      </td>
      <td style={tdStyle}>
        <input
          className="field"
          value={manualName}
          placeholder="ชื่อจริงคนขับ"
          onChange={(e) => setManualName(e.target.value)}
          style={{ width: 180, height: 36 }}
        />
      </td>
      <td style={tdStyle}>
        <input
          className="field mono"
          value={defaultTruck}
          placeholder="เช่น 71-6213"
          onChange={(e) => setDefaultTruck(e.target.value)}
          style={{ width: 130, height: 36 }}
        />
      </td>
      <td style={tdStyle}>
        <button
          className="btn btn-primary btn-sm"
          disabled={!dirty || isPending}
          onClick={() => mutate({ lineUserId: d.lineUserId, manualName, defaultTruck })}
        >
          {isPending ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </td>
    </tr>
  );
}

export default function DriversPage() {
  const { data: drivers = [], isLoading, isError } = useLineDrivers();

  return (
    <TripShell>
      <div className="page fade-in">
        <p className="muted" style={{ marginTop: 0 }}>
          ชื่อ LINE จะถูกบันทึกอัตโนมัติเมื่อคนขับส่งข้อความครั้งแรก — ใส่ "ชื่อจริง"
          เพื่อให้รายงานทุกเที่ยว (รวมย้อนหลัง) แสดงชื่อที่ถูกต้อง
        </p>
        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ</div>
        ) : drivers.length === 0 ? (
          <div className="card card-pad muted">ยังไม่มีคนขับ — จะปรากฏเมื่อมีข้อความแรกจากกลุ่ม LINE</div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={thStyle}>ชื่อใน LINE</th>
                  <th style={thStyle}>LINE User ID</th>
                  <th style={thStyle}>ชื่อจริง (แก้ไขได้)</th>
                  <th style={thStyle}>รถประจำ</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => <DriverRow key={d.lineUserId} d={d} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TripShell>
  );
}
