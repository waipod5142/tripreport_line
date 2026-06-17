import { useState } from "react";
import {
  Loader2,
  Truck,
  User,
  Clock,
  MapPin,
  ExternalLink,
  CheckCircle,
  Package,
  X,
  AlertTriangle,
  ChevronRight,
  Plus,
  Minus,
  Pencil,
} from "lucide-react";
import ConcreteShell from "../components/ConcreteShell";
import {
  useAllOrders,
  useConfirmOrder,
  useTrucks,
  useSeedTrucks,
  useSchedules,
  useCreateSchedule,
  useReplaceSchedule,
} from "../hooks/useDispatcher";

/* ── helpers ───────────────────────────────────────────────── */
const fmtTHB = (n) =>
  "฿" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0 });
const fmtQty = (order) =>
  order.items?.reduce((s, i) => s + Number(i.quantityM3 || 0), 0) ?? 0;
const fmtProduct = (order) => order.items?.[0]?.product?.name ?? "—";
const fmtGrade = (order) => order.items?.[0]?.product?.grade ?? "—";

function isToday(dateStr) {
  const d = new Date(dateStr),
    t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

const STATUS_META = {
  pending: { label: "รอยืนยัน", color: "var(--st-pending)" },
  confirmed: { label: "ยืนยันแล้ว", color: "var(--st-confirmed)" },
  scheduled: { label: "จัดคิวแล้ว", color: "var(--st-scheduled)" },
  in_transit: { label: "กำลังจัดส่ง", color: "var(--st-transit)" },
  delivered: { label: "ส่งสำเร็จ", color: "var(--st-delivered)" },
  cancelled: { label: "ยกเลิก", color: "var(--st-cancelled)" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className={`badge badge-${status}`}
      style={{ height: 22, fontSize: 11.5, padding: "0 9px" }}
    >
      <span className="dot" /> {m.label}
    </span>
  );
}

/* 30-min slots 07:00–19:00 */
const SCHED_SLOTS = Array.from({ length: 25 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  if (mins > 19 * 60) return null;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}).filter(Boolean);

/* ── Stat tile ─────────────────────────────────────────────── */
function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        padding: "14px 18px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--ink-3)",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontWeight: 700,
          fontSize: 22,
          color: color ?? "var(--ink)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}


/* ── Order card ────────────────────────────────────────────── */
function OrderCard({ order, onConfirm, onAssign, onEdit, confirming }) {
  const qty = fmtQty(order);
  const photos = Array.isArray(order.sitePhotoUrls) ? order.sitePhotoUrls : [];
  const scheds = order.schedules ?? [];

  const todayStr = new Date().toISOString().split("T")[0];
  const [showPanel, setShowPanel]     = useState(false);
  const [confirmDate, setConfirmDate] = useState(order.preferredDate ?? todayStr);
  const [etaTime, setEtaTime] = useState(() => {
    const s = order.preferredTimeSlot ?? "";
    if (s.includes(":")) return s;
    if (s === "afternoon") return "13:00";
    if (s === "evening")   return "17:00";
    return "08:00";
  });

  function submitConfirm() {
    onConfirm({ id: order.id, preferredDate: confirmDate, preferredTimeSlot: etaTime });
    setShowPanel(false);
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "var(--r)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--sh-sm)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13 }}
          >
            #{order.orderNumber?.slice(-4)}
          </span>
          <StatusBadge status={order.status} />
          {photos.length > 0 && (
            <span
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
                background: "var(--surface-3)",
                borderRadius: 6,
                padding: "2px 7px",
              }}
            >
              📷 {photos.length}
            </span>
          )}
        </div>
        <div
          style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14 }}
        >
          {fmtTHB(order.totalAmount)}
        </div>
      </div>

      {/* Details */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {fmtProduct(order)} · {qty} คิว ({fmtGrade(order)} ksc)
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            fontSize: 12,
            color: "var(--ink-2)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <User size={12} />
            {order.customer?.name ?? order.contactName ?? "—"}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={12} />
            {order.deliveryLabel || order.deliveryArea || "—"}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={12} />
            {order.preferredDate
              ? order.preferredDate.split("-").reverse().join("/")
              : "—"}
            {order.preferredTimeSlot ? ` · ${order.preferredTimeSlot} น.` : ""}
          </span>
        </div>
        {order.contactPhone && (
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            โทร {order.contactPhone}
          </div>
        )}
      </div>

      {/* Actions / truck pills */}
      {order.status === "pending" && !showPanel && (
        <button
          onClick={() => setShowPanel(true)}
          style={{
            width: "100%",
            height: 36,
            borderRadius: 10,
            border: "none",
            background: "var(--st-confirmed-bg)",
            color: "var(--st-confirmed)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <CheckCircle size={14} />
          ยืนยันออเดอร์
        </button>
      )}

      {order.status === "pending" && showPanel && (
        <div
          style={{
            border: "1.5px solid var(--primary-100)",
            borderRadius: 12,
            background: "var(--primary-50)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>
            กำหนดวันและเวลาถึงหน้างาน (ETA)
          </div>

          {/* Date + time row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>วันที่จัดส่ง</div>
              <input
                type="date"
                className="field"
                value={confirmDate}
                min={todayStr}
                onChange={(e) => setConfirmDate(e.target.value)}
                style={{ background: "var(--surface)" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>เวลาถึง (ETA)</div>
              <input
                type="time"
                className="field"
                value={etaTime}
                step={1800}
                onChange={(e) => setEtaTime(e.target.value)}
                style={{ background: "var(--surface)", fontFamily: "var(--mono)", fontWeight: 700 }}
              />
            </div>
          </div>

          {/* Confirm + cancel */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 8, marginTop: 2 }}>
            <button
              onClick={() => setShowPanel(false)}
              style={{
                height: 36,
                borderRadius: 10,
                border: "1px solid var(--border-2)",
                background: "var(--surface)",
                color: "var(--ink-3)",
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              ยกเลิก
            </button>
            <button
              onClick={submitConfirm}
              disabled={confirming || !confirmDate || !etaTime}
              style={{
                height: 36,
                borderRadius: 10,
                border: "none",
                background: confirming || !confirmDate || !etaTime ? "var(--surface-3)" : "var(--primary)",
                color: confirming || !confirmDate || !etaTime ? "var(--ink-4)" : "#fff",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: confirming || !confirmDate || !etaTime ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {confirming ? <Loader2 size={13} className="spin" /> : <CheckCircle size={13} />}
              ยืนยัน & แจ้งลูกค้า
            </button>
          </div>
        </div>
      )}
      {order.status === "confirmed" && (
        <button
          onClick={() => onAssign(order)}
          style={{
            width: "100%",
            height: 36,
            borderRadius: 10,
            border: "none",
            background: "var(--primary)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Truck size={14} /> จัดคิวรถโม่{" "}
          <ChevronRight size={14} style={{ marginLeft: "auto" }} />
        </button>
      )}
      {(order.status === "scheduled" || order.status === "in_transit") &&
        scheds.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {scheds.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 10,
                  background: "var(--surface-3)",
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: s.truck?.colorHex ?? "var(--primary)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                  {s.truck?.registration ?? "—"}
                </span>
                <span style={{ color: "var(--ink-3)" }}>
                  {Number(s.quantityM3 || 0)} คิว
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--mono)",
                    color: "var(--ink-2)",
                  }}
                >
                  {(s.scheduledStartTime ?? "").slice(0, 5)} –{" "}
                  {(s.scheduledEndTime ?? "").slice(0, 5)} น.
                </span>
              </div>
            ))}
            {order.status === "scheduled" && onEdit && (
              <button
                onClick={() => onEdit(order)}
                style={{
                  marginTop: 2,
                  width: "100%",
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid var(--border-2)",
                  background: "var(--surface-3)",
                  color: "var(--ink-2)",
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Pencil size={13} /> แก้ไขการจัดคิว
              </button>
            )}
          </div>
        )}
    </div>
  );
}

/* ── Section header ────────────────────────────────────────── */
function SectionHead({ label, count, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
      }}
    >
      <div
        style={{ width: 4, height: 20, borderRadius: 2, background: color }}
      />
      <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
      <div
        style={{
          minWidth: 22,
          height: 22,
          borderRadius: 11,
          background: color,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          display: "grid",
          placeItems: "center",
          padding: "0 7px",
        }}
      >
        {count}
      </div>
    </div>
  );
}

/* ── Assign Drawer — multi-truck ───────────────────────────── */
const EMPTY_ROW = () => ({
  truckId: "",
  quantityM3: "",
  startTime: "08:00",
  endTime: "10:00",
});

function AssignDrawer({
  order,
  trucks,
  schedules,
  onClose,
  onSubmit,
  submitting,
  error,
  isEdit,
}) {
  const existingRows = (order.schedules ?? []).map((s) => ({
    truckId:    s.truckId ?? "",
    quantityM3: String(Number(s.quantityM3 || 0)),
    startTime:  (s.scheduledStartTime ?? "08:00").slice(0, 5),
    endTime:    (s.scheduledEndTime   ?? "10:00").slice(0, 5),
  }));
  const [rows, setRows] = useState(isEdit && existingRows.length ? existingRows : [EMPTY_ROW()]);
  const [schedDate, setSchedDate] = useState(
    isEdit && order.schedules?.[0]?.scheduledDate
      ? order.schedules[0].scheduledDate
      : (order.preferredDate ?? "")
  );
  const [notes, setNotes] = useState("");

  const totalQty = fmtQty(order);
  const photos = Array.isArray(order.sitePhotoUrls) ? order.sitePhotoUrls : [];
  const allocatedQty = rows.reduce(
    (s, r) => s + (parseFloat(r.quantityM3) || 0),
    0,
  );
  const remaining = +(totalQty - allocatedQty).toFixed(2);

  /* conflict detection per row
     In edit mode, ignore the order's own existing schedules — they will
     be replaced, so they must not be treated as blocking conflicts. */
  const isConflict = (row) => {
    if (!row.truckId || !schedDate || !row.startTime || !row.endTime)
      return false;
    return schedules.some((s) => {
      if (s.truckId !== row.truckId) return false;
      if (s.scheduledDate !== schedDate) return false;
      if (!["scheduled", "in_transit"].includes(s.status)) return false;
      if (isEdit && s.orderId === order.id) return false; // skip own rows
      const sS = (s.scheduledStartTime ?? "").slice(0, 5);
      const sE = (s.scheduledEndTime ?? "").slice(0, 5);
      return sS < row.endTime && sE > row.startTime;
    });
  };

  function update(i, field, value) {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    );
  }

  function addRow() {
    const last = rows[rows.length - 1];
    const qty = remaining > 0 ? String(remaining) : "";
    setRows((prev) => [
      ...prev,
      {
        truckId: "",
        quantityM3: qty,
        startTime: last?.startTime ?? "08:00",
        endTime: last?.endTime ?? "10:00",
      },
    ]);
  }

  function removeRow(i) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const canSubmit =
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.truckId &&
        parseFloat(r.quantityM3) > 0 &&
        r.startTime &&
        r.endTime &&
        !isConflict(r),
    ) &&
    schedDate &&
    remaining >= 0 &&
    !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      orderId: order.id,
      assignments: rows.map((r) => ({
        truckId: r.truckId,
        quantityM3: parseFloat(r.quantityM3),
        scheduledDate: schedDate,
        scheduledStartTime: r.startTime,
        scheduledEndTime: r.endTime,
      })),
      dispatcherNotes: notes,
    });
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,27,45,.35)",
          zIndex: 40,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(460px,100vw)",
          background: "var(--surface-2)",
          zIndex: 50,
          overflowY: "auto",
          boxShadow: "-4px 0 24px rgba(15,27,45,.18)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: "1px solid var(--border-2)",
              background: "none",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              color: "var(--ink-2)",
            }}
          >
            <X size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {isEdit ? "แก้ไขการจัดคิว" : "จัดคิวออเดอร์"}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-3)",
                fontFamily: "var(--mono)",
              }}
            >
              #{order.orderNumber} · {totalQty} คิว
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Order summary */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 10,
                color: "var(--ink-2)",
              }}
            >
              สรุปออเดอร์
            </div>
            {[
              ["สินค้า", fmtProduct(order)],
              ["ปริมาณรวม", `${totalQty} ลบ.ม. (คิว)`],
              ["ลูกค้า", order.customer?.name ?? order.contactName ?? "—"],
              ["โทรศัพท์", order.contactPhone ?? "—"],
              ["หน้างาน", order.deliveryLabel || order.deliveryArea || "—"],
              [
                "วันที่",
                order.preferredDate
                  ? order.preferredDate.split("-").reverse().join("/")
                  : "—",
              ],
              [
                "เวลาถึง",
                order.preferredTimeSlot ? `${order.preferredTimeSlot} น.` : "—",
              ],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 12.5,
                  padding: "3px 0",
                }}
              >
                <span
                  style={{ color: "var(--ink-3)", width: 90, flexShrink: 0 }}
                >
                  {k}
                </span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            {order.deliveryGeoLink && (
              <a
                href={order.deliveryGeoLink}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                  color: "var(--primary)",
                  marginTop: 6,
                }}
              >
                <ExternalLink size={12} /> ดูพิกัดหน้างาน
              </a>
            )}
          </div>

          {/* Site photos */}
          {photos.length > 0 && (
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 12.5,
                  color: "var(--ink-2)",
                  marginBottom: 8,
                }}
              >
                รูปหน้างาน
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                {photos.slice(0, 4).map((url, i) => (
                  <div
                    key={i}
                    style={{
                      borderRadius: 10,
                      overflow: "hidden",
                      aspectRatio: "4/3",
                      background: "var(--surface-3)",
                    }}
                  >
                    <img
                      src={url}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              วันที่จัดส่ง
            </div>
            <input
              type="date"
              className="field"
              value={schedDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setSchedDate(e.target.value)}
            />
          </div>

          {/* Multi-truck allocation */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>จัดสรรรถโม่</div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  color:
                    remaining === 0
                      ? "var(--st-delivered)"
                      : remaining < 0
                        ? "var(--danger)"
                        : "var(--ink-3)",
                  fontWeight: 700,
                }}
              >
                {allocatedQty.toFixed(1)} / {totalQty} คิว{" "}
                {remaining === 0
                  ? "✓"
                  : remaining < 0
                    ? "⚠ เกิน"
                    : `(เหลือ ${remaining})`}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((row, i) => {
                const conflict = isConflict(row);
                const truckObj = trucks.find((t) => t.id === row.truckId);
                return (
                  <div
                    key={i}
                    style={{
                      background: "var(--surface)",
                      border: `1px solid ${conflict ? "var(--danger)" : "var(--border)"}`,
                      borderRadius: 12,
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 9,
                    }}
                  >
                    {/* Row label + remove */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {truckObj && (
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: truckObj.colorHex ?? "var(--primary)",
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "var(--ink-2)",
                          }}
                        >
                          รถคันที่ {i + 1}
                        </span>
                        {conflict && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--danger)",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            <AlertTriangle size={11} /> ติดคิว
                          </span>
                        )}
                      </div>
                      {rows.length > 1 && (
                        <button
                          onClick={() => removeRow(i)}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 7,
                            border: "1px solid var(--border-2)",
                            background: "none",
                            cursor: "pointer",
                            display: "grid",
                            placeItems: "center",
                            color: "var(--ink-3)",
                          }}
                        >
                          <Minus size={13} />
                        </button>
                      )}
                    </div>

                    {/* Truck + Qty */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 8,
                        alignItems: "end",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--ink-3)",
                            marginBottom: 4,
                          }}
                        >
                          รถโม่
                        </div>
                        <select
                          className="field"
                          value={row.truckId}
                          onChange={(e) => update(i, "truckId", e.target.value)}
                        >
                          <option value="">— เลือกรถ —</option>
                          {trucks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.registration} · {t.truckType} · {t.capacity}{" "}
                              คิว
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ width: 90 }}>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--ink-3)",
                            marginBottom: 4,
                          }}
                        >
                          ปริมาณ (คิว)
                        </div>
                        <div style={{ position: "relative" }}>
                          <input
                            type="number"
                            className="field mono"
                            style={{
                              textAlign: "center",
                              fontWeight: 700,
                              paddingRight: 28,
                            }}
                            min={0.5}
                            max={truckObj ? Number(truckObj.capacity) : 12}
                            step={0.5}
                            value={row.quantityM3}
                            onChange={(e) =>
                              update(i, "quantityM3", e.target.value)
                            }
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v))
                                update(
                                  i,
                                  "quantityM3",
                                  String(Math.round(v * 2) / 2),
                                );
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              right: 8,
                              top: "50%",
                              transform: "translateY(-50%)",
                              fontSize: 11,
                              color: "var(--ink-3)",
                              pointerEvents: "none",
                            }}
                          >
                            คิว
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Capacity warning */}
                    {truckObj &&
                      parseFloat(row.quantityM3 || "0") >
                        Number(truckObj.capacity) && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--st-pending)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <AlertTriangle size={11} /> เกินความจุรถ (
                          {truckObj.capacity} คิว)
                        </div>
                      )}

                    {/* Time window */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--ink-3)",
                            marginBottom: 4,
                          }}
                        >
                          เริ่ม
                        </div>
                        <select
                          className="field"
                          value={row.startTime}
                          onChange={(e) =>
                            update(i, "startTime", e.target.value)
                          }
                        >
                          {SCHED_SLOTS.map((t) => (
                            <option key={t} value={t}>
                              {t} น.
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--ink-3)",
                            marginBottom: 4,
                          }}
                        >
                          สิ้นสุด
                        </div>
                        <select
                          className="field"
                          value={row.endTime}
                          onChange={(e) => update(i, "endTime", e.target.value)}
                        >
                          {SCHED_SLOTS.filter((t) => t > row.startTime).map(
                            (t) => (
                              <option key={t} value={t}>
                                {t} น.
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add truck row */}
            <button
              onClick={addRow}
              style={{
                marginTop: 10,
                width: "100%",
                height: 38,
                borderRadius: 10,
                border: "1.5px dashed var(--border-2)",
                background: "none",
                color: "var(--primary)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Plus size={15} /> เพิ่มรถโม่คันที่ {rows.length + 1}
            </button>
          </div>

          {/* Notes */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              หมายเหตุสำหรับคนขับ
            </div>
            <textarea
              className="field"
              style={{ height: 72, resize: "vertical" }}
              placeholder="เช่น เส้นทาง ซอยแคบ..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {remaining < 0 && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FCEBEA", color: "var(--danger)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} />
              ปริมาณรวมเกินออเดอร์ {Math.abs(remaining).toFixed(1)} คิว — กรุณาลดปริมาณก่อนยืนยัน
            </div>
          )}
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "#FCEBEA",
                color: "var(--danger)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 12,
              border: "none",
              background: canSubmit ? "var(--primary)" : "var(--surface-3)",
              color: canSubmit ? "#fff" : "var(--ink-4)",
              fontWeight: 700,
              fontSize: 14,
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: ".14s",
            }}
          >
            {submitting ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Truck size={16} />
            )}
            {isEdit ? "บันทึกการแก้ไข" : `ยืนยันจัดคิว${rows.length > 1 ? ` (${rows.length} คัน)` : ""} & แจ้งลูกค้า`}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── DispatcherDashboard ───────────────────────────────────── */
export default function DispatcherDashboard() {
  const { data: rawOrders = [], isLoading } = useAllOrders();
  const { data: trucks = [] } = useTrucks();
  const { data: schedules = [] } = useSchedules();
  const {
    mutate: confirmOrder,
    isPending: confirming,
    variables: confirmingId,
  } = useConfirmOrder();
  const { mutate: createSchedule, isPending: submittingCreate } = useCreateSchedule();
  const { mutate: replaceSchedule, isPending: submittingReplace } = useReplaceSchedule();
  const { mutate: seedTrucks, isPending: seeding } = useSeedTrucks();

  const [assignOrder,  setAssignOrder]  = useState(null);
  const [isEditMode,   setIsEditMode]   = useState(false);
  const [drawerError,  setDrawerError]  = useState(null);

  const submitting = submittingCreate || submittingReplace;

  const todayStr = new Date().toISOString().split("T")[0];
  const todayOrds = rawOrders.filter((o) => isToday(o.createdAt));
  const todayVol = todayOrds.reduce((s, o) => s + fmtQty(o), 0);
  const todaySale = todayOrds.reduce(
    (s, o) => s + Number(o.totalAmount ?? 0),
    0,
  );

  const pending = rawOrders.filter((o) => o.status === "pending");
  const confirmed = rawOrders.filter((o) => o.status === "confirmed");
  const inTransit = rawOrders.filter((o) => o.status === "in_transit");
  const active = rawOrders.filter((o) =>
    ["scheduled", "in_transit"].includes(o.status),
  );

  function openAssign(order) {
    setIsEditMode(false);
    setDrawerError(null);
    setAssignOrder(order);
  }

  function openEdit(order) {
    setIsEditMode(true);
    setDrawerError(null);
    setAssignOrder(order);
  }

  function handleAssign(data) {
    setDrawerError(null);
    const mutate = isEditMode ? replaceSchedule : createSchedule;
    mutate(data, {
      onSuccess: () => { setAssignOrder(null); setIsEditMode(false); },
      onError: (err) => setDrawerError(err.response?.data?.error ?? "เกิดข้อผิดพลาด"),
    });
  }

  if (isLoading) {
    return (
      <ConcreteShell>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 300,
          }}
        >
          <Loader2
            size={32}
            className="spin"
            style={{ color: "var(--primary)" }}
          />
        </div>
      </ConcreteShell>
    );
  }

  return (
    <ConcreteShell>
      <div className="page fade-in" style={{ maxWidth: 1100 }}>
        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <StatTile
            label="รอยืนยัน"
            value={pending.length}
            color="var(--st-pending)"
          />
          <StatTile
            label="รอจัดคิวรถ"
            value={confirmed.length}
            color="var(--st-confirmed)"
          />
          <StatTile
            label="กำลังจัดส่ง"
            value={inTransit.length}
            color="var(--st-transit)"
          />
          <StatTile
            label="ปริมาณวันนี้"
            value={`${todayVol.toFixed(1)} คิว`}
            color="var(--ink)"
          />
          <StatTile
            label="ยอดขายวันนี้"
            value={fmtTHB(todaySale)}
            color="var(--primary)"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 300px",
            gap: 18,
            alignItems: "start",
          }}
        >
          {/* Order queue */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <section>
              <SectionHead
                label="ออเดอร์ใหม่ รอยืนยัน"
                count={pending.length}
                color="var(--st-pending)"
              />
              {pending.length === 0 ? (
                <EmptySection text="ไม่มีออเดอร์รอยืนยัน" />
              ) : (
                pending.map((o) => (
                  <div key={o.id} style={{ marginBottom: 10 }}>
                    <OrderCard
                      order={o}
                      onConfirm={(data) => confirmOrder(data)}
                      confirming={confirming && confirmingId?.id === o.id}
                    />
                  </div>
                ))
              )}
            </section>

            <section>
              <SectionHead
                label="รอจัดคิวรถโม่"
                count={confirmed.length}
                color="var(--st-confirmed)"
              />
              {confirmed.length === 0 ? (
                <EmptySection text="ไม่มีออเดอร์รอจัดคิว" />
              ) : (
                confirmed.map((o) => (
                  <div key={o.id} style={{ marginBottom: 10 }}>
                    <OrderCard order={o} onAssign={openAssign} />
                  </div>
                ))
              )}
            </section>

            {active.length > 0 && (
              <section>
                <SectionHead
                  label="กำลังดำเนินการ"
                  count={active.length}
                  color="var(--st-transit)"
                />
                {active.map((o) => (
                  <div key={o.id} style={{ marginBottom: 10 }}>
                    <OrderCard order={o} onEdit={openEdit} />
                  </div>
                ))}
              </section>
            )}
          </div>

          {/* Fleet panel */}
          <div
            style={{
              position: "sticky",
              top: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>รถโม่ในระบบ</div>
                {trucks.length === 0 && (
                  <button
                    onClick={() => seedTrucks()}
                    disabled={seeding}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: "var(--primary)",
                      background: "var(--primary-50)",
                      border: "none",
                      borderRadius: 8,
                      padding: "4px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {seeding ? "…" : "+ เพิ่มรถตัวอย่าง"}
                  </button>
                )}
              </div>
              {trucks.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--ink-3)",
                    fontSize: 12.5,
                    padding: "12px 0",
                  }}
                >
                  <Package
                    size={28}
                    style={{ marginBottom: 6, opacity: 0.4 }}
                  />
                  <div>ยังไม่มีรถในระบบ</div>
                </div>
              ) : (
                trucks.map((truck) => {
                  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })();
                  const truckScheds = schedules.filter(
                    (s) => s.truckId === truck.id && ["scheduled","in_transit"].includes(s.status)
                  );
                  const busyToday    = truckScheds.some((s) => s.scheduledDate === todayStr);
                  const busyTomorrow = truckScheds.some((s) => s.scheduledDate === tomorrowStr);
                  const dotColor = busyToday ? "var(--st-transit)" : busyTomorrow ? "var(--st-pending)" : "var(--st-delivered)";
                  const label    = busyToday ? "ติดคิววันนี้" : busyTomorrow ? "ติดคิวพรุ่งนี้" : "ว่าง";
                  return (
                    <div
                      key={truck.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "var(--surface-3)",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, lineHeight: 1.3 }}>
                        <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12.5 }}>
                          {truck.registration}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                          {truck.truckType} · {truck.capacity} คิว
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: dotColor }}>
                        {label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                padding: "14px 16px",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                สรุปวันนี้
              </div>
              {[
                [
                  "ออเดอร์ใหม่",
                  todayOrds.filter((o) => o.status === "pending").length,
                ],
                ["ปริมาณรวม", `${todayVol.toFixed(1)} คิว`],
                ["ยอดรวม", fmtTHB(todaySale)],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12.5,
                    padding: "5px 0",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--ink-2)",
                  }}
                >
                  <span>{k}</span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      color: "var(--ink)",
                    }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {assignOrder && (
        <AssignDrawer
          order={assignOrder}
          trucks={trucks}
          schedules={schedules}
          isEdit={isEditMode}
          onClose={() => { setAssignOrder(null); setIsEditMode(false); setDrawerError(null); }}
          onSubmit={handleAssign}
          submitting={submitting}
          error={drawerError}
        />
      )}
    </ConcreteShell>
  );
}

function EmptySection({ text }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "18px 0",
        color: "var(--ink-4)",
        fontSize: 13,
        background: "var(--surface-3)",
        borderRadius: 12,
      }}
    >
      {text}
    </div>
  );
}
