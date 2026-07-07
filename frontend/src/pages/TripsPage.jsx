import { useMemo, useState } from "react";
import { ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import TripShell from "../components/TripShell";
import { useTrips, useDeleteTrip } from "../hooks/useTrips";
import { useMe } from "../hooks/useMe";

const STATUS_STYLE = {
  "รับงาน": "badge-pending",
  "ถึงต้นทาง": "badge-confirmed",
  "ขึ้นของ": "badge-confirmed",
  "ออกเดินทาง": "badge-in_transit",
  "ถึงปลายทาง": "badge-scheduled",
  "ลงของ": "badge-scheduled",
  "จบงาน": "badge-delivered",
  "มีปัญหา": "badge-problem",
};

const bkkToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const bkkTime = (iso) =>
  new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

const thStyle = { textAlign: "left", padding: "10px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 14px", verticalAlign: "top" };

export default function TripsPage() {
  const [date, setDate] = useState(bkkToday());
  const [driver, setDriver] = useState("");
  const [truck, setTruck] = useState("");
  const [photo, setPhoto] = useState(null);
  const { data: trips = [], isLoading, isError, refetch, isFetching } = useTrips({ date });
  const { data: me } = useMe();
  const { mutate: removeTrip, isPending: isDeleting } = useDeleteTrip();
  const isAdmin = me?.role === "admin";

  const drivers = useMemo(() => [...new Set(trips.map((t) => t.driverName).filter(Boolean))], [trips]);
  const trucks = useMemo(() => [...new Set(trips.map((t) => t.truck).filter(Boolean))], [trips]);
  const rows = trips.filter((t) => (!driver || t.driverName === driver) && (!truck || t.truck === truck));

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
          <div>
            <label className="field-label">ทะเบียนรถ</label>
            <select className="field" value={truck} onChange={(e) => setTruck(e.target.value)} style={{ width: 150 }}>
              <option value="">ทั้งหมด</option>
              {trucks.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()} style={{ height: 42 }}>
            <RefreshCw size={14} className={isFetching ? "spin" : ""} />
            รีเฟรช
          </button>
          <div className="chip" style={{ marginLeft: "auto" }}>{rows.length} รายการ</div>
        </div>

        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ — ลองรีเฟรชอีกครั้ง</div>
        ) : rows.length === 0 ? (
          <div className="card card-pad muted">ไม่มีรายงานเที่ยวในวันที่เลือก</div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  {["เวลา", "คนขับ", "รถ", "เส้นทาง", "สถานะ", "ปัญหา", "รูป", "ข้อความ"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                  {isAdmin && <th style={thStyle}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle} className="mono">{bkkTime(t.reportedAt)}</td>
                    <td style={tdStyle}>{t.driverName}</td>
                    <td style={tdStyle} className="mono">{t.truck || "–"}</td>
                    <td style={tdStyle}>{t.origin || t.destination ? `${t.origin || "?"} → ${t.destination || "?"}` : "–"}</td>
                    <td style={tdStyle}>
                      {t.status ? (
                        <span className={`badge ${STATUS_STYLE[t.status] ?? "badge-pending"}`}>
                          <span className="dot" />{t.status}
                        </span>
                      ) : "–"}
                    </td>
                    <td style={{ ...tdStyle, color: t.problem ? "var(--danger)" : undefined, fontWeight: t.problem ? 600 : undefined }}>
                      {t.problem || "–"}
                    </td>
                    <td style={tdStyle}>
                      {t.imageUrl ? (
                        <img
                          src={t.imageUrl}
                          alt="รูปรายงาน"
                          style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                          onClick={() => setPhoto(t.imageUrl)}
                        />
                      ) : (
                        <ImageIcon size={16} color="var(--ink-4)" />
                      )}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 260 }}>
                      {t.rawMessage && t.rawMessage !== "(image)" ? (
                        <details>
                          <summary className="muted" style={{ cursor: "pointer" }}>ดูข้อความ</summary>
                          <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                            {t.rawMessage}
                            {t.notes ? `\n\nหมายเหตุ AI: ${t.notes}` : ""}
                          </div>
                        </details>
                      ) : (
                        t.notes || "–"
                      )}
                    </td>
                    {isAdmin && (
                      <td style={tdStyle}>
                        <button
                          title="ลบรายงานนี้ (กรณี AI สกัดข้อมูลผิด)"
                          disabled={isDeleting}
                          onClick={() => window.confirm("ลบรายงานเที่ยวนี้?") && removeTrip(t.id)}
                          style={{ border: "none", background: "none", color: "var(--ink-3)", cursor: "pointer", padding: 4 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {photo && (
          <div
            onClick={() => setPhoto(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.75)", zIndex: 100, display: "grid", placeItems: "center", cursor: "zoom-out", padding: 24 }}
          >
            <img src={photo} alt="รูปรายงาน" style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 12 }} />
          </div>
        )}
      </div>
    </TripShell>
  );
}
