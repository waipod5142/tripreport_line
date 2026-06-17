import { useState, useMemo, useEffect, useRef } from "react";
import {
  CheckCircle,
  Check,
  ChevronRight,
  ChevronLeft,
  Info,
  MapPin,
  Link2,
  Camera,
  ExternalLink,
  X,
  User,
  Phone,
  Loader2,
} from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ConcreteShell from "../components/ConcreteShell";
import { useConcreteProducts } from "../hooks/useConcreteProducts";
import { useCreateOrder } from "../hooks/useOrders";

/* Normalise DB row to the shape the UI uses */
const toProduct = (row) => ({
  id: row.id,
  grade: row.grade,
  name: row.name,
  use: row.useCase,
  price: +row.pricePerCubicMeter,
  minM3: +row.minOrderM3,
});

/* 30-min arrival time slots 07:00 – 18:00 */
const TIME_SLOTS = Array.from({ length: 23 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

/* ── Helpers ──────────────────────────────────────────── */
const fmtTHB = (n) =>
  "฿" +
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

function snapQty(v) {
  return Math.min(100, Math.max(0.5, Math.round(v * 2) / 2));
}



function parseMapsInput(raw) {
  if (!raw) return null;
  const txt = raw.trim();
  let m =
    txt.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/) ||
    txt.match(
      /[?&](?:q|ll|center|destination)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    ) ||
    txt.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (m) return { lat: (+m[1]).toFixed(6), lng: (+m[2]).toFixed(6) };
  m = txt.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (m) return { lat: (+m[1]).toFixed(6), lng: (+m[2]).toFixed(6) };
  return null;
}

function isMapsShortLink(raw) {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps)/i.test(
    (raw || "").trim(),
  );
}

const BANGKOK_CENTER = { lat: "13.756330", lng: "100.501762", x: 50, y: 45 };

/* ── Minimal Bangkok SVG backdrop ────────────────────── */
function MapBackdrop() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <defs>
        <linearGradient id="cfMapBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E4ECF5" />
          <stop offset="1" stopColor="#D5E2F0" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#cfMapBg)" />
      <rect x="8" y="20" width="14" height="11" rx="2" fill="#CFE3CE" />
      <rect x="68" y="14" width="16" height="13" rx="2" fill="#CFE3CE" />
      <rect x="70" y="70" width="18" height="14" rx="2" fill="#CFE3CE" />
      <rect x="14" y="66" width="12" height="10" rx="2" fill="#D4E0EE" />
      <path
        d="M 18 -5 C 26 18, 14 30, 28 46 C 40 60, 30 76, 44 96"
        fill="none"
        stroke="#A9CDE8"
        strokeWidth="5.5"
        strokeLinecap="round"
        opacity=".9"
      />
      <g stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" opacity=".95">
        <path d="M 0 78 H 100" />
        <path d="M 50 0 V 100" />
        <path d="M 0 48 H 100" />
        <path d="M 78 0 V 100" />
        <path d="M 0 24 H 100" />
        <path d="M 24 0 V 100" />
      </g>
      <g stroke="#EDF3FA" strokeWidth="1.1" strokeLinecap="round">
        <path d="M 0 34 H 100" />
        <path d="M 0 62 H 100" />
        <path d="M 0 90 H 100" />
        <path d="M 12 0 V 100" />
        <path d="M 36 0 V 100" />
        <path d="M 62 0 V 100" />
        <path d="M 90 0 V 100" />
      </g>
    </svg>
  );
}

/* ── GeoAttach ────────────────────────────────────────── */
function GeoAttach({ geo, setGeo }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");

  const applyPaste = () => {
    const coords = parseMapsInput(url);
    if (coords) {
      setGeo({ ...coords, method: "link", link: url.trim() });
      setErr("");
      return;
    }
    if (isMapsShortLink(url)) {
      setGeo({ lat: BANGKOK_CENTER.lat, lng: BANGKOK_CENTER.lng, method: "link", link: url.trim(), approx: true });
      setErr("");
      return;
    }
    setErr("ไม่พบพิกัดในลิงก์ — วางลิงก์ Google Maps หรือพิกัด เช่น 13.7234, 100.5678");
  };

  if (geo) {
    return (
      <div style={{ borderRadius: 12, border: "1.5px solid var(--primary)", overflow: "hidden", boxShadow: "0 0 0 3px var(--primary-100)" }}>
        <div style={{ position: "relative", height: 110 }}>
          <MapBackdrop />
          <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-100%)", color: "var(--primary)", filter: "drop-shadow(0 4px 5px rgba(15,27,45,.35))" }}>
            <MapPin size={30} fill="var(--primary)" />
          </div>
          <div style={{ position: "absolute", top: 9, left: 9, background: "rgba(255,255,255,.92)", borderRadius: 7, padding: "3px 9px", fontSize: 10.5, fontWeight: 700, color: "var(--primary-700)", display: "flex", alignItems: "center", gap: 5 }}>
            <Link2 size={12} /> จากลิงก์ Google Maps{geo.approx ? " (โดยประมาณ)" : ""}
          </div>
        </div>
        <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 12, background: "var(--surface)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--st-delivered)" }}><CheckCircle size={15} /></span>
              แนบตำแหน่งแล้ว
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
              {geo.lat}, {geo.lng}
            </div>
          </div>
          <button onClick={() => { setGeo(null); setUrl(""); setErr(""); }} className="btn btn-ghost btn-sm">เปลี่ยน</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", pointerEvents: "none" }}>
            <Link2 size={16} />
          </span>
          <input
            className={`field${err ? " err" : ""}`}
            style={{ paddingLeft: 36 }}
            value={url}
            onChange={(e) => { setUrl(e.target.value); if (err) setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") applyPaste(); }}
            placeholder="วางลิงก์จากแอป Google Maps หรือพิกัด เช่น 13.7234, 100.5678"
          />
        </div>
        <button className="btn btn-primary" disabled={!url.trim()} onClick={applyPaste}>ใช้ลิงก์</button>
      </div>
      {err
        ? <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 7, display: "flex", gap: 6, alignItems: "flex-start" }}><Info size={13} style={{ flex: "0 0 auto", marginTop: 1 }} /> {err}</div>
        : <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 7, display: "flex", gap: 6, alignItems: "flex-start" }}><Info size={13} style={{ flex: "0 0 auto", marginTop: 1 }} /> ในแอป Google Maps กด <b style={{ margin: "0 3px" }}>แชร์ → คัดลอกลิงก์</b> แล้ววางที่นี่</div>
      }
    </div>
  );
}

/* ── PhotoDrop ────────────────────────────────────────── */
function PhotoDrop({ photos, setPhotos, count = 4 }) {
  const onFile = (i, file) => {
    if (!file || !/^image\//.test(file.type)) return;
    const r = new FileReader();
    r.onload = (e) =>
      setPhotos((p) => {
        const n = [...p];
        n[i] = e.target.result;
        return n;
      });
    r.readAsDataURL(file);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(count, 4)}, 1fr)`,
        gap: 10,
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const img = photos[i];
        if (img)
          return (
            <div
              key={i}
              style={{
                position: "relative",
                borderRadius: 11,
                overflow: "hidden",
                aspectRatio: "4/3",
                border: "1px solid var(--border-2)",
              }}
            >
              <img
                src={img}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <button
                onClick={() =>
                  setPhotos((p) => {
                    const n = [...p];
                    n[i] = undefined;
                    return n;
                  })
                }
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  background: "rgba(15,27,45,.66)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <X size={14} />
              </button>
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  bottom: 6,
                  background: "rgba(15,27,45,.62)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 6,
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <Check size={11} /> แนบแล้ว
              </div>
            </div>
          );
        return (
          <label
            key={i}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(i, e.dataTransfer.files[0]);
            }}
            style={{
              cursor: "pointer",
              borderRadius: 11,
              border: "1.5px dashed var(--border-2)",
              aspectRatio: "4/3",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              color: "var(--ink-3)",
              background: "var(--surface-2)",
              textAlign: "center",
              padding: 8,
              transition: ".13s",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--surface-3)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Camera size={19} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>
              เพิ่มรูปหน้างาน
            </span>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => onFile(i, e.target.files[0])}
            />
          </label>
        );
      })}
    </div>
  );
}

/* ── Summary row ──────────────────────────────────────── */
function SumRow({ k, v }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        fontSize: 13.5,
      }}
    >
      <span
        style={{
          color: "var(--ink-3)",
          width: 84,
          flex: "0 0 84px",
          fontWeight: 500,
        }}
      >
        {k}
      </span>
      <span style={{ fontWeight: 600 }}>{v}</span>
    </div>
  );
}

/* ── Toast ────────────────────────────────────────────── */
function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="cf-toast">
      <span style={{ color: "#7CE49B", display: "grid", placeItems: "center" }}>
        <CheckCircle size={18} />
      </span>
      {msg}
    </div>
  );
}

/* ── Main OrderPage ───────────────────────────────────── */
export default function OrderPage() {
  const {
    data: rawProducts,
    isLoading: productsLoading,
    isError: productsError,
  } = useConcreteProducts();
  const { mutateAsync: submitOrder, isPending: isSubmitting } =
    useCreateOrder();

  const PRODUCTS = useMemo(
    () => (rawProducts || []).map(toProduct),
    [rawProducts],
  );

  const [step, setStep] = useState(0);
  const [pid, setPid] = useState(null);
  const [qty, setQty] = useState(0);
  const [qtyStr, setQtyStr] = useState("0");
  const [site, setSite] = useState("");
  const [arrivalTime, setArrivalTime] = useState("08:00");
  const [date, setDate] = useState(new Date());
  const [note, setNote] = useState("");
  const [geo, setGeo] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [cname, setCname] = useState("");
  const [tel, setTel] = useState("");
  const [touched, setTouched] = useState(false);
  const [toast, setToast] = useState(null);
  const [placed, setPlaced] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);

  const contentRef = useRef(null);

  // Derive selected product — default to 240 ksc, fall back to first item
  const defaultPid = useMemo(() => {
    if (!PRODUCTS.length) return null;
    return (PRODUCTS.find((p) => p.grade === "240") || PRODUCTS[0]).id;
  }, [PRODUCTS]);

  const effectivePid = pid ?? defaultPid;
  const product = PRODUCTS.find((p) => p.id === effectivePid) || null;
  const effectiveQty = product ? Math.max(qty, 0.5) : qty;
  const subtotal = product ? product.price * effectiveQty : 0;

  const steps = ["เลือกคอนกรีต", "หน้างาน & เวลา", "ติดต่อ & ยืนยัน"];

  const filledPhotos = photos.filter(Boolean);
  const telDigits = tel.replace(/\D/g, "");
  const telOk =
    telDigits.length >= 9 && telDigits.length <= 10 && telDigits[0] === "0";
  const nameOk = cname.trim().length >= 2;
  const contactOk = nameOk && telOk;

  const goNext = () => {
    setStep((s) => s + 1);
    setTimeout(
      () => contentRef.current?.scrollTo({ top: 0, behavior: "smooth" }),
      50,
    );
  };
  const goBack = () => {
    setStep((s) => s - 1);
    setTimeout(
      () => contentRef.current?.scrollTo({ top: 0, behavior: "smooth" }),
      50,
    );
  };

  const placeOrder = async () => {
    if (!contactOk) {
      setTouched(true);
      return;
    }
    try {
      const result = await submitOrder({
        productId: effectivePid,
        quantityM3: effectiveQty,
        deliveryArea: site,
        deliveryLabel: site,
        deliveryLat: geo?.lat ?? null,
        deliveryLng: geo?.lng ?? null,
        deliveryGeoLink: geo?.link ?? null,
        deliveryGeoMethod: geo?.method ?? null,
        preferredDate: date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}` : null,
        preferredTimeSlot: arrivalTime,
        specialInstructions: note || null,
        contactName: cname.trim(),
        contactPhone: tel,
        sitePhotoUrls: filledPhotos,
      });
      setPlacedOrder(result);
      setPlaced(true);
      setToast("ส่งคำสั่งซื้อแล้ว · รอการยืนยันจากทีมงาน");
    } catch {
      setToast("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    }
  };

  const reset = () => {
    setStep(0);
    setPid(null);
    setQty(4);
    setQtyStr("4");
    setSite("");
    setArrivalTime("08:00");
    setDate(new Date());
    setNote("");
    setGeo(null);
    setPhotos([]);
    setCname("");
    setTel("");
    setTouched(false);
    setPlaced(false);
    setPlacedOrder(null);
  };

  if (productsLoading) {
    return (
      <ConcreteShell contentRef={contentRef}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 320,
            gap: 14,
            color: "var(--ink-3)",
          }}
        >
          <Loader2 size={32} className="spin" />
          <div style={{ fontWeight: 600 }}>กำลังโหลดข้อมูลคอนกรีต…</div>
        </div>
      </ConcreteShell>
    );
  }

  if (productsError || !product) {
    return (
      <ConcreteShell contentRef={contentRef}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 320,
            gap: 10,
            color: "var(--danger)",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            ไม่สามารถโหลดข้อมูลคอนกรีตได้
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            กรุณาลองใหม่อีกครั้ง
          </div>
        </div>
      </ConcreteShell>
    );
  }

  return (
    <ConcreteShell contentRef={contentRef}>
      <div className="page fade-in" style={{ maxWidth: 780 }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div
            className="sec-title"
            style={{ fontSize: 20, justifyContent: "center" }}
          >
            สั่งคอนกรีตผสมเสร็จ
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            นครคอนกรีต Ready-Mix · ส่งตรงจากโรงงานพระราม 2
          </div>
        </div>

        {/* Stepper */}
        <div
          className="stepper"
          style={{ maxWidth: 440, margin: "22px auto 26px" }}
        >
          {steps.map((st, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <div
                  className={`step-dot${i < step ? " done" : i === step ? " cur" : ""}`}
                >
                  {i < step ? <Check size={15} /> : i + 1}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: i === step ? "var(--primary)" : "var(--ink-3)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {st}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`step-line${i < step ? " done" : ""}`}
                  style={{ marginBottom: 18 }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 24 }}>
          {/* ─ Step 1: Product + Qty ─ */}
          {step === 0 && (
            <div className="fade-in">
              <div
                className="field-label"
                style={{ fontSize: 13.5, marginBottom: 11 }}
              >
                เลือกชั้นคุณภาพคอนกรีต (กำลังอัด ksc)
              </div>
              <select
                className="field"
                value={effectivePid || ""}
                onChange={(e) => {
                  setPid(e.target.value);
                  if (qty < 0.5) setQty(0.5);
                }}
              >
                {PRODUCTS.map((pp) => (
                  <option key={pp.id} value={pp.id}>
                    {pp.grade} ksc — {pp.name} — {fmtTHB(pp.price)}/คิว
                  </option>
                ))}
              </select>

              {product && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "11px 14px",
                    borderRadius: 12,
                    background: "var(--primary-50)",
                    border: "1.5px solid var(--primary-100)",
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    <b style={{ color: "var(--ink)" }}>การใช้งาน:</b>{" "}
                    {product.use}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      color: "var(--primary)",
                    }}
                  >
                    ขั้นต่ำ {product.minM3} คิว
                  </span>
                </div>
              )}

              {/* Quantity input */}
              <div
                style={{
                  marginTop: 22,
                  background: "var(--surface-3)",
                  borderRadius: 14,
                  padding: "18px 20px",
                }}
              >
                <div
                  className="field-label"
                  style={{ margin: "0 0 12px", fontSize: 13.5 }}
                >
                  ปริมาณ (ลูกบาศก์เมตร / คิว)
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    className="btn btn-ghost"
                    style={{
                      width: 38,
                      height: 38,
                      padding: 0,
                      borderRadius: 10,
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                    onClick={() => {
                      const n = snapQty(effectiveQty - 0.5);
                      setQty(n);
                      setQtyStr(String(n));
                    }}
                    disabled={effectiveQty <= 0.5}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    className="field mono"
                    style={{
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: 18,
                      flex: 1,
                    }}
                    min={0.5}
                    max={100}
                    step={0.5}
                    value={qtyStr}
                    onChange={(e) => setQtyStr(e.target.value)}
                    onBlur={() => {
                      const v = parseFloat(qtyStr);
                      const snapped = isNaN(v) ? qty : snapQty(v);
                      setQty(snapped);
                      setQtyStr(String(snapped));
                    }}
                  />
                  <button
                    className="btn btn-ghost"
                    style={{
                      width: 38,
                      height: 38,
                      padding: 0,
                      borderRadius: 10,
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                    onClick={() => {
                      const n = snapQty(effectiveQty + 0.5);
                      setQty(n);
                      setQtyStr(String(n));
                    }}
                    disabled={effectiveQty >= 100}
                  >
                    +
                  </button>
                  <span
                    style={{
                      fontSize: 13.5,
                      color: "var(--ink-3)",
                      flexShrink: 0,
                    }}
                  >
                    คิว
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-3)",
                    marginTop: 8,
                  }}
                >
                  ขั้นต่ำ 0.5 คิว · สูงสุด 100 คิว · กรอกทศนิยมได้ (เช่น 2.5)
                </div>
              </div>
            </div>
          )}

          {/* ─ Step 2: Site + Time + Location + Photos ─ */}
          {step === 1 && (
            <div className="fade-in">
              <div className="field-label">ที่อยู่จัดส่ง / หน้างาน</div>
              <div style={{ position: "relative", marginBottom: 18 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", pointerEvents: "none" }}>
                  <MapPin size={16} />
                </span>
                <input
                  className="field"
                  style={{ paddingLeft: 36 }}
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="เช่น 123/45 ถ.พระราม 9 แขวงห้วยขวาง กรุงเทพฯ"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div className="field-label">วันที่ต้องการ</div>
                  <DatePicker
                    selected={date}
                    onChange={(d) => setDate(d)}
                    minDate={new Date()}
                    dateFormat="dd/MM/yyyy"
                    className="field"
                    wrapperClassName="datepicker-wrapper"
                    calendarStartDay={1}
                    placeholderText="เลือกวันที่"
                  />
                </div>
                <div>
                  <div className="field-label">เวลาถึงหน้างาน (โดยประมาณ)</div>
                  <select
                    className="field"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{t} น.</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>
                    ฝ่ายจัดส่งจะจัดคิวรถและการผลิตตามเวลานี้
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="field-label">หมายเหตุการจัดส่ง (ถ้ามี)</div>
                <textarea
                  className="field"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น ซอยแคบใช้โม่เล็ก / มีปั๊มหน้างาน / ติดต่อ รปภ."
                />
              </div>

              <div style={{ marginTop: 18 }}>
                <div className="field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  ตำแหน่งหน้างาน (Google Maps)
                </div>
                <GeoAttach geo={geo} setGeo={setGeo} />
              </div>

              <div style={{ marginTop: 18 }}>
                <div
                  className="field-label"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  รูปถ่ายหน้างาน (อ้างอิง)
                  <span
                    style={{
                      marginLeft: "auto",
                      fontWeight: 500,
                      color: "var(--ink-3)",
                      fontSize: 11.5,
                    }}
                  >
                    {filledPhotos.length}/4 รูป
                  </span>
                </div>
                <PhotoDrop photos={photos} setPhotos={setPhotos} count={4} />
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-3)",
                    marginTop: 8,
                    display: "flex",
                    gap: 6,
                    alignItems: "flex-start",
                  }}
                >
                  <Info size={14} style={{ flex: "0 0 auto", marginTop: 1 }} />
                  ช่วยให้ทีมงานเตรียมรถและอุปกรณ์ให้เหมาะกับหน้างาน เช่น ทางเข้า
                  / พื้นที่เท
                </div>
              </div>
            </div>
          )}

          {/* ─ Step 3: Contact + Confirm ─ */}
          {step === 2 && (
            <div className="fade-in">
              {placed ? (
                /* ── Success state with full summary ── */
                <div className="fade-in">
                  {/* Header */}
                  <div style={{ textAlign: "center", padding: "24px 0 20px" }}>
                    <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--st-delivered-bg)", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "var(--st-delivered)" }}>
                      <CheckCircle size={30} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>ส่งคำสั่งซื้อแล้ว</div>
                    {placedOrder?.orderNumber && (
                      <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-3)", background: "var(--surface-3)", display: "inline-block", padding: "3px 12px", borderRadius: 8 }}>
                        #{placedOrder.orderNumber}
                      </div>
                    )}
                  </div>

                  {/* Section 1 — คอนกรีต */}
                  <div style={{ marginBottom: 16 }}>
                    <div className="field-label" style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>คอนกรีต</div>
                    <div style={{ background: "var(--surface-3)", borderRadius: 13, padding: "4px 16px" }}>
                      <SumRow k="สินค้า"   v={product.name} />
                      <SumRow k="กำลังอัด" v={`${product.grade} ksc`} />
                      <SumRow k="ปริมาณ"  v={`${effectiveQty.toFixed(1)} คิว`} />
                      <SumRow k="ราคา"    v={fmtTHB(subtotal)} />
                    </div>
                  </div>

                  {/* Section 2 — การจัดส่ง */}
                  <div style={{ marginBottom: 16 }}>
                    <div className="field-label" style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>การจัดส่ง</div>
                    <div style={{ background: "var(--surface-3)", borderRadius: 13, padding: "4px 16px" }}>
                      <SumRow k="ที่อยู่"     v={site || "—"} />
                      <SumRow k="วันที่"      v={date ? `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}` : "—"} />
                      <SumRow k="ถึงหน้างาน" v={`${arrivalTime} น.`} />
                      {geo && (
                        <SumRow k="พิกัด" v={
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "var(--st-delivered)" }}><MapPin size={13} /></span>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{geo.lat}, {geo.lng}</span>
                          </span>
                        } />
                      )}
                      {note && <SumRow k="หมายเหตุ" v={note} />}
                    </div>
                  </div>

                  {/* Section 3 — ผู้ติดต่อ */}
                  <div style={{ marginBottom: 16 }}>
                    <div className="field-label" style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>ผู้ติดต่อ</div>
                    <div style={{ background: "var(--surface-3)", borderRadius: 13, padding: "4px 16px" }}>
                      <SumRow k="ชื่อ"   v={cname.trim()} />
                      <SumRow k="เบอร์"  v={<span style={{ fontFamily: "var(--mono)" }}>{tel}</span>} />
                    </div>
                  </div>

                  {/* Photos */}
                  {filledPhotos.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div className="field-label" style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>รูปหน้างาน ({filledPhotos.length})</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {filledPhotos.map((src, i) => (
                          <div key={i} style={{ width: 80, height: 60, borderRadius: 9, overflow: "hidden", border: "1px solid var(--border-2)" }}>
                            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LINE strip */}
                  <div style={{ display: "flex", gap: 9, alignItems: "center", background: "var(--line-50)", borderRadius: 11, padding: "11px 14px", marginBottom: 20 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.14 2 11.22c0 3.91 2.51 7.28 6.18 8.83L12 22l3.82-1.95C19.49 18.5 22 15.13 22 11.22 22 6.14 17.52 2 12 2Z" fill="#06C755"/></svg>
                    <span style={{ fontSize: 12.5, color: "var(--line-ink)", fontWeight: 600 }}>ทีมงานจะแจ้งสถานะทุกขั้นตอนผ่าน LINE โดยอัตโนมัติ</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reset}>+ สั่งออเดอร์ใหม่</button>
                    <a href="/my-orders" className="btn btn-primary" style={{ flex: 1, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                      <ExternalLink size={15} /> ดูออเดอร์ของฉัน
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  {/* Contact info */}
                  <div
                    className="field-label"
                    style={{
                      fontSize: 14,
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <span style={{ color: "var(--primary)" }}>
                      <User size={16} />
                    </span>
                    ข้อมูลผู้ติดต่อ{" "}
                    <span style={{ color: "var(--danger)" }}>*</span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink-3)",
                      marginBottom: 12,
                    }}
                  >
                    ใช้สำหรับยืนยันคำสั่งซื้อและให้คนขับติดต่อหน้างาน
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                      marginBottom: 6,
                    }}
                  >
                    <div>
                      <label className="field-label">ชื่อผู้ติดต่อ</label>
                      <div style={{ position: "relative" }}>
                        <span
                          style={{
                            position: "absolute",
                            left: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--ink-3)",
                            pointerEvents: "none",
                          }}
                        >
                          <User size={16} />
                        </span>
                        <input
                          className={`field${touched && !nameOk ? " err" : ""}`}
                          style={{ paddingLeft: 36 }}
                          value={cname}
                          onChange={(e) => setCname(e.target.value)}
                          placeholder="เช่น คุณสมศักดิ์ ใจดี"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">เบอร์มือถือ</label>
                      <div style={{ position: "relative" }}>
                        <span
                          style={{
                            position: "absolute",
                            left: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "var(--ink-3)",
                            pointerEvents: "none",
                          }}
                        >
                          <Phone size={16} />
                        </span>
                        <input
                          className={`field mono${touched && !telOk ? " err" : ""}`}
                          style={{ paddingLeft: 36 }}
                          value={tel}
                          onChange={(e) => setTel(e.target.value)}
                          inputMode="tel"
                          maxLength={12}
                          placeholder="08X-XXX-XXXX"
                        />
                      </div>
                    </div>
                  </div>
                  {touched && !contactOk && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--danger)",
                        marginBottom: 10,
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <Info size={14} />
                      {!nameOk
                        ? "กรุณากรอกชื่อผู้ติดต่อ"
                        : "กรุณากรอกเบอร์มือถือให้ถูกต้อง (เช่น 081-234-5678)"}
                    </div>
                  )}

                  <hr className="divider" style={{ margin: "20px 0 16px" }} />

                  {/* Order summary */}
                  <div
                    className="field-label"
                    style={{ fontSize: 14, marginBottom: 13 }}
                  >
                    ตรวจสอบคำสั่งซื้อ
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      background: "var(--surface-3)",
                      borderRadius: 13,
                      padding: "4px 16px",
                    }}
                  >
                    <SumRow k="คอนกรีต" v={product.name} />
                    <SumRow k="ปริมาณ" v={`${effectiveQty.toFixed(1)} คิว`} />
                    <SumRow k="หน้างาน" v={site || <span style={{ color: "var(--ink-3)" }}>ยังไม่ระบุ</span>} />
                    <SumRow k="วันที่" v={`${date ? `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}` : "—"} · ถึงหน้างาน ${arrivalTime} น.`} />
                    <SumRow
                      k="ผู้ติดต่อ"
                      v={
                        cname.trim() ? (
                          `${cname.trim()} · ${tel || "—"}`
                        ) : (
                          <span style={{ color: "var(--ink-3)" }}>
                            ยังไม่ระบุ
                          </span>
                        )
                      }
                    />
                    <SumRow
                      k="พิกัด"
                      v={
                        geo ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span style={{ color: "var(--st-delivered)" }}>
                              <MapPin size={14} />
                            </span>{" "}
                            ปักหมุดแล้ว{" "}
                            <span
                              style={{
                                fontFamily: "var(--mono)",
                                color: "var(--ink-3)",
                                fontSize: 12,
                              }}
                            >
                              ({geo.lat}, {geo.lng})
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-3)" }}>
                            ยังไม่ปักหมุด
                          </span>
                        )
                      }
                    />
                    {note && <SumRow k="หมายเหตุ" v={note} />}
                  </div>

                  {filledPhotos.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="field-label" style={{ fontSize: 12 }}>
                        รูปหน้างานที่แนบ ({filledPhotos.length})
                      </div>
                      <div
                        style={{ display: "flex", gap: 9, flexWrap: "wrap" }}
                      >
                        {filledPhotos.map((src, i) => (
                          <div
                            key={i}
                            style={{
                              width: 80,
                              height: 60,
                              borderRadius: 9,
                              overflow: "hidden",
                              border: "1px solid var(--border-2)",
                            }}
                          >
                            <img
                              src={src}
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

                  {/* Price breakdown */}
                  <div
                    style={{
                      marginTop: 16,
                      padding: "16px 18px",
                      borderRadius: 13,
                      border: "1.5px solid var(--border-2)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        color: "var(--ink-2)",
                        marginBottom: 7,
                      }}
                    >
                      <span>
                        {product.grade} ksc × {effectiveQty.toFixed(1)} คิว
                      </span>
                      <span style={{ fontFamily: "var(--mono)" }}>
                        {fmtTHB(subtotal)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        color: "var(--ink-2)",
                        marginBottom: 10,
                      }}
                    >
                      <span>ค่าจัดส่ง (รถโม่)</span>
                      <span
                        style={{
                          color: "var(--st-delivered)",
                          fontWeight: 600,
                        }}
                      >
                        ฟรี
                      </span>
                    </div>
                    <hr className="divider" style={{ margin: "4px 0 11px" }} />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        ยอดรวม
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontWeight: 700,
                          fontSize: 22,
                          color: "var(--primary)",
                        }}
                      >
                        {fmtTHB(subtotal)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--ink-3)",
                        textAlign: "right",
                        marginTop: 2,
                      }}
                    >
                      ราคายังไม่รวม VAT 7%
                    </div>
                  </div>

                  {/* LINE strip */}
                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      gap: 9,
                      alignItems: "center",
                      background: "var(--line-50)",
                      borderRadius: 11,
                      padding: "11px 14px",
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path
                        d="M12 2C6.48 2 2 6.14 2 11.22c0 3.91 2.51 7.28 6.18 8.83L12 22l3.82-1.95C19.49 18.5 22 15.13 22 11.22 22 6.14 17.52 2 12 2Z"
                        fill="#06C755"
                      />
                      <path
                        d="M17.5 11.5c0-.28-.22-.5-.5-.5h-1.5V9.5c0-.28-.22-.5-.5-.5s-.5.22-.5.5V11h-1v-1.5c0-.28-.22-.5-.5-.5s-.5.22-.5.5V11h-1V9.5c0-.28-.22-.5-.5-.5s-.5.22-.5.5v2c0 .28.22.5.5.5h5c.28 0 .5-.22.5-.5Z"
                        fill="#fff"
                      />
                    </svg>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: "var(--line-ink)",
                        fontWeight: 600,
                      }}
                    >
                      หลังยืนยัน คุณจะได้รับการอัปเดตทุกขั้นตอนทาง LINE —
                      ตั้งแต่จัดรถ จนถึงตำแหน่งรถสด
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─ Footer ─ */}
          {!placed && (
            <>
              <hr className="divider" style={{ margin: "22px 0 18px" }} />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ lineHeight: 1.1 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      fontWeight: 600,
                    }}
                  >
                    ยอดรวมโดยประมาณ
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      fontSize: 19,
                    }}
                  >
                    {fmtTHB(subtotal)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {step > 0 && (
                    <button
                      className="btn btn-ghost"
                      onClick={goBack}
                      disabled={isSubmitting}
                    >
                      <ChevronLeft size={16} /> ย้อนกลับ
                    </button>
                  )}
                  {step < 2 ? (
                    <button className="btn btn-primary btn-lg" onClick={goNext}>
                      ถัดไป <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={placeOrder}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={16} className="spin" /> กำลังส่ง…
                        </>
                      ) : (
                        <>
                          <Check size={17} /> ยืนยันสั่งซื้อ
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </ConcreteShell>
  );
}
