import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Home, Map as MapIcon, Siren, Bell, Compass, QrCode, X, Check,
  ChevronRight, ChevronLeft, Settings, Camera, MapPin, Bath,
  UtensilsCrossed, HeartPulse, DoorOpen, Globe, Send, AlertTriangle,
  Navigation, Radio, ShieldCheck, Info, Image as ImageIcon
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────
   DESIGN TOKENS
   ──────────────────────────────────────────────────────────────── */
const T = {
  ink: "#0A0F1C",
  surface: "#121A2B",
  surfaceRaised: "#1A2438",
  surfaceHi: "#212D46",
  line: "#243154",
  lineHi: "#334268",
  textPrimary: "#EAF0FA",
  textMuted: "#8B98B8",
  textFaint: "#5A6685",
  beacon: "#2FD6D6",
  beaconDim: "#1B7A7A",
};
const RISK_COLORS = ["#2BD576", "#B7D53B", "#F5A623", "#FF6B35", "#FF3B3B"];
const RISK_LABELS = ["Normal", "Elevated", "Congested", "High Risk", "Critical"];
const riskColor = (lvl) => RISK_COLORS[Math.min(Math.max(lvl, 1), 5) - 1];
const riskLabel = (lvl) => RISK_LABELS[Math.min(Math.max(lvl, 1), 5) - 1];
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

const KEYFRAMES = `
@keyframes pulseGlow { 0%,100% { opacity:.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.045); } }
@keyframes scanLine { 0% { top:6%; } 50% { top:88%; } 100% { top:6%; } }
@keyframes slideUp { from { transform:translateY(14px); opacity:0; } to { transform:translateY(0); opacity:1; } }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes ring { 0% { box-shadow:0 0 0 0 rgba(255,59,59,.55);} 100% { box-shadow:0 0 0 18px rgba(255,59,59,0);} }
@keyframes tickerIn { from { transform:translateX(6px); opacity:0;} to { transform:translateX(0); opacity:1;} }
`;

/* ────────────────────────────────────────────────────────────────
   MOCK DATA (simulates payloads from the FastAPI backend / §4 contract)
   ──────────────────────────────────────────────────────────────── */
const VENUE = { name: "CrowdShield Zone", code: "SHIELD2026" };

const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "hi", label: "हिं", name: "हिंदी" },
  { code: "bn", label: "বাং", name: "বাংলা" },
  { code: "or", label: "ଓଡ଼", name: "ଓଡ଼ିଆ" },
];

const INITIAL_ZONES = [
  { id: "stage_left", name: "Stage Left", risk: 2, density: 0.4, x: 15, y: 15 },
  { id: "front_stage", name: "Front of Stage", risk: 3, density: 0.7, x: 50, y: 15 },
  { id: "stage_right", name: "Stage Right", risk: 2, density: 0.38, x: 85, y: 15 },
  { id: "central_field", name: "Central Field", risk: 1, density: 0.3, x: 15, y: 50 },
  { id: "food_restrooms", name: "Food & Restrooms", risk: 2, density: 0.45, x: 50, y: 50 },
  { id: "first_aid", name: "First Aid Hub", risk: 1, density: 0.15, x: 85, y: 50 },
  { id: "main_entrance", name: "Main Entrance", risk: 1, density: 0.25, x: 15, y: 85 },
  { id: "central_walkway", name: "Central Walkway", risk: 2, density: 0.34, x: 50, y: 85 },
  { id: "emergency_exit", name: "Emergency Exit", risk: 1, density: 0.18, x: 85, y: 85 },
];

const POIS = [
  { id: "wc1", type: "washroom", name: "Washroom — Food & Restrooms", zone: "food_restrooms", dist: 80 },
  { id: "wc2", type: "washroom", name: "Washroom — Central Walkway", zone: "central_walkway", dist: 150 },
  { id: "food1", type: "food", name: "Food & Restrooms", zone: "food_restrooms", dist: 100 },
  { id: "help1", type: "help", name: "Help Desk — Main Entrance", zone: "main_entrance", dist: 90 },
  { id: "med1", type: "medical", name: "First Aid Hub", zone: "first_aid", dist: 180 },
  { id: "exit1", type: "exit", name: "Emergency Exit", zone: "emergency_exit", dist: 220 },
];

const POI_META = {
  washroom: { icon: Bath, label: "Washroom" },
  food: { icon: UtensilsCrossed, label: "Food" },
  help: { icon: Info, label: "Help Desk" },
  medical: { icon: HeartPulse, label: "Medical" },
  exit: { icon: DoorOpen, label: "Exit" },
};

const INCIDENT_CATEGORIES = ["Overcrowding", "Medical Emergency", "Lost Person", "Suspicious Activity", "Facility Issue", "Other"];

const ALERT_TEMPLATES = {
  2: {
    en: "Moderate crowding near {zone}. Move calmly — more space ahead.",
    hi: "{zone} के पास मध्यम भीड़ है। शांति से आगे बढ़ें, आगे अधिक जगह है।",
    bn: "{zone}-এর কাছে মাঝারি ভিড়। শান্তভাবে এগিয়ে যান, সামনে বেশি জায়গা আছে।",
    or: "{zone} ନିକଟରେ ମଧ୍ୟମ ଭିଡ଼। ଶାନ୍ତ ଭାବରେ ଆଗକୁ ବଢ଼ନ୍ତୁ, ଆଗରେ ଅଧିକ ସ୍ଥାନ ଅଛି।",
  },
  3: {
    en: "{zone} is getting congested. Please avoid gathering here and keep moving.",
    hi: "{zone} में भीड़भाड़ बढ़ रही है। कृपया यहाँ न रुकें और आगे बढ़ते रहें।",
    bn: "{zone}-এ ভিড় বাড়ছে। এখানে জড়ো হওয়া এড়িয়ে চলুন, চলতে থাকুন।",
    or: "{zone} ରେ ଭିଡ଼ ବଢ଼ୁଛି। ଏଠାରେ ଏକାଠି ହେବାକୁ ଏଡ଼ାନ୍ତୁ, ଗତିଶୀଳ ରୁହନ୍ତୁ।",
  },
  4: {
    en: "High risk at {zone}. Please head toward {alt} immediately and follow staff instructions.",
    hi: "{zone} में उच्च जोखिम है। कृपया तुरंत {alt} की ओर जाएं और स्टाफ के निर्देशों का पालन करें।",
    bn: "{zone}-এ উচ্চ ঝুঁকি। অনুগ্রহ করে অবিলম্বে {alt}-এর দিকে যান, কর্মীদের নির্দেশ মানুন।",
    or: "{zone} ରେ ଉଚ୍ଚ ବିପଦ। ଦୟାକରି ତୁରନ୍ତ {alt} ଆଡ଼କୁ ଯାଆନ୍ତୁ, କର୍ମଚାରୀଙ୍କ ନିର୍ଦ୍ଦେଶ ପାଳନ କରନ୍ତୁ।",
  },
  5: {
    en: "CRITICAL: Crowd-crush risk at {zone}. Move calmly to {alt}. Do not push — staff will assist.",
    hi: "गंभीर: {zone} में भीड़ दुर्घटना का खतरा है। शांति से {alt} की ओर जाएं। धक्का न दें, स्टाफ मदद करेगा।",
    bn: "সংকটজনক: {zone}-এ ভিড়ের দুর্ঘটনার ঝুঁকি। শান্তভাবে {alt}-এর দিকে যান। ধাক্কাধাক্কি করবেন না।",
    or: "ଗୁରୁତର: {zone} ରେ ଭିଡ଼ ଦୁର୍ଘଟଣାର ବିପଦ। ଶାନ୍ତ ଭାବରେ {alt} ଆଡ଼କୁ ଯାଆନ୍ତୁ। ଠେଲାଠେଲି କରନ୍ତୁ ନାହିଁ।",
  },
};

function fillTemplate(str, zoneName, altName) {
  return str.replaceAll("{zone}", zoneName).replaceAll("{alt}", altName || "a nearby gate");
}
function generateAlert(zone, allZones) {
  const lvl = zone.risk;
  if (lvl < 2) return null;
  const tpl = ALERT_TEMPLATES[lvl] || ALERT_TEMPLATES[2];
  const alt = allZones.filter((z) => z.id !== zone.id && z.risk <= 2).sort((a, b) => a.risk - b.risk)[0];
  const messages = {};
  LANGS.forEach((l) => { messages[l.code] = fillTemplate(tpl[l.code], zone.name, alt ? alt.name : "a safer zone"); });
  return { id: `${zone.id}-${Date.now()}`, zoneId: zone.id, zoneName: zone.name, risk: lvl, ts: Date.now(), messages };
}

/* ────────────────────────────────────────────────────────────────
   BACKEND CONNECTION
   ──────────────────────────────────────────────────────────────── */
// CONFIRM: point this at wherever your FastAPI backend is actually running.
// This is a placeholder guess (uvicorn's default local host/port).
const API_BASE = "http://127.0.0.1:8000";

// Maps the backend's numeric zone_id ("1".."9") onto this app's existing
// named zones. Inferred from tracker.py's row-major 3x3 grid
// (zone_id = row * GRID_COLS + col + 1), matched against this app's
// existing 3x3 layout (x: 15/50/85, y: 15/50/85). CONFIRM this against your
// actual venue grid before the demo -- if the backend's numbering doesn't
// match this row-major order, risk colors will render on the wrong
// physical zone even though the data itself is correct.
const BACKEND_TO_APP_ZONE = {
  "1": "stage_left",
  "2": "front_stage",
  "3": "stage_right",
  "4": "central_field",
  "5": "food_restrooms",
  "6": "first_aid",
  "7": "main_entrance",
  "8": "central_walkway",
  "9": "emergency_exit",
};

// CONFIRM: samples of your /state output seen so far show risk_level on a
// 0-4 scale (0=Normal ... 4=Critical), while this app's riskColor/riskLabel
// expect 1-5. Converting with +1 below -- verify this against your actual
// engine.py/rules.py risk scale before the demo. Getting this wrong won't
// throw an error, it'll just silently miscolor every zone.
function backendRiskToAppRisk(level) {
  return clamp((level ?? 0) + 1, 1, 5);
}

/* ────────────────────────────────────────────────────────────────
   SMALL PRIMITIVES
   ──────────────────────────────────────────────────────────────── */
function GlobalStyle() {
  return <style>{FONT_IMPORT + KEYFRAMES}</style>;
}

function Chip({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors"
      style={{
        fontFamily: "Inter, sans-serif",
        background: active ? (color || T.beacon) : T.surfaceRaised,
        color: active ? T.ink : T.textMuted,
        border: `1px solid ${active ? (color || T.beacon) : T.line}`,
      }}
    >
      {children}
    </button>
  );
}

function RiskDot({ level, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: 999, background: riskColor(level), display: "inline-block", flexShrink: 0 }} />;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className="fixed left-1/2 z-50 px-4 py-3 rounded-xl flex items-center gap-2 shadow-lg"
      style={{
        bottom: 92, transform: "translateX(-50%)", background: T.surfaceHi, border: `1px solid ${T.lineHi}`,
        animation: "slideUp .25s ease", maxWidth: 320,
      }}
    >
      <Check size={16} color={T.beacon} />
      <span style={{ color: T.textPrimary, fontFamily: "Inter, sans-serif", fontSize: 13 }}>{toast}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   LOGIN SCREEN — QR scan (simulated) with manual venue-code fallback
   ──────────────────────────────────────────────────────────────── */
function LoginScreen({ onLogin }) {
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const simulateScan = () => {
    setScanning(true);
    setError("");
    setTimeout(() => { setScanning(false); onLogin(); }, 1600);
  };
  const submitCode = (e) => {
    e.preventDefault();
    if (code.trim().toUpperCase() === VENUE.code) onLogin();
    else setError("Invalid code. Check the board near any entry gate, or ask venue staff.");
  };

  return (
    <div 
      className="relative h-full w-full flex flex-col items-center justify-between px-6 py-10 overflow-hidden" 
      style={{ color: T.textPrimary }}
    >
      {/* --- HEATMAP BACKGROUND GRADIENT LAYER --- */}
      <div 
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
          backgroundColor: "#05070D",
          backgroundImage: `
            radial-gradient(circle at 10% 10%, rgba(47, 214, 214, 0.35) 0%, transparent 50%),
            radial-gradient(circle at 90% 90%, rgba(226, 59, 78, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(232, 185, 59, 0.25) 0%, transparent 40%)
          `,
        }}
      />

      {/* --- HEADER BLOCK --- */}
      <div className="relative z-10 w-full flex flex-col items-center" style={{ marginTop: 8 }}>
        <div 
          className="p-4 rounded-2xl mb-3 relative flex items-center justify-center" 
          style={{ 
            backgroundColor: "#171B26", 
            border: "1px solid rgba(47, 214, 214, 0.5)",
            boxShadow: "0 0 25px rgba(47, 214, 214, 0.25)"
          }}
        >
          <ShieldCheck size={36} style={{ color: T.beacon }} />
        </div>
        <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 26, color: T.textPrimary, letterSpacing: 0.5 }}>
          CrowdShield
        </div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: T.beacon, marginTop: 4, letterSpacing: 1.5, fontWeight: 600, textTransform: "uppercase" }}>
          Attendee Portal
        </div>
      </div>

      {/* --- MAIN QR / INPUT CONTAINER --- */}
      <div className="relative z-10 w-full flex flex-col items-center" style={{ marginTop: 8 }}>
        <div
          className="relative overflow-hidden"
          style={{ 
            width: 220, 
            height: 220, 
            borderRadius: 24, 
            backgroundColor: "rgba(16, 19, 27, 0.65)", 
            border: "1px solid rgba(47, 214, 214, 0.4)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.6), 0 0 30px rgba(47, 214, 214, 0.15)"
          }}
        >
          {[["0", "0", "20px 0 0 0"], ["0", "1", "0 20px 0 0"], ["1", "0", "0 0 0 20px"], ["1", "1", "0 0 20px 0"]].map(([r, c, radius], i) => (
            <span key={i} style={{
              position: "absolute", width: 28, height: 28,
              top: r === "0" ? 14 : "auto", bottom: r === "1" ? 14 : "auto",
              left: c === "0" ? 14 : "auto", right: c === "1" ? 14 : "auto",
              borderTop: r === "0" ? `3px solid ${T.beacon}` : "none",
              borderBottom: r === "1" ? `3px solid ${T.beacon}` : "none",
              borderLeft: c === "0" ? `3px solid ${T.beacon}` : "none",
              borderRight: c === "1" ? `3px solid ${T.beacon}` : "none",
              borderRadius: radius,
            }} />
          ))}
          <QrCode size={92} color={T.textFaint} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
          {scanning && (
            <div style={{ position: "absolute", left: 10, right: 10, height: 2, background: T.beacon, boxShadow: `0 0 12px ${T.beacon}`, animation: "scanLine 1.6s linear infinite" }} />
          )}
        </div>
        
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: T.textMuted, marginTop: 14, textAlign: "center" }}>
          Point camera at the QR code on your pass or gate signage.
        </div>

        <button
          onClick={simulateScan}
          disabled={scanning}
          className="w-full mt-5 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          style={{ 
            backgroundColor: T.beacon, 
            color: T.ink, 
            fontFamily: "Inter, sans-serif", 
            fontSize: 14, 
            opacity: scanning ? 0.7 : 1,
            boxShadow: "0 0 25px rgba(47, 214, 214, 0.35)" 
          }}
        >
          <QrCode size={18} /> {scanning ? "Scanning…" : "Scan Pass QR Code"}
        </button>

        <button onClick={() => setManual((m) => !m)} className="mt-3.5 text-xs font-medium" style={{ color: T.textMuted, fontFamily: "Inter, sans-serif" }}>
          Trouble scanning? Enter venue code
        </button>

        {manual && (
          <form onSubmit={submitCode} className="w-full mt-3" style={{ animation: "slideUp .2s ease" }}>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(""); }}
              placeholder="e.g. SANGAM25"
              className="w-full px-4 py-2.5 rounded-xl outline-none"
              style={{
                backgroundColor: "rgba(8, 10, 15, 0.7)", 
                border: `1px solid ${error ? RISK_COLORS[4] : T.line}`, 
                color: T.textPrimary,
                fontFamily: "IBM Plex Mono, monospace", 
                fontSize: 13, 
                letterSpacing: 1,
              }}
            />
            {error && <div style={{ color: RISK_COLORS[4], fontSize: 11, fontFamily: "Inter, sans-serif", marginTop: 4 }}>{error}</div>}
            <button type="submit" className="w-full mt-2.5 py-2.5 rounded-xl font-semibold" style={{ background: T.surfaceRaised, border: `1px solid ${T.lineHi}`, color: T.textPrimary, fontFamily: "Inter, sans-serif", fontSize: 13 }}>
              Continue with code
            </button>
          </form>
        )}
      </div>

      <div className="relative z-10" style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, color: T.textFaint, textAlign: "center" }}>
        No personal data leaves your device except aggregated location zone.
      </div>
    </div>
  );
}

function ZoneDetailSheet({ zone, onClose, allZones }) {
  if (!zone) return null;
  const alt = allZones.filter((z) => z.id !== zone.id && z.risk <= 2).sort((a, b) => a.risk - b.risk)[0];
  return (
    <div className="fixed inset-0 z-40 flex items-end" style={{ background: "rgba(5,8,16,.6)", animation: "fadeIn .15s ease" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 pb-8" style={{ background: T.surfaceRaised, border: `1px solid ${T.lineHi}`, borderBottom: "none", animation: "slideUp .22s ease" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4" style={{ width: 36, height: 4, borderRadius: 4, background: T.line }} />
        <div className="flex items-center justify-between mb-1">
          <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: T.textPrimary }}>{zone.name}</div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: riskColor(zone.risk), color: T.ink }}>{riskLabel(zone.risk)}</span>
        </div>
        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: T.textFaint, marginBottom: 16 }}>zone_id: {zone.id}</div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl p-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: T.textMuted }}>Density</div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, color: T.textPrimary, fontWeight: 700 }}>{Math.round(zone.density * 100)}%</div>
          </div>
          <div className="rounded-xl p-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: T.textMuted }}>Risk level</div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, color: riskColor(zone.risk), fontWeight: 700 }}>{zone.risk}/5</div>
          </div>
        </div>

        {zone.risk >= 3 && (
          <div className="rounded-xl p-3 flex gap-2 items-start" style={{ background: T.surface, border: `1px solid ${riskColor(zone.risk)}55` }}>
            <Navigation size={16} color={riskColor(zone.risk)} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: T.textPrimary, lineHeight: 1.5 }}>
              Recommended: move toward <b>{alt ? alt.name : "a lower-risk zone"}</b> and avoid stopping in this area.
            </div>
          </div>
        )}
        <button onClick={onClose} className="w-full mt-5 py-3 rounded-xl font-semibold" style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.textPrimary, fontFamily: "Inter, sans-serif", fontSize: 14 }}>
          Close
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   TOP BAR + BOTTOM NAV
   ──────────────────────────────────────────────────────────────── */
function TopBar({ alertCount, onBell, onSettings, clock }) {
  return (
    <div style={{ background: T.ink }}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: T.textFaint }}>{clock}</div>
        <div className="flex items-center gap-2">
          <button onClick={onSettings} className="relative flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: T.surfaceRaised, border: `1px solid ${T.line}` }}>
            <Settings size={15} color={T.textMuted} />
          </button>
          <button onClick={onBell} className="relative flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: T.surfaceRaised, border: `1px solid ${T.line}` }}>
            <Bell size={15} color={T.textMuted} />
            {alertCount > 0 && (
              <span className="absolute flex items-center justify-center" style={{ top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 999, background: RISK_COLORS[4], fontFamily: "Inter, sans-serif", fontSize: 9.5, fontWeight: 700, color: "#fff", padding: "0 3px" }}>
                {alertCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ screen, setScreen, alertCount }) {
  const items = [
    { id: "home", icon: Home, label: "Home" },
    { id: "map", icon: MapIcon, label: "Map" },
    { id: "report", icon: Siren, label: "Report", raised: true },
    { id: "alerts", icon: Bell, label: "Alerts", badge: alertCount },
    { id: "nearby", icon: Compass, label: "Nearby" },
  ];
  return (
    <div className="flex items-end justify-between px-4 pb-4 pt-2" style={{ background: T.ink, borderTop: `1px solid ${T.line}` }}>
      {items.map((it) => {
        const active = screen === it.id;
        if (it.raised) {
          return (
            <button key={it.id} onClick={() => setScreen(it.id)} className="flex flex-col items-center gap-1" style={{ marginTop: -22 }}>
              <span className="flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: RISK_COLORS[4], boxShadow: `0 4px 14px ${RISK_COLORS[4]}66`, animation: "ring 2.4s ease-out infinite" }}>
                <it.icon size={22} color="#fff" />
              </span>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: T.textMuted }}>{it.label}</span>
            </button>
          );
        }
        return (
          <button key={it.id} onClick={() => setScreen(it.id)} className="flex flex-col items-center gap-1 relative" style={{ width: 48 }}>
            <it.icon size={20} color={active ? T.beacon : T.textFaint} />
            {it.badge > 0 && <span className="absolute" style={{ top: -3, right: 6, width: 7, height: 7, borderRadius: 999, background: RISK_COLORS[4] }} />}
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: active ? T.beacon : T.textFaint }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   HOME SCREEN
   ──────────────────────────────────────────────────────────────── */
function HomeScreen({ zones, onZoneClick, alerts, setScreen, userZone, userZoneId }) {
  const latest = alerts[0];
  return (
    <div className="px-4 pt-4 pb-6 overflow-y-auto" style={{ flex: 1 }}>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, fontWeight: 700, color: T.textPrimary }}>Namaste 🙏</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: T.textMuted, marginTop: 2 }}>
        You're checked in near <b style={{ color: T.textPrimary }}>{userZone?.name}</b>
      </div>

      <div className="flex items-center justify-between mt-4 mb-2">
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: T.textPrimary }}>Venue map</div>
        <button onClick={() => setScreen("map")} className="flex items-center gap-0.5">
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: T.beacon }}>Full map</span>
          <ChevronRight size={13} color={T.beacon} />
        </button>
      </div>
      <MapScreen zones={zones} onZoneClick={onZoneClick} userZoneId={userZoneId} embedded />

      {latest && (
        <button onClick={() => setScreen("alerts")} className="w-full mt-4 rounded-2xl p-3 flex items-start gap-3 text-left" style={{ background: T.surfaceRaised, border: `1px solid ${riskColor(latest.risk)}55` }}>
          <AlertTriangle size={18} color={riskColor(latest.risk)} style={{ flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1">
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{latest.zoneName} · {riskLabel(latest.risk)}</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: T.textMuted, marginTop: 2, lineHeight: 1.4 }}>{latest.messages.en}</div>
          </div>
          <ChevronRight size={16} color={T.textFaint} style={{ marginTop: 2, flexShrink: 0 }} />
        </button>
      )}

      <div className="flex items-center justify-between mt-6 mb-2">
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: T.textPrimary }}>Quick actions</div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <QuickTile icon={Siren} label="Report incident" color={RISK_COLORS[4]} onClick={() => setScreen("report")} />
        <QuickTile icon={Compass} label="Find nearby" color={T.beacon} onClick={() => setScreen("nearby")} />
        <QuickTile icon={MapIcon} label="Venue map" color={RISK_COLORS[2]} onClick={() => setScreen("map")} />
        <QuickTile icon={Bell} label="All alerts" color={RISK_COLORS[1]} onClick={() => setScreen("alerts")} />
      </div>
    </div>
  );
}

function QuickTile({ icon: Icon, label, color, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2.5 p-3 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <span className="flex items-center justify-center rounded-xl" style={{ width: 34, height: 34, background: `${color}22` }}>
        <Icon size={16} color={color} />
      </span>
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: T.textPrimary, textAlign: "left" }}>{label}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────
   MAP SCREEN — stylised venue layout. Neutral for normal users:
   no risk colouring / heat-glow / risk legend, just "you are here"
   plus the named locations (gates, food court, medical camp, etc).
   Risk data itself keeps flowing to alerts/emergency logic elsewhere.
   ──────────────────────────────────────────────────────────────── */
function MapScreen({ zones, onZoneClick, userZoneId, embedded }) {
  const paths = [
    ["stage_left", "front_stage"], ["front_stage", "stage_right"],
    ["stage_left", "central_field"], ["front_stage", "food_restrooms"], ["stage_right", "first_aid"],
    ["central_field", "food_restrooms"], ["food_restrooms", "first_aid"],
    ["central_field", "main_entrance"], ["food_restrooms", "central_walkway"], ["first_aid", "emergency_exit"],
    ["main_entrance", "central_walkway"], ["central_walkway", "emergency_exit"],
  ];
  const zoneMap = Object.fromEntries(zones.map((z) => [z.id, z]));
  return (
    <div className={embedded ? "" : "px-4 pt-4 pb-6 overflow-y-auto"} style={embedded ? {} : { flex: 1 }}>
      {!embedded && (
        <>
          <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: T.textPrimary }}>Venue Map</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: T.textMuted, marginTop: 2, marginBottom: 12 }}>Tap a location for details.</div>
        </>
      )}

      <div className="relative rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}`, height: embedded ? 210 : 340 }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
          {paths.map(([a, b], i) => {
            const za = zoneMap[a], zb = zoneMap[b];
            if (!za || !zb) return null;
            return <line key={i} x1={za.x} y1={za.y} x2={zb.x} y2={zb.y} stroke={T.line} strokeWidth="0.6" strokeDasharray="2,1.5" />;
          })}
        </svg>
        {zones.map((z) => {
          const isUser = z.id === userZoneId;
          return (
            <button
              key={z.id}
              onClick={() => onZoneClick(z)}
              className="absolute flex flex-col items-center"
              style={{ left: `${z.x}%`, top: `${z.y}%`, transform: "translate(-50%,-50%)" }}
            >
              {isUser && (
                <span style={{
                  position: "absolute", width: 30, height: 30, borderRadius: 999, background: T.beacon, opacity: 0.25,
                  animation: "pulseGlow 2s ease-in-out infinite",
                }} />
              )}
              <span className="flex items-center justify-center rounded-full relative" style={{
                width: isUser ? 16 : 11, height: isUser ? 16 : 11,
                background: isUser ? T.beacon : T.surfaceHi,
                border: isUser ? `2px solid ${T.textPrimary}` : `2px solid ${T.lineHi}`,
              }} />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 8.5, color: T.textMuted, marginTop: 3, whiteSpace: "nowrap", background: `${T.ink}cc`, padding: "1px 4px", borderRadius: 4 }}>{z.name}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 justify-center">
        <span style={{ width: 14, height: 14, borderRadius: 999, border: `2px solid ${T.textPrimary}`, background: T.beacon }} />
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, color: T.textFaint }}>= you are here (simulated)</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   ALERTS SCREEN — multilingual congestion alerts + location warning
   ──────────────────────────────────────────────────────────────── */
function AlertsScreen({ alerts, lang, setLang, userZone }) {
  const warning = userZone && userZone.risk >= 3;
  return (
    <div className="px-4 pt-4 pb-6 overflow-y-auto" style={{ flex: 1 }}>
      <div className="flex items-center justify-between">
        <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: T.textPrimary }}>Alerts</div>
        <div className="flex items-center gap-1.5">
          <Globe size={13} color={T.textFaint} />
          <div className="flex gap-1">
            {LANGS.map((l) => <Chip key={l.code} active={lang === l.code} onClick={() => setLang(l.code)}>{l.label}</Chip>)}
          </div>
        </div>
      </div>

      {warning && (
        <div className="w-full mt-4 rounded-2xl p-3.5 flex gap-3 items-start" style={{ background: `${riskColor(userZone.risk)}18`, border: `1px solid ${riskColor(userZone.risk)}66` }}>
          <MapPin size={18} color={riskColor(userZone.risk)} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: T.textPrimary }}>Location-based warning</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: T.textMuted, marginTop: 3, lineHeight: 1.45 }}>
              You're near <b style={{ color: T.textPrimary }}>{userZone.name}</b>, currently {riskLabel(userZone.risk).toLowerCase()}. Consider moving toward a quieter zone.
            </div>
          </div>
        </div>
      )}

      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: T.textFaint, marginTop: 18, marginBottom: 8 }}>
        Live feed · from venue command server
      </div>

      {alerts.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <ShieldCheck size={22} color={T.textFaint} style={{ margin: "0 auto 8px" }} />
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: T.textMuted }}>No active alerts. All zones normal.</div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {alerts.map((a) => (
          <div key={a.id} className="rounded-2xl p-3.5" style={{ background: T.surface, borderLeft: `3px solid ${riskColor(a.risk)}`, border: `1px solid ${T.line}`, borderLeftWidth: 3, borderLeftColor: riskColor(a.risk), animation: "tickerIn .2s ease" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <RiskDot level={a.risk} size={7} />
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: T.textPrimary }}>{a.zoneName}</span>
              </div>
              <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: T.textFaint }}>{timeAgo(a.ts)}</span>
            </div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: T.textMuted, marginTop: 5, lineHeight: 1.5 }}>{a.messages[lang]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   REPORT SCREEN — incident reporting
   ──────────────────────────────────────────────────────────────── */
function ReportScreen({ userZone, incidents, onSubmit }) {
  const [category, setCategory] = useState(null);
  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState(null);
  const fileRef = useRef(null);

  const canSubmit = category && desc.trim().length > 3;
  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setPhoto({ name: f.name, url: URL.createObjectURL(f) });
  };
  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ id: Date.now(), category, desc, photo, zone: userZone?.name, ts: Date.now() });
    setCategory(null); setDesc(""); setPhoto(null);
  };

  return (
    <div className="px-4 pt-4 pb-6 overflow-y-auto" style={{ flex: 1 }}>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: T.textPrimary }}>Report an Incident</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: T.textMuted, marginTop: 2, marginBottom: 16 }}>Your report goes straight to the command centre.</div>

      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 8 }}>What's happening?</div>
      <div className="flex flex-wrap gap-2 mb-5">
        {INCIDENT_CATEGORIES.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(c)} color={RISK_COLORS[4]}>{c}</Chip>)}
      </div>

      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 8 }}>Describe briefly</div>
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="e.g. Barricade fallen near the ghat steps, people are bunching up…"
        className="w-full rounded-xl p-3 outline-none resize-none"
        style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.textPrimary, fontFamily: "Inter, sans-serif", fontSize: 13, height: 90 }}
      />

      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: T.textPrimary, margin: "16px 0 8px" }}>Add a photo (optional)</div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      {photo ? (
        <div className="relative rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}`, height: 130 }}>
          <img src={photo.url} alt="attached" className="w-full h-full object-cover" />
          <button onClick={() => setPhoto(null)} className="absolute rounded-full flex items-center justify-center" style={{ top: 6, right: 6, width: 24, height: 24, background: "rgba(10,15,28,.75)" }}>
            <X size={13} color="#fff" />
          </button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl flex flex-col items-center justify-center gap-1.5" style={{ height: 90, background: T.surface, border: `1px dashed ${T.line}` }}>
          <Camera size={20} color={T.textFaint} />
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: T.textFaint }}>Tap to attach photo</span>
        </button>
      )}

      <div className="flex items-center gap-2 mt-5 rounded-xl p-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <MapPin size={15} color={T.beacon} />
        <div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: T.textMuted }}>Location detected automatically</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: T.textPrimary }}>{userZone?.name}</div>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full mt-5 py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
        style={{ background: canSubmit ? RISK_COLORS[4] : T.surfaceRaised, color: canSubmit ? "#fff" : T.textFaint, fontFamily: "Inter, sans-serif", fontSize: 14 }}
      >
        <Send size={15} /> Submit report
      </button>

      {incidents.length > 0 && (
        <>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: T.textPrimary, margin: "22px 0 8px" }}>Your reports</div>
          <div className="flex flex-col gap-2">
            {incidents.map((inc) => (
              <div key={inc.id} className="rounded-xl p-3 flex items-center justify-between" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                <div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{inc.category}</div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: T.textFaint, marginTop: 1 }}>{inc.zone} · {timeAgo(inc.ts)}</div>
                </div>
                <span className="px-2 py-1 rounded-full" style={{ background: `${T.beacon}22`, color: T.beacon, fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 700 }}>Submitted</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   NEARBY SCREEN
   ──────────────────────────────────────────────────────────────── */
function NearbyScreen({ zones }) {
  const [filter, setFilter] = useState("all");
  const zoneMap = Object.fromEntries(zones.map((z) => [z.id, z]));
  const filtered = POIS.filter((p) => filter === "all" || p.type === filter).sort((a, b) => a.dist - b.dist);

  return (
    <div className="px-4 pt-4 pb-6 overflow-y-auto" style={{ flex: 1 }}>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: T.textPrimary }}>Find Nearby</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: T.textMuted, marginTop: 2, marginBottom: 12 }}>Washrooms, food, help &amp; medical points around you.</div>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        {Object.entries(POI_META).map(([type, m]) => (
          <Chip key={type} active={filter === type} onClick={() => setFilter(type)}>{m.label}</Chip>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 mt-4">
        {filtered.map((p) => {
          const meta = POI_META[p.type];
          const z = zoneMap[p.zone];
          return (
            <div key={p.id} className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
              <span className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: T.surfaceRaised }}>
                <meta.icon size={18} color={T.beacon} />
              </span>
              <div className="flex-1">
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{p.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: T.textFaint }}>{p.dist} m</span>
                  {z && <><RiskDot level={z.risk} size={6} /><span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, color: T.textFaint }}>{riskLabel(z.risk)} en route</span></>}
                </div>
              </div>
              <ChevronRight size={16} color={T.textFaint} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   EMERGENCY OVERLAY (critical / level 5)
   ──────────────────────────────────────────────────────────────── */
function EmergencyOverlay({ zone, allZones, onAck }) {
  const [langIdx, setLangIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setLangIdx((i) => (i + 1) % LANGS.length), 3800);
    return () => clearInterval(iv);
  }, []);
  if (!zone) return null;
  const alert = generateAlert(zone, allZones);
  const lang = LANGS[langIdx];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6" style={{ background: "rgba(20,4,4,.92)", animation: "fadeIn .2s ease" }}>
      <span className="flex items-center justify-center rounded-full mb-5" style={{ width: 76, height: 76, background: "rgba(255,59,59,.15)", animation: "ring 1.6s ease-out infinite" }}>
        <Siren size={34} color={RISK_COLORS[4]} />
      </span>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 20, color: "#fff", letterSpacing: 0.5 }}>CRITICAL ALERT</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#FFB4B4", marginTop: 4 }}>{zone.name} · Risk 5/5</div>
      <div className="rounded-2xl p-4 mt-5 w-full" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.15)", minHeight: 84 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: "#FFB4B4", marginBottom: 6, fontWeight: 700 }}>{lang.name.toUpperCase()}</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "#fff", lineHeight: 1.55 }}>{alert?.messages[lang.code]}</div>
      </div>
      <button onClick={onAck} className="w-full mt-6 py-3.5 rounded-xl font-semibold" style={{ background: "#fff", color: "#1a0505", fontFamily: "Inter, sans-serif", fontSize: 14 }}>
        I'm safe — Acknowledge
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   DEMO CONTROLS (mock-data test harness)
   ──────────────────────────────────────────────────────────────── */
function DemoSheet({ zones, setZones, userZoneId, setUserZoneId, onClose, triggerCritical, resetAll }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end" style={{ background: "rgba(5,8,16,.6)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 pb-8" style={{ background: T.surfaceRaised, border: `1px solid ${T.lineHi}`, animation: "slideUp .22s ease" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4" style={{ width: 36, height: 4, borderRadius: 4, background: T.line }} />
        <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Demo controls</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: T.textFaint, marginTop: 2, marginBottom: 14 }}>Mock-data harness for testing — stands in for the FastAPI backend.</div>

        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 6 }}>My simulated location</div>
        <div className="flex flex-wrap gap-2 mb-5">
          {zones.map((z) => <Chip key={z.id} active={userZoneId === z.id} onClick={() => setUserZoneId(z.id)} color={T.beacon}>{z.name}</Chip>)}
        </div>

        <div className="flex gap-2">
          <button onClick={() => { setZones((zs) => zs.map((z) => z.id === "front_stage" ? { ...z, risk: 4, density: 0.85 } : z)); }} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: T.surface, border: `1px solid ${RISK_COLORS[3]}66`, color: RISK_COLORS[3] }}>
            Spike congestion
          </button>
          <button onClick={triggerCritical} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: T.surface, border: `1px solid ${RISK_COLORS[4]}66`, color: RISK_COLORS[4] }}>
            Trigger critical
          </button>
          <button onClick={resetAll} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.textMuted }}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   APP
   ──────────────────────────────────────────────────────────────── */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [screen, setScreen] = useState("home");
  const [zones, setZones] = useState(INITIAL_ZONES);
  const [alerts, setAlerts] = useState([]);
  const [lang, setLang] = useState("en");
  const [selectedZone, setSelectedZone] = useState(null);
  const [userZoneId, setUserZoneId] = useState("main_entrance");
  const [incidents, setIncidents] = useState([]);
  const [toast, setToast] = useState(null);
  const [showDemo, setShowDemo] = useState(false);
  const [emergencyZoneId, setEmergencyZoneId] = useState(null);
  const [clock, setClock] = useState("");

  const userZone = zones.find((z) => z.id === userZoneId);

  // Stable per-session device ID, used so the backend can track safety-check
  // acknowledgment per device rather than globally. NOT persisted to disk
  // (kept out of localStorage, which isn't supported in this preview
  // environment) -- fine for one continuous demo session, but a real mobile
  // build (React Native) should persist this with AsyncStorage/SecureStore
  // instead so acknowledgment survives an app restart.
  const deviceIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Math.random().toString(36).slice(2)}`
  );

  const zonesRef = useRef(zones);
  useEffect(() => { zonesRef.current = zones; }, [zones]);

  useEffect(() => {
    const iv = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), 1000);
    return () => clearInterval(iv);
  }, []);

  const pushToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); }, []);

  // live feed from the real FastAPI /state endpoint
  useEffect(() => {
    if (!loggedIn) return;

    async function poll() {
      try {
        // 1. Fetch Zones State
        const stateRes = await fetch(`${API_BASE}/state`);
        if (stateRes.ok) {
          const data = await stateRes.json();
          const backendZones = data?.risk_summary?.zones || [];
          if (backendZones.length) {
            const currentZones = zonesRef.current;
            const nextZones = currentZones.map((z) => {
              const backendZone = backendZones.find(
                (bz) => BACKEND_TO_APP_ZONE[String(bz.zone_id)] === z.id
              );
              if (!backendZone) return z;

              const risk = backendRiskToAppRisk(backendZone.risk_level);
              const density = clamp(backendZone.density ?? z.density, 0, 1);
              
              // We removed the local generateAlert() logic here!
              return { ...z, risk, density };
            });
            setZones(nextZones);
          }
        }

        // 2. Fetch Live Alerts from Backend
        const alertsRes = await fetch(`${API_BASE}/alerts`);
        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          // Map Python backend alerts to the React UI format
          const mappedAlerts = (alertsData.alerts || []).map(a => ({
            id: a.id,
            zoneName: "Venue Command", // Backend alerts are currently system-wide
            risk: backendRiskToAppRisk(a.risk_level), // Convert 0-4 to UI's 1-5 scale
            ts: a.created_at * 1000, // Python sends seconds, JS needs milliseconds
            messages: {
              en: a.message,
              hi: a.message, // Fallback: using English for all tabs until backend translates
              bn: a.message,
              or: a.message
            }
          }));
          setAlerts(mappedAlerts);
        }
      } catch (err) {
        console.warn("Failed to poll backend:", err);
      }
    }

    poll(); // fetch immediately on login, don't wait for the first interval tick
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, [loggedIn]);

  // real, backend-driven "confirm you're safe" safety check. This is
  // separate from the informational alerts above -- it's the mandatory,
  // per-device-acknowledged prompt from alerts.py, sustained-risk-triggered
  // on the backend, not a purely local threshold.
  const [safetyCheck, setSafetyCheck] = useState(null); // { alertId, message, riskLevel } | null

  useEffect(() => {
    if (!loggedIn) return;

    async function pollSafetyCheck() {
      try {
        const res = await fetch(`${API_BASE}/safety-check?device_id=${deviceIdRef.current}`);
        if (!res.ok) throw new Error(`Backend returned ${res.status}`);
        const data = await res.json();
        if (data.pending) {
          setSafetyCheck({ alertId: data.alert_id, message: data.message, riskLevel: data.risk_level });
        } else {
          setSafetyCheck(null);
        }
      } catch (err) {
        console.warn("Failed to poll /safety-check:", err);
      }
    }

    pollSafetyCheck();
    const iv = setInterval(pollSafetyCheck, 3000);
    return () => clearInterval(iv);
  }, [loggedIn]);

  const acknowledgeSafetyCheck = useCallback(async () => {
    if (!safetyCheck) return;
    try {
      await fetch(`${API_BASE}/safety-check/${safetyCheck.alertId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceIdRef.current }),
      });
    } catch (err) {
      console.warn("Failed to acknowledge safety check:", err);
    }
    setSafetyCheck(null); // hide immediately client-side, don't wait for the next poll
  }, [safetyCheck]);

  const highestRiskZone = useMemo(() => {
    if (!zones.length) return null;
    return zones.reduce((max, z) => (z.risk > max.risk ? z : max), zones[0]);
  }, [zones]);

  const activeEmergencyZone = useMemo(() => {
    // local demo-harness trigger (unchanged, still useful for offline testing)
    if (emergencyZoneId) {
      const z = zones.find((z) => z.id === emergencyZoneId);
      if (z) return z;
    }
    // real backend-driven safety check takes over once it's pending
    if (safetyCheck && highestRiskZone) {
      return { ...highestRiskZone, risk: 5 };
    }
    return null;
  }, [emergencyZoneId, zones, safetyCheck, highestRiskZone]);

  const handleEmergencyAck = useCallback(async () => {
    if (safetyCheck) {
      await acknowledgeSafetyCheck(); // real ack -> POST /safety-check/{id}/acknowledge
    }
    setEmergencyZoneId(null); // also clear the local demo override, if that's what triggered it
  }, [safetyCheck, acknowledgeSafetyCheck]);

  const triggerCritical = () => {
    setZones((zs) => zs.map((z) => (z.id === "front_stage" ? { ...z, risk: 5, density: 0.95 } : z)));
    setEmergencyZoneId("front_stage");
    setShowDemo(false);
  };
  const resetAll = () => { setZones(INITIAL_ZONES); setAlerts([]); setEmergencyZoneId(null); setShowDemo(false); };

  const handleLogin = () => { setLoggedIn(true); pushToast(`Checked in to ${VENUE.name}`); };
  const handleReportSubmit = (inc) => { setIncidents((l) => [inc, ...l]); pushToast("Report submitted to command centre"); };

  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "#05070D", fontFamily: "Inter, sans-serif" }}>
      <GlobalStyle />
      <div className="relative flex flex-col" style={{ width: 390, height: 780, maxHeight: "94vh", background: T.ink, borderRadius: 36, overflow: "hidden", border: `8px solid #000`, boxShadow: "0 30px 60px rgba(0,0,0,.5)" }}>
        {!loggedIn ? (
          <LoginScreen onLogin={handleLogin} />
        ) : (
          <>
            <TopBar alertCount={alerts.length} onBell={() => setScreen("alerts")} onSettings={() => setShowDemo(true)} clock={clock} />
            {screen === "home" && <HomeScreen zones={zones} onZoneClick={setSelectedZone} alerts={alerts} setScreen={setScreen} userZone={userZone} userZoneId={userZoneId} />}
            {screen === "map" && <MapScreen zones={zones} onZoneClick={setSelectedZone} userZoneId={userZoneId} />}
            {screen === "alerts" && <AlertsScreen alerts={alerts} lang={lang} setLang={setLang} userZone={userZone} />}
            {screen === "report" && <ReportScreen userZone={userZone} incidents={incidents} onSubmit={handleReportSubmit} />}
            {screen === "nearby" && <NearbyScreen zones={zones} />}
            <BottomNav screen={screen} setScreen={setScreen} alertCount={alerts.length} />
          </>
        )}

        <ZoneDetailSheet zone={selectedZone} onClose={() => setSelectedZone(null)} allZones={zones} />
        {showDemo && <DemoSheet zones={zones} setZones={setZones} userZoneId={userZoneId} setUserZoneId={setUserZoneId} onClose={() => setShowDemo(false)} triggerCritical={triggerCritical} resetAll={resetAll} />}
        {activeEmergencyZone && <EmergencyOverlay zone={activeEmergencyZone} allZones={zones} onAck={handleEmergencyAck} />}
        <Toast toast={toast} />
      </div>
    </div>
  );
}