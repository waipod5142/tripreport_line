import { useState, useRef, useEffect } from "react";
import { Loader2, Package, CheckCircle, Navigation, X } from "lucide-react";
import ConcreteShell from "../components/ConcreteShell";
import { useTrucks, useSchedules, useUpdateScheduleStatus } from "../hooks/useDispatcher";

/* ── Layout constants ──────────────────────────────────────── */
const HOUR_W    = 64;          // px per hour
const DAY_PX    = HOUR_W * 24; // 1536px per day
const LABEL_W   = 160;         // px for sticky truck label column
const ROW_H     = 64;          // px per truck row

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23

/* ── Time helpers ──────────────────────────────────────────── */
function toMins(t) {
  const [h, m] = (t ?? "00:00").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
const leftPx  = (t)    => toMins(t) * (HOUR_W / 60);
const widthPx = (s, e) => Math.max(2, (toMins(e) - toMins(s)) * (HOUR_W / 60));

function isoOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function fmtDateThai(iso) {
  if (!iso) return "";
  const [y, mo, dd] = iso.split("-");
  const MONTHS = ["","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${dd} ${MONTHS[+mo]} ${+y + 543}`;
}
function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/* ── Block detail card ─────────────────────────────────────── */
function BlockCard({ sched, truckColor, onStatus, updating, onClose }) {
  const order = sched.order;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden", boxShadow: "var(--sh-sm)" }}>
      <div style={{ background: truckColor ?? "var(--primary)", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "#fff" }}>
          <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15 }}>#{order?.orderNumber?.slice(-4) ?? "—"}</div>
          <div style={{ fontSize: 11.5, opacity: .85 }}>
            {(sched.scheduledStartTime ?? "").slice(0,5)} – {(sched.scheduledEndTime ?? "").slice(0,5)} น.
          </div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,.25)", border: "none", borderRadius: 8, width: 28, height: 28, cursor: "pointer", color: "#fff", display: "grid", placeItems: "center" }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ padding: "12px 14px 0" }}>
        {[
          ["สินค้า",   order?.items?.[0]?.product?.name ?? "—"],
          ["ปริมาณ",  `${Number(sched.quantityM3 || 0).toFixed(1)} คิว`],
          ["หน้างาน", order?.deliveryLabel || order?.deliveryArea || "—"],
          ["ลูกค้า",  order?.customer?.name ?? order?.contactName ?? "—"],
          ["โทร",     order?.contactPhone ?? "—"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--ink-3)", width: 60, flexShrink: 0 }}>{k}</span>
            <span style={{ fontWeight: 500 }}>{v}</span>
          </div>
        ))}
        {sched.dispatcherNotes && (
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "8px 0", fontStyle: "italic" }}>
            หมายเหตุ: {sched.dispatcherNotes}
          </div>
        )}
      </div>
      <div style={{ padding: "12px 14px", display: "flex", gap: 8 }}>
        {sched.status === "scheduled" && (
          <button onClick={() => onStatus(sched.id, "in_transit")} disabled={updating}
            style={{ flex: 1, height: 36, borderRadius: 10, border: "none", background: "var(--st-transit-bg)", color: "var(--st-transit)", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {updating ? <Loader2 size={13} className="spin" /> : <Navigation size={13} />} ออกรถ
          </button>
        )}
        {sched.status === "in_transit" && (
          <button onClick={() => onStatus(sched.id, "completed")} disabled={updating}
            style={{ flex: 1, height: 36, borderRadius: 10, border: "none", background: "var(--st-delivered-bg)", color: "var(--st-delivered)", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {updating ? <Loader2 size={13} className="spin" /> : <CheckCircle size={13} />} ส่งสำเร็จ
          </button>
        )}
        {sched.status === "completed" && (
          <div style={{ flex: 1, height: 36, borderRadius: 10, background: "var(--st-delivered-bg)", color: "var(--st-delivered)", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <CheckCircle size={13} /> ส่งสำเร็จแล้ว
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Single day track (inside a truck row) ─────────────────── */
function DayTrack({ schedules, truckColor, isToday, selectedId, onSelect }) {
  const np = isToday ? nowMinutes() * (HOUR_W / 60) : null;
  return (
    <div style={{ width: DAY_PX, flexShrink: 0, position: "relative", height: ROW_H, background: "var(--surface-3)" }}>
      {/* Hour grid lines */}
      {HOURS.map((h) => h > 0 && (
        <div key={h} style={{
          position: "absolute", left: h * HOUR_W, top: 0, bottom: 0, width: 1,
          background: h % 6 === 0 ? "var(--border-2)" : "var(--border)",
          opacity: h % 6 === 0 ? 0.9 : h % 2 === 0 ? 0.5 : 0.25,
        }} />
      ))}

      {/* Current time line */}
      {np !== null && (
        <div style={{
          position: "absolute", left: np, top: 0, bottom: 0, width: 2,
          background: "var(--danger)", zIndex: 4,
          boxShadow: "0 0 6px rgba(224,68,62,.6)",
        }}>
          <div style={{
            position: "absolute", top: 3, left: 3,
            background: "var(--danger)", color: "#fff",
            fontSize: 9, fontFamily: "var(--mono)", fontWeight: 700,
            padding: "1px 4px", borderRadius: 4, whiteSpace: "nowrap",
          }}>
            {String(new Date().getHours()).padStart(2,"0")}:{String(new Date().getMinutes()).padStart(2,"0")}
          </div>
        </div>
      )}

      {/* Empty label */}
      {schedules.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 600, letterSpacing: ".03em" }}>ว่าง</span>
        </div>
      )}

      {/* Schedule blocks */}
      {schedules.map((sched) => {
        const lx = leftPx(sched.scheduledStartTime);
        const wx = widthPx(sched.scheduledStartTime, sched.scheduledEndTime);
        const isSelected = selectedId === sched.id;
        const isDone     = sched.status === "completed";
        const isTransit  = sched.status === "in_transit";
        const color      = truckColor ?? "#2B6CF0";

        return (
          <div
            key={sched.id}
            onClick={() => onSelect(sched)}
            title={`#${sched.order?.orderNumber?.slice(-4)} · ${Number(sched.quantityM3||0)}คิว · ${(sched.scheduledStartTime??"").slice(0,5)}–${(sched.scheduledEndTime??"").slice(0,5)}`}
            style={{
              position: "absolute",
              left: lx, width: Math.min(wx, DAY_PX - lx),
              top: 8, bottom: 8,
              background: color,
              opacity: isDone ? 0.38 : 1,
              borderRadius: 8, cursor: "pointer", overflow: "hidden",
              display: "flex", alignItems: "center", padding: "0 8px",
              zIndex: 2,
              outline: isSelected ? "2.5px solid var(--ink)" : "none",
              outlineOffset: 2,
              boxShadow: isTransit ? `0 2px 12px ${color}99` : isSelected ? "0 2px 8px rgba(0,0,0,.2)" : "0 1px 3px rgba(0,0,0,.14)",
              transition: "opacity .15s",
            }}
            className={isTransit ? "pulse" : undefined}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.25 }}>
              #{sched.order?.orderNumber?.slice(-4)}
              <span style={{ opacity: .75, marginLeft: 4 }}>{Number(sched.quantityM3||0)}คิว</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── TruckView ─────────────────────────────────────────────── */
export default function TruckView() {
  const TODAY    = isoOffset(0);
  const TOMORROW = isoOffset(1);
  const DATES    = [TODAY, TOMORROW];
  const DATE_LABELS = { [TODAY]: "วันนี้", [TOMORROW]: "พรุ่งนี้" };

  const [selectedId,  setSelectedId]  = useState(null);
  const scrollRef = useRef(null);

  const { data: trucks    = [], isLoading: lt } = useTrucks();
  const { data: schedules = [], isLoading: ls } = useSchedules();
  const { mutate: updateStatus, isPending: updating, variables: uv } = useUpdateScheduleStatus();

  const selSched  = schedules.find((s) => s.id === selectedId) ?? null;
  const selTruck  = selSched ? trucks.find((t) => t.id === selSched.truckId) : null;

  // Auto-scroll to current time on load
  useEffect(() => {
    if (!scrollRef.current) return;
    const np = nowMinutes() * (HOUR_W / 60);
    const viewW = scrollRef.current.clientWidth - LABEL_W;
    scrollRef.current.scrollLeft = Math.max(0, np - viewW / 2);
  }, [lt, ls]);

  // Summary (across both days)
  const allDayScheds = DATES.map((d) => schedules.filter((s) => s.scheduledDate === d));
  const todayScheds  = allDayScheds[0];
  const totalQty     = todayScheds.reduce((a, s) => a + Number(s.quantityM3 || 0), 0);
  const busyToday    = new Set(todayScheds.filter((s) => ["scheduled","in_transit"].includes(s.status)).map((s) => s.truckId)).size;
  const doneToday    = todayScheds.filter((s) => s.status === "completed").length;

  const isLoading = lt || ls;

  return (
    <ConcreteShell>
      <div className="page fade-in" style={{ maxWidth: "none" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div className="sec-title" style={{ fontSize: 17 }}>ตารางเวลารถโม่ (สองวัน)</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            เลื่อนซ้ายขวา (scroll) เพื่อดูทุกช่วงเวลา
          </div>
        </div>

        {/* Summary chips */}
        {!isLoading && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              ["รถมีงานวันนี้",  `${busyToday} / ${trucks.length} คัน`],
              ["เที่ยวรวมวันนี้", `${todayScheds.length} เที่ยว`],
              ["ปริมาณวันนี้",   `${totalQty.toFixed(1)} คิว`],
              ["ส่งสำเร็จ",      `${doneToday} / ${todayScheds.length}`],
            ].map(([k, v]) => (
              <div key={k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>{k}</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14 }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
            <Loader2 size={28} className="spin" style={{ color: "var(--primary)" }} />
          </div>
        ) : trucks.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--ink-3)" }}>
            <Package size={36} style={{ marginBottom: 10, opacity: .4 }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>ยังไม่มีรถในระบบ</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selSched ? "1fr 270px" : "1fr", gap: 16, alignItems: "start" }}>

            {/* ── Timeline table ── */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden", boxShadow: "var(--sh-sm)" }}>

              {/* Scrollable wrapper */}
              <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "visible" }}>
                {/* Min-width container: label + 2 days */}
                <div style={{ width: LABEL_W + DAY_PX * 2 + 1, minWidth: "max-content" }}>

                  {/* ── Date header ── */}
                  <div style={{ display: "flex", borderBottom: "2px solid var(--border-2)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 20 }}>
                    <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid var(--border-2)", position: "sticky", left: 0, background: "var(--surface)", zIndex: 21 }} />
                    {DATES.map((d, i) => (
                      <div key={d} style={{
                        width: DAY_PX, flexShrink: 0,
                        borderLeft: i > 0 ? "2px solid var(--border-2)" : "none",
                        padding: "7px 14px",
                        background: d === TODAY ? "var(--primary-50)" : "var(--surface)",
                      }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: d === TODAY ? "var(--primary)" : "var(--ink-2)" }}>
                          {DATE_LABELS[d]}
                        </span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-3)", marginLeft: 8 }}>
                          {fmtDateThai(d)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* ── Hour ruler ── */}
                  <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 34, zIndex: 20 }}>
                    <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid var(--border-2)", padding: "5px 12px", fontSize: 10.5, color: "var(--ink-3)", fontWeight: 600, position: "sticky", left: 0, background: "var(--surface)", zIndex: 21 }}>
                      รถโม่ / เวลา
                    </div>
                    {DATES.map((d, i) => (
                      <div key={d} style={{ width: DAY_PX, flexShrink: 0, position: "relative", height: 26, borderLeft: i > 0 ? "2px solid var(--border-2)" : "none" }}>
                        {HOURS.map((h) => (
                          <div key={h} style={{
                            position: "absolute",
                            left: h * HOUR_W,
                            top: 0, height: "100%",
                            display: "flex", alignItems: "center",
                          }}>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: h % 6 === 0 ? "var(--ink-2)" : "var(--ink-4)", fontWeight: h % 6 === 0 ? 700 : 400, paddingLeft: 4, userSelect: "none" }}>
                              {String(h).padStart(2,"0")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* ── Truck rows ── */}
                  {trucks.map((truck) => (
                    <div key={truck.id} style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
                      {/* Sticky truck label */}
                      <div style={{
                        width: LABEL_W, flexShrink: 0, height: ROW_H,
                        borderRight: "1px solid var(--border-2)",
                        display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
                        position: "sticky", left: 0, zIndex: 5,
                        background: `linear-gradient(90deg, ${truck.colorHex ?? "#2B6CF0"}16, #fff)`,
                      }}>
                        <div style={{ width: 5, height: 38, borderRadius: 3, background: truck.colorHex ?? "#2B6CF0", flexShrink: 0 }} />
                        <div style={{ lineHeight: 1.3, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {truck.registration}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{truck.truckType} · {truck.capacity}คิว</div>
                        </div>
                      </div>

                      {/* Day tracks */}
                      {DATES.map((d, i) => (
                        <div key={d} style={{ borderLeft: i > 0 ? "2px solid var(--border-2)" : "none", flexShrink: 0 }}>
                          <DayTrack
                            schedules={schedules.filter((s) => s.truckId === truck.id && s.scheduledDate === d)}
                            truckColor={truck.colorHex}
                            isToday={d === TODAY}
                            selectedId={selectedId}
                            onSelect={(s) => setSelectedId(s.id === selectedId ? null : s.id)}
                          />
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* ── Legend ── */}
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center",
                    padding: `8px 14px 8px ${LABEL_W + 14}px`,
                    borderTop: "1px solid var(--border)",
                    background: "var(--surface-2)", fontSize: 11.5, color: "var(--ink-3)",
                  }}>
                    <span>คลิกช่วงเวลาเพื่อดูรายละเอียด</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 26, height: 9, borderRadius: 3, background: "#2B6CF0", display: "inline-block" }} /> จัดคิวแล้ว
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 26, height: 9, borderRadius: 3, background: "#2B6CF0", opacity: 0.38, display: "inline-block" }} /> ส่งสำเร็จ
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 2, height: 14, borderRadius: 1, background: "var(--danger)", display: "inline-block" }} /> เวลาปัจจุบัน
                    </span>
                  </div>

                </div>
              </div>
            </div>

            {/* ── Block detail card ── */}
            {selSched && (
              <div style={{ position: "sticky", top: 16 }}>
                <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, marginBottom: 8 }}>
                  รายละเอียด · {selTruck?.registration}
                </div>
                <BlockCard
                  sched={selSched}
                  truckColor={selTruck?.colorHex}
                  onStatus={(id, status) => updateStatus({ id, status })}
                  updating={updating && uv?.id === selSched.id}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </ConcreteShell>
  );
}
