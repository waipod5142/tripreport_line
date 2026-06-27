import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router";
import {
  Plus, Check, Package, Truck, ChevronLeft, Clock,
  MapPin, Navigation, CheckCircle, Send, Loader2, Trash2,
} from "lucide-react";
import ConcreteShell from "../components/ConcreteShell";
import { useMyOrders, useDeleteOrder } from "../hooks/useOrders";

/* ── Helpers ──────────────────────────────────────────── */
const fmtTHB = (n) =>
  "฿" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0 });


function mapSched(s) {
  return {
    truckReg:    s.truck?.registration || "—",
    truckColor:  s.truck?.colorHex     || "#2B6CF0",
    truckType:   s.truck?.truckType    || "—",
    truckCap:    +(s.truck?.capacity   || 0),
    quantityM3:  +(s.quantityM3        || 0),
    driverName:  s.driver?.username    || s.driver?.email || "—",
    driverPhone: s.driver?.phone       || "—",
    start:       (s.scheduledStartTime || "").slice(0, 5) || "—",
    end:         (s.scheduledEndTime   || "").slice(0, 5) || "—",
  };
}

function toUiOrder(db) {
  const item   = db.items?.[0];
  const scheds = (db.schedules ?? []).map(mapSched);
  return {
    id:          db.id,
    orderNumber: db.orderNumber ?? "",
    status:      db.status,
    grade:       item?.product?.grade  || "—",
    productName: item?.product?.name   || "—",
    qty:         item ? +item.quantityM3 : 0,
    site: {
      area:  db.deliveryArea  || "—",
      label: db.deliveryLabel || db.deliveryArea || "—",
    },
    preferredDate: db.preferredDate || "",
    arrivalTime:   db.preferredTimeSlot || "—",
    totalAmount:   +(db.totalAmount || 0),
    schedules:     scheds,
    schedule:      scheds[0] ?? null,   // kept for single-truck backward compat
    sitePhotoUrls: Array.isArray(db.sitePhotoUrls) ? db.sitePhotoUrls : [],
    progress:  0,
    etaMin:    0,
    createdAt: db.createdAt,
  };
}

/* ── Status meta ──────────────────────────────────────── */
const STATUS_META = {
  pending:    { label: "รอยืนยัน",    color: "var(--st-pending)"   },
  confirmed:  { label: "ยืนยันแล้ว",  color: "var(--st-confirmed)" },
  scheduled:  { label: "จัดคิวแล้ว",  color: "var(--st-scheduled)" },
  in_transit: { label: "กำลังจัดส่ง", color: "var(--st-transit)"   },
  delivered:  { label: "ส่งสำเร็จ",   color: "var(--st-delivered)" },
  cancelled:  { label: "ยกเลิก",      color: "var(--st-cancelled)" },
};

const PIPELINE = ["pending", "confirmed", "scheduled", "in_transit", "delivered"];
const PIPELINE_LABELS = {
  pending:    "รับคำสั่งซื้อ",
  confirmed:  "จัดคิวรถโม่",
  scheduled:  "ยืนยันออเดอร์",
  in_transit: "กำลังจัดส่ง",
  delivered:  "ส่งสำเร็จ",
};

/* ── Status badge ─────────────────────────────────────── */
function StatusBadge({ status, sm }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span
      className={`badge badge-${status}`}
      style={sm ? { height: 21, fontSize: 11, padding: "0 8px" } : undefined}
    >
      <span className="dot" />
      {m.label}
    </span>
  );
}

/* ── Order pipeline tracker ───────────────────────────── */
function OrderTracker({ order }) {
  const idx = PIPELINE.indexOf(order.status);
  return (
    <div className="track">
      {PIPELINE.map((st, i) => {
        const done = i < idx;
        const cur  = i === idx;
        return (
          <div className="track-step" key={st}>
            <div className="track-rail">
              <div className={`track-node${done ? " done" : cur ? " cur" : ""}`}>
                {done ? <Check size={12} /> : cur ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} /> : i + 1}
              </div>
              {i < PIPELINE.length - 1 && <div className={`track-bar${done ? " done" : ""}`} />}
            </div>
            <div className="track-content">
              <div style={{ fontWeight: cur ? 700 : 600, fontSize: 13, color: cur ? "var(--primary)" : done ? "var(--ink)" : "var(--ink-3)" }}>
                {PIPELINE_LABELS[st]}
              </div>
              {cur && st === "in_transit" && (
                <div style={{ fontSize: 11.5, color: "var(--st-transit)", marginTop: 2 }}>
                  ถึงในอีกประมาณ {order.etaMin} นาที
                </div>
              )}
              {st === "scheduled" && i <= idx && order.schedules?.length > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                  {order.schedules.map((s, si) => (
                    <span key={si}>รถ {s.truckReg} · {s.quantityM3} คิว · {s.start}–{s.end} น.</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── LINE chat ────────────────────────────────────────── */
const LINE_MARK = (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M12 3C6.8 3 2.5 6.4 2.5 10.6c0 3.8 3.4 7 8 7.6.3.06.7.2.8.46.07.24.05.6.02.85l-.13.8c-.04.24-.2.94.82.51 1.02-.42 5.5-3.24 7.5-5.55 1.38-1.5 2-3.05 2-4.67C21.5 6.4 17.2 3 12 3Z" fill="#06C755" />
  </svg>
);

function buildThread(order) {
  const msgs = [];
  const num = (order.orderNumber ?? "").slice(-4);
  const sch = order.schedule;

  msgs.push({ type: "day", label: "วันนี้" });

  // order placed
  msgs.push({ type: "in", time: "08:02", text: `สวัสดีค่ะ 🙏 รับคำสั่งซื้อ #${num} เรียบร้อยแล้วค่ะ ทีมงานกำลังตรวจสอบคิวจัดส่งให้นะคะ` });
  msgs.push({
    type: "card", time: "08:02", card: "order",
    rows: [
      { k: "สินค้า",   v: order.productName },
      { k: "ปริมาณ",  v: `${order.qty} ลบ.ม. (คิว)` },
      { k: "หน้างาน", v: order.site.label },
      { k: "วันที่ส่ง", v: order.preferredDate ? order.preferredDate.split("-").reverse().join("/") : "—" },
      { k: "ถึงหน้างาน", v: `${order.arrivalTime} น.` },
      { k: "ยอดรวม",  v: fmtTHB(order.totalAmount), highlight: true },
    ],
    photos: order.sitePhotoUrls,
    headBg: "linear-gradient(135deg,#3D7BF7,#1F52C9)",
    headLabel: "สรุปคำสั่งซื้อ",
  });

  if (order.status === "pending") return msgs;

  msgs.push({ type: "in", time: "08:11", text: `ยืนยันออเดอร์แล้วค่ะ ✅ กำลังจัดคิวรถโม่ เวลาถึงหน้างาน ${order.arrivalTime} น. ค่ะ` });
  if (order.status === "confirmed") return msgs;

  // scheduled — sch must exist for status >= scheduled
  if (!sch) return msgs;
  const allScheds = order.schedules ?? [sch];
  msgs.push({ type: "in", time: "08:24", text: `จัดรถเรียบร้อยค่ะ 🚛 ${allScheds.length > 1 ? `${allScheds.length} คัน` : ""} รายละเอียดรถและช่วงเวลาจัดส่งตามด้านล่างนี้เลยค่ะ` });
  msgs.push({
    type: "card", time: "08:24", card: "dispatch",
    headBg: "linear-gradient(135deg,#06C755,#05954A)",
    headLabel: "ยืนยันการจัดรถ",
    truckInfo: { reg: sch.truckReg, color: sch.truckColor, type: sch.truckType, cap: sch.truckCap },
    rows: [
      ...allScheds.slice(1).map((s) => ({ k: "รถเพิ่ม", v: `${s.truckReg} · ${s.quantityM3} คิว · ${s.start}–${s.end} น.` })),
      { k: "คนขับ", v: sch.driverName },
      { k: "โทร",   v: sch.driverPhone, green: true },
    ],
    timeWindow: `${sch.start} – ${sch.end} น.`,
    site: order.site,
  });
  msgs.push({ type: "out", time: "08:25", text: "รับทราบครับ ขอบคุณมากครับ 🙏" });
  if (order.status === "scheduled") return msgs;

  // in_transit
  msgs.push({ type: "in", time: sch.start, text: `รถโม่ ${sch.truckReg} ออกจากโรงงานแล้วค่ะ กำลังเดินทางไป${order.site.area} ติดตามตำแหน่งรถแบบเรียลไทม์ได้เลยค่ะ 📍` });
  msgs.push({
    type: "live", time: sch.start,
    progress: order.progress, etaMin: order.etaMin,
    truckReg: sch.truckReg, area: order.site.area,
    done: false,
  });
  if (order.status === "in_transit") return msgs;

  // delivered
  msgs.push({
    type: "live", time: sch.end,
    progress: 100, etaMin: 0,
    truckReg: sch.truckReg, area: order.site.area,
    done: true,
  });
  msgs.push({ type: "in", time: sch.end, text: `ส่งคอนกรีต ${order.qty} คิว ถึงหน้างาน${order.site.area}เรียบร้อยแล้วค่ะ 🎉 ขอบคุณที่ใช้บริการนครคอนกรีตค่ะ` });
  msgs.push({ type: "in", time: sch.end, text: "รบกวนให้คะแนนความพึงพอใจการจัดส่งครั้งนี้ด้วยนะคะ ⭐" });
  msgs.push({ type: "quickReply", time: sch.end, opts: ["ดีมาก 🌟", "ดี 👍", "พอใช้"] });
  return msgs;
}

function LineCard({ msg }) {
  if (msg.card === "order" || msg.card === "dispatch") {
    return (
      <div className="line-card pop-in">
        <div className="line-card-head" style={{ background: msg.headBg }}>
          {msg.card === "order" ? <Package size={15} color="#fff" /> : <Truck size={15} color="#fff" />}
          <div style={{ fontWeight: 700, fontSize: 12.5 }}>{msg.headLabel}</div>
        </div>
        <div className="line-card-body">
          {msg.card === "dispatch" && msg.truckInfo && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--surface-3)", borderRadius: 9, padding: "7px 9px" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: msg.truckInfo.color, color: "#fff", display: "grid", placeItems: "center" }}>
                <Truck size={16} />
              </div>
              <div style={{ lineHeight: 1.25 }}>
                <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "var(--mono)" }}>{msg.truckInfo.reg}</div>
                <div style={{ fontSize: 10, color: "#8A97AC" }}>รถโม่{msg.truckInfo.type} · {msg.truckInfo.cap} คิว</div>
              </div>
            </div>
          )}
          {msg.rows?.map((r, i) => (
            <div key={i} className="lc-row">
              <span className="k">{r.k}</span>
              <span className="v" style={r.highlight ? { color: "var(--primary)", fontSize: 14 } : r.green ? { color: "var(--line-600)", fontFamily: "var(--mono)" } : undefined}>{r.v}</span>
            </div>
          ))}
          {msg.photos?.length > 0 && (
            <div>
              <div style={{ fontSize: 9.5, color: "#8A97AC", fontWeight: 600, marginBottom: 5 }}>รูปหน้างาน</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {msg.photos.slice(0, 4).map((url, i) => (
                  <div key={i} style={{ borderRadius: 7, overflow: "hidden", aspectRatio: "4/3", background: "var(--surface-3)" }}>
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {msg.timeWindow && (
            <div style={{ display: "flex", gap: 7, alignItems: "center", background: "var(--line-50)", borderRadius: 9, padding: "8px 10px" }}>
              <Clock size={15} style={{ color: "var(--line-600)", flex: "0 0 auto" }} />
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 9.5, color: "var(--line-ink)", fontWeight: 600, opacity: .7 }}>ช่วงเวลาจัดส่ง</div>
                <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "var(--mono)", color: "var(--line-ink)" }}>{msg.timeWindow}</div>
              </div>
            </div>
          )}
        </div>
        {msg.card === "dispatch" && (
          <button className="line-card-btn">📍 ดูตำแหน่งหน้างาน</button>
        )}
      </div>
    );
  }
  return null;
}

function LiveBubble({ msg }) {
  return (
    <div className="line-card pop-in">
      <div className="line-card-body" style={{ gap: 9 }}>
        {msg.done ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={18} style={{ color: "var(--st-delivered)", flex: "0 0 auto" }} />
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--st-delivered)" }}>ส่งสำเร็จแล้ว</div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Navigation size={15} style={{ color: "var(--st-transit)" }} className="pulse" />
              <div style={{ fontWeight: 700, fontSize: 12.5, color: "#16202e" }}>กำลังเดินทาง</div>
            </div>
            <div style={{ textAlign: "right", lineHeight: 1 }}>
              <div style={{ fontSize: 9, color: "#8A97AC", fontWeight: 600 }}>ถึงในอีก</div>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--mono)", color: "var(--st-transit)" }}>~{msg.etaMin}<span style={{ fontSize: 9 }}> นาที</span></div>
            </div>
          </div>
        )}
        <div style={{ height: 5, borderRadius: 5, background: "#EAEEF4", overflow: "hidden" }}>
          <div style={{ height: "100%", width: msg.progress + "%", borderRadius: 5, background: msg.done ? "var(--st-delivered)" : "linear-gradient(90deg,#0E97D4,#3D7BF7)", transition: "width 1.1s linear" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8A97AC", fontWeight: 600 }}>
          <span>🏭 โรงงาน</span>
          <span style={{ fontFamily: "var(--mono)" }}>{msg.truckReg}</span>
          <span>{msg.area} <MapPin size={10} /></span>
        </div>
      </div>
    </div>
  );
}

function LineChat({ order }) {
  const bodyRef = useRef(null);
  const msgs = useMemo(() => buildThread(order), [order]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs.length, order.status]);

  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">
        {/* Status bar */}
        <div className="line-status">
          <span style={{ fontFamily: "var(--mono)" }}>09:41</span>
          <span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10, fontWeight: 700 }}>5G ▐▐▐</span>
        </div>
        {/* Chat header */}
        <div className="line-header">
          <button style={{ color: "#fff", display: "grid", placeItems: "center", background: "none", border: "none", cursor: "pointer" }}>
            <ChevronLeft size={20} />
          </button>
          <div className="line-oa-ava">{LINE_MARK}</div>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
              นครคอนกรีต Ready-Mix
              <span style={{ background: "rgba(255,255,255,.25)", fontSize: 8, padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>OA</span>
            </div>
            <div style={{ fontSize: 10, opacity: .9 }}>บัญชีทางการ · ตอบกลับอัตโนมัติ</div>
          </div>
        </div>
        {/* Messages */}
        <div className="line-body" ref={bodyRef}>
          {msgs.map((mm, i) => {
            if (mm.type === "day") return (
              <div key={i} className="line-daypill">{mm.label}</div>
            );
            if (mm.type === "quickReply") return (
              <div key={i} style={{ display: "flex", gap: 6, alignSelf: "flex-end", flexWrap: "wrap", maxWidth: "90%", justifyContent: "flex-end" }}>
                {mm.opts.map((o) => (
                  <button key={o} style={{ background: "#fff", border: "1.5px solid #06C755", color: "var(--line-600)", padding: "6px 11px", borderRadius: 16, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{o}</button>
                ))}
              </div>
            );
            if (mm.type === "card") return (
              <div key={i} className="msg-row in">
                <div className="msg-ava">{LINE_MARK}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <LineCard msg={mm} />
                </div>
                <div className="msg-time">{mm.time}</div>
              </div>
            );
            if (mm.type === "live") return (
              <div key={i} className="msg-row in">
                <div className="msg-ava">{LINE_MARK}</div>
                <LiveBubble msg={mm} />
                <div className="msg-time">{mm.time}</div>
              </div>
            );
            const isOut = mm.type === "out";
            return (
              <div key={i} className={`msg-row ${isOut ? "out" : "in"}`}>
                {!isOut && <div className="msg-ava">{LINE_MARK}</div>}
                <div className={`bubble ${isOut ? "out" : "in"}`}>{mm.text}</div>
                <div className={`msg-time${isOut ? " out" : ""}`}>{mm.time}</div>
              </div>
            );
          })}
        </div>
        {/* Input bar */}
        <div className="line-input">
          <Plus size={18} style={{ color: "#8A97AC" }} />
          <div className="fakebox" />
          <Send size={17} style={{ color: "var(--line)" }} />
        </div>
      </div>
    </div>
  );
}

/* ── MyOrdersPage ─────────────────────────────────────── */
export default function MyOrdersPage() {
  const { data: rawOrders = [], isLoading, isError } = useMyOrders();
  const orders = useMemo(() => rawOrders.map(toUiOrder), [rawOrders]);
  const [selId, setSelId] = useState(null);
  const { mutate: deleteOrder } = useDeleteOrder();
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const selected = orders.find((o) => o.id === selId) ?? orders[0] ?? null;

  function confirmDelete(id) {
    setDeletingId(id);
    setConfirmId(null);
    deleteOrder(id, { onSettled: () => setDeletingId(null) });
  }

  if (isLoading) {
    return (
      <ConcreteShell>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <Loader2 size={32} className="spin" style={{ color: "var(--primary)" }} />
        </div>
      </ConcreteShell>
    );
  }

  if (isError) {
    return (
      <ConcreteShell>
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
          โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
        </div>
      </ConcreteShell>
    );
  }

  if (orders.length === 0) {
    return (
      <ConcreteShell>
        <div className="page fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 16 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--ink-4)" }}>
            <Package size={28} />
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink-2)" }}>ยังไม่มีคำสั่งซื้อ</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>เริ่มสั่งคอนกรีตผสมเสร็จได้เลย</div>
          <Link to="/order" className="btn btn-primary">
            <Plus size={16} /> สั่งคอนกรีต
          </Link>
        </div>
      </ConcreteShell>
    );
  }

  return (
    <ConcreteShell>
      <div className="page fade-in" style={{ maxWidth: 1180 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div className="sec-title" style={{ fontSize: 17 }}>ออเดอร์ของฉัน</div>
          <Link to="/order" className="btn btn-primary btn-sm">
            <Plus size={15} /> สั่งเพิ่ม
          </Link>
        </div>

        <div className="my-orders-grid">
          {/* Left: order list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {orders.map((order) => {
              const sel = selected?.id === order.id;
              return (
                <div
                  key={order.id}
                  onClick={() => setSelId(order.id)}
                  style={{
                    padding: 18, borderRadius: "var(--r)", background: "var(--surface)", cursor: "pointer",
                    border: sel ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                    boxShadow: sel ? "0 0 0 3px var(--primary-100)" : "var(--sh-sm)",
                    transition: ".14s",
                  }}
                >
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
                        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13 }}>#{(order.orderNumber ?? "").slice(-4)}</span>
                        <StatusBadge status={order.status} sm />
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                        {order.productName} · {order.qty} คิว · {order.site.area}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15 }}>{fmtTHB(order.totalAmount)}</div>
                      {order.status === "in_transit" && (
                        <div style={{ fontSize: 11.5, color: "var(--st-transit)", fontWeight: 600 }}>ETA ~{order.etaMin} นาที</div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar for in_transit */}
                  {(order.status === "in_transit" || order.status === "delivered") && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ height: 6, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: order.progress + "%", borderRadius: 4, transition: "width 1s",
                          background: order.status === "delivered" ? "var(--st-delivered)" : "linear-gradient(90deg,var(--st-transit),var(--primary))",
                        }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-3)", marginTop: 5, fontWeight: 600 }}>
                        <span>🏭 โรงงานพระราม 2</span>
                        <span style={{ fontFamily: "var(--mono)" }}>{order.schedules?.map((s) => s.truckReg).join(", ") || "—"}</span>
                        <span>{order.site.area} 📍</span>
                      </div>
                    </div>
                  )}

                  <OrderTracker order={order} />

                  {/* Delete button — until a truck is actually on the road */}
                  {["pending", "confirmed", "scheduled"].includes(order.status) && (
                    <div
                      style={{ marginTop: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {deletingId === order.id ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, fontSize: 12.5, color: "var(--ink-3)" }}>
                          <Loader2 size={13} className="spin" style={{ color: "var(--danger)" }} />
                          กำลังลบออเดอร์…
                        </div>
                      ) : confirmId === order.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {order.schedules?.length > 0 && (
                            <div style={{ fontSize: 11.5, color: "var(--danger)", background: "#FCEBEA", borderRadius: 8, padding: "7px 10px", lineHeight: 1.4 }}>
                              ออเดอร์นี้จัดคิวรถ {order.schedules.length} คันแล้ว — การลบจะยกเลิกคิวรถทั้งหมด
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => setConfirmId(null)}
                              style={{ flex: 1, height: 36, borderRadius: 10, border: "1px solid var(--border-2)", background: "var(--surface-3)", color: "var(--ink-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                            >
                              ยกเลิก
                            </button>
                            <button
                              onClick={() => confirmDelete(order.id)}
                              style={{ flex: 1, height: 36, borderRadius: 10, border: "none", background: "var(--danger)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                            >
                              <Trash2 size={13} /> ยืนยันลบออเดอร์
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(order.id)}
                          style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid var(--border-2)", background: "var(--surface-3)", color: "var(--ink-3)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: ".14s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--danger)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "#FCEBEA"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--ink-3)"; e.currentTarget.style.background = "var(--surface-3)"; }}
                        >
                          <Trash2 size={13} /> ลบออเดอร์
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: LINE chat */}
          <div className="my-orders-phone" style={{ position: "sticky", top: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              {LINE_MARK}
              <div className="sec-title" style={{ fontSize: 14 }}>การแจ้งเตือนทาง LINE</div>
            </div>
            <div className="fade-in" key={selected?.id} style={{ display: "flex", justifyContent: "center" }}>
              {selected && <LineChat order={selected} />}
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--ink-3)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              ทุกครั้งที่อัปเดตสถานะ ลูกค้าได้รับข้อความนี้อัตโนมัติ
            </div>
          </div>
        </div>
      </div>
    </ConcreteShell>
  );
}
