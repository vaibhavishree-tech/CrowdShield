import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Menu, X, AlertTriangle, Send, ChevronRight, CheckCircle2, Circle,
  WifiOff, Radio, Users2, Gauge, Wind, MapPin, ShieldCheck, Megaphone,
  DoorOpen, DoorClosed, ClipboardList, ArrowRight, Lock, User
} from "lucide-react";
import AuthorityLogin from "./Login";
/* ============================================================================
   BACKEND CONFIG
============================================================================ */
const USE_MOCK_DATA = false; 
const STATE_ENDPOINT = "http://127.0.0.1:8000/state";   
const NOTIFY_ENDPOINT = "http://127.0.0.1:8000/notify"; 

/* ============================================================================
   TOKENS
============================================================================ */
const RISK = {
  0: { label: "Normal",    short: "NORMAL",   color: "#2FBF71" },
  1: { label: "Elevated",  short: "ELEVATED", color: "#A6C93B" },
  2: { label: "Congested", short: "CONGESTED",color: "#E8B93B" },
  3: { label: "High risk", short: "HIGH RISK",color: "#E86B2C" },
  4: { label: "Critical",  short: "CRITICAL", color: "#E23B4E" },
};
const riskColor = (lvl) => RISK[lvl]?.color || "#5B6376";
const riskLabel = (lvl) => RISK[lvl]?.label || "Unknown";
const BG_VOID = "#080A0F";
const BG_PANEL = "#10131B";
const BG_RAISED = "#171B26";
const LINE = "#232838";
const TEXT = "#E7EAF2";
const MUTED = "#8993A8";
const DIM = "#5B6376";

/* ============================================================================
   VENUE SCHEMATIC LAYOUT (9-Zone Complete Mapping)
============================================================================ */
const LAYOUT = {
  // ROW 1: Stage Area (Y: 70)
  "1": { x: 70,  y: 70,  w: 260, h: 140, label: "Zone 1 (Stage Left)" },
  "2": { x: 370, y: 70,  w: 260, h: 140, label: "Zone 2 (Front of Stage)" },
  "3": { x: 670, y: 70,  w: 260, h: 140, label: "Zone 3 (Stage Right)" },
  
  // ROW 2: Central/Utilities (Y: 250)
  "4": { x: 70,  y: 250, w: 260, h: 140, label: "Zone 4 (Central Field)" },
  "5": { x: 370, y: 250, w: 260, h: 140, label: "Zone 5 (Food & Restrooms)" },
  "6": { x: 670, y: 250, w: 260, h: 140, label: "Zone 6 (First Aid Hub)" },
  
  // ROW 3: Entry/Exit/Transit (Y: 430)
  "7": { x: 70,  y: 430, w: 260, h: 140, label: "Zone 7 (Main Entrance)" },
  "8": { x: 370, y: 430, w: 260, h: 140, label: "Zone 8 (Central Walkway)" },
  "9": { x: 670, y: 430, w: 260, h: 140, label: "Zone 9 (Emergency Exit)" },
};
const DESIGN_W = 1000;
const DESIGN_H = 640;

/* ============================================================================
   MOCK /state SIMULATOR
============================================================================ */
const ZONE_SEED = [
  { id: "1", type: "approach", base: 0.16, vol: 0.02 },
  { id: "2", type: "approach", base: 0.25, vol: 0.05 },
  { id: "3", type: "approach", base: 0.15, vol: 0.02 },
  { id: "4", type: "hall",     base: 0.20, vol: 0.04 },
  { id: "5", type: "corridor", base: 0.32, vol: 0.04 },
  { id: "6", type: "corridor", base: 0.10, vol: 0.01 },
  { id: "7", type: "gate",     base: 0.22, vol: 0.03 },
  { id: "8", type: "hall",     base: 0.38, vol: 0.05 },
  { id: "9", type: "gate",     base: 0.12, vol: 0.02 },
];

function densityToRisk(d) {
  if (d < 0.35) return 0;
  if (d < 0.55) return 1;
  if (d < 0.72) return 2;
  if (d < 0.86) return 3;
  return 4;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function initSim() {
  const map = {};
  ZONE_SEED.forEach((z) => {
    map[z.id] = { density: z.base, ...z };
  });
  return map;
}

function tickSim(sim, overrides) {
  const now = new Date();
  const zones = ZONE_SEED.map((seed) => {
    const s = sim[seed.id];
    const prevDensity = s.density;
    const bump = overrides[seed.id] || 0;
    let density = prevDensity + (Math.random() - 0.47) * s.vol + bump;
    density = clamp(density, 0.04, 0.98);
    s.density = density;

    const deltaPer10s = (density - prevDensity) * 4; 
    const trendStr = `${deltaPer10s >= 0 ? "+" : ""}${deltaPer10s.toFixed(2)}/10s`;

    const avg_speed = Number(clamp(1.35 - density * 1.15 + (Math.random() - 0.5) * 0.08, 0.03, 1.4).toFixed(2));
    const flow_entropy = Number(clamp(0.18 + density * 0.55 + (Math.random() - 0.5) * 0.1, 0.05, 0.97).toFixed(2));
    const risk_level = densityToRisk(density);
    const bottleneck = density > 0.74 && avg_speed < 0.42;

    const baseDir = seed.type === "approach" ? [0.9, 0.1] : seed.type === "hall" ? [0.2, 0.9] : [0.6, 0.4];
    const jitter = () => Number((Math.random() - 0.5) * 0.15).toFixed(2);
    const flow_direction = [
      Number((baseDir[0] + Number(jitter())).toFixed(2)),
      Number((baseDir[1] + Number(jitter())).toFixed(2)),
    ];

    return {
      zone_id: seed.id,
      density: Number(density.toFixed(2)),
      density_trend: trendStr,
      avg_speed,
      flow_direction,
      flow_entropy,
      bottleneck,
      risk_level,
    };
  });

  const overall_risk_level = zones.reduce((m, z) => Math.max(m, z.risk_level), 0);
  return {
    risk_summary: { timestamp: now.toISOString(), zones, overall_risk_level },
    recommendations: buildRecommendations(zones, overall_risk_level),
  };
}

function labelFor(id) {
  return LAYOUT[id]?.label || id;
}

function buildRecommendations(zones, overallRisk) {
  const byRisk = [...zones].sort((a, b) => b.risk_level - a.risk_level || b.density - a.density);
  const worst = byRisk[0];

  const gatesAtRisk = zones
    .filter((z) => z.zone_id.startsWith("gate_") && z.zone_id.endsWith("_approach") && z.risk_level >= 3)
    .map((z) => z.zone_id.split("_")[1]);
  const gates_to_close = [...new Set(gatesAtRisk)].map((g) => `gate_${g}`);

  const calmGates = zones
    .filter((z) => z.zone_id.startsWith("gate_") && z.zone_id.endsWith("_approach") && z.risk_level <= 1)
    .map((z) => `gate_${z.zone_id.split("_")[1]}`)
    .filter((g) => !gates_to_close.includes(g));
  const gates_to_open = [...new Set(calmGates)].slice(0, 2);

  const staff_redistribution = zones
    .filter((z) => z.risk_level >= 2)
    .sort((a, b) => b.risk_level - a.risk_level)
    .slice(0, 4)
    .map((z) => ({ zone: z.zone_id, additional_staff: z.risk_level }));

  let evacuation_route = [];
  if (overallRisk >= 2 && gates_to_open.length) {
    const openLetter = gates_to_open[0].split("_")[1];
    evacuation_route = [worst.zone_id, `corridor_${openLetter === "A" ? 1 : openLetter === "B" ? 3 : openLetter === "D" ? 4 : 2}`, gates_to_open[0]];
  }

  const openLabel = gates_to_open.map((g) => g.replace("gate_", "Gate ")).join(" or ") || "your nearest open gate";
  const closeLabel = gates_to_close.map((g) => g.replace("gate_", "Gate ")).join(", ");
  const message =
    overallRisk >= 4
      ? `Critical crowd density near ${labelFor(worst.zone_id)}. Proceed calmly toward ${openLabel}.${closeLabel ? ` ${closeLabel} is closed.` : ""}`
      : overallRisk === 3
      ? `Please proceed calmly toward ${openLabel}.${closeLabel ? ` ${closeLabel} is temporarily closed.` : ""}`
      : overallRisk === 2
      ? `Crowd building near ${labelFor(worst.zone_id)}. Please spread out and follow staff directions.`
      : `All zones currently within normal operating range.`;

  return {
    evacuation_route,
    gates_to_close,
    gates_to_open,
    staff_redistribution,
    announcement: {
      risk_level: overallRisk,
      languages: ["en", "hi", "or"],
      message,
    },
  };
}

/* ============================================================================
   SMALL UI PRIMITIVES
============================================================================ */
function RiskBeacon({ level, size = 56 }) {
  const color = riskColor(level);
  const pulsing = level >= 4;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {pulsing && (
        <span
          className="absolute inline-flex rounded-full animate-ping"
          style={{ width: size, height: size, backgroundColor: color, opacity: 0.35 }}
        />
      )}
      <span
        className="relative inline-flex items-center justify-center rounded-full font-mono font-bold"
        style={{
          width: size,
          height: size,
          backgroundColor: `${color}22`,
          border: `2px solid ${color}`,
          color,
          fontSize: size * 0.4,
        }}
      >
        {level}
      </span>
    </div>
  );
}

function MetricRow({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-2" style={{ color: MUTED }}>
        <Icon size={15} strokeWidth={1.75} />
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm" style={{ color: TEXT }}>{value}</div>
        {sub && <div className="font-mono text-[11px]" style={{ color: DIM }}>{sub}</div>}
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, variant = "primary", disabled, className = "" }) {
  const styles =
    variant === "primary"
      ? { backgroundColor: TEXT, color: BG_VOID }
      : variant === "danger"
      ? { backgroundColor: "transparent", color: RISK[4].color, border: `1px solid ${RISK[4].color}55` }
      : { backgroundColor: "transparent", color: TEXT, border: `1px solid ${LINE}` };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { ...styles, opacity: 0.4, cursor: "not-allowed" } : styles}
      className={`px-4 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-85 disabled:hover:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/* ============================================================================
   VENUE HEATMAP
============================================================================ */
function ZoneSVGNode({ zone, layout, onSelect, setHoveredZone }) {
  const color = riskColor(zone.risk_level);
  const pulsing = zone.risk_level >= 4;
  const isBottleneck = zone.bottleneck;

  return (
    <g
      onClick={() => onSelect(zone.original_id || zone.zone_id)}
      onMouseEnter={(e) => setHoveredZone({ zone, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
      onMouseLeave={() => setHoveredZone(null)}
      onMouseMove={(e) => setHoveredZone({ zone, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
      className="cursor-pointer transition-transform origin-center hover:opacity-80"
      style={{ transformOrigin: `${layout.x + layout.w / 2}px ${layout.y + layout.h / 2}px` }}
    >
      {/* Animated pulsing ring for high risk or bottlenecks */}
      {(pulsing || isBottleneck) && (
        <rect
          x={layout.x - 4} y={layout.y - 4}
          width={layout.w + 8} height={layout.h + 8}
          rx="10"
          fill="none"
          stroke={color}
          strokeWidth="2"
          className="animate-ping"
          opacity="0.4"
        />
      )}

      {/* Main Zone Shape with Radial Gradient Heatmap */}
      <rect
        x={layout.x} y={layout.y}
        width={layout.w} height={layout.h}
        rx="6"
        fill={`url(#grad-${zone.risk_level})`}
        stroke={color}
        strokeWidth={isBottleneck ? "3" : "1.5"}
      />

      {/* Flow Direction Vector Indicator (Visible if moving) */}
      {zone.avg_speed > 0.1 && zone.flow_direction && (
        <g opacity="0.7">
          <line
            x1={layout.x + layout.w / 2}
            y1={layout.y + layout.h / 2 + 18}
            x2={(layout.x + layout.w / 2) + ((zone.flow_direction?.[0] || 0) * 22)}
            y2={(layout.y + layout.h / 2 + 18) + ((zone.flow_direction?.[1] || 0) * 22)}
            stroke={TEXT}
            strokeWidth="1.5"
            strokeDasharray="3"
            className="animate-pulse"
            markerEnd="url(#arrow)"
          />
        </g>
      )}

      {/* HTML Overlay for Crisp Text & Lucide Icons */}
      <foreignObject x={layout.x} y={layout.y} width={layout.w} height={layout.h}>
        <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none p-1 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wide leading-tight text-white drop-shadow-md">
            {layout.label}
          </span>
          <div className="flex items-center gap-1 mt-0.5 bg-black/50 px-1.5 py-0.5 rounded-full border border-white/10 shadow-sm">
            {isBottleneck && <AlertTriangle size={10} style={{ color }} className="animate-pulse" />}
            <span className="font-mono text-[10px] font-bold" style={{ color }}>
              {riskLabel(zone.risk_level)}
            </span>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function VenueHeatmap({ zones, onSelect }) {
  const [hoveredZone, setHoveredZone] = useState(null);

  const known = zones.filter((z) => LAYOUT[String(z.zone_id)]);
  const unknown = zones.filter((z) => !LAYOUT[String(z.zone_id)]);

  return (
    <div>
      <div
        className="relative w-full rounded-lg overflow-hidden shadow-lg"
        style={{ backgroundColor: BG_PANEL, border: `1px solid ${LINE}`, aspectRatio: `${DESIGN_W}/${DESIGN_H}` }}
      >
        <svg viewBox={`0 0 ${DESIGN_W} ${DESIGN_H}`} className="w-full h-full absolute inset-0">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={TEXT} opacity="0.9" />
            </marker>

            {[0, 1, 2, 3, 4].map((level) => {
              const color = riskColor(level);
              return (
                <radialGradient id={`grad-${level}`} key={level} cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor={color} stopOpacity={level >= 4 ? "0.4" : "0.15"} />
                  <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </radialGradient>
              );
            })}
          </defs>

          {known.map((z) => (
            <ZoneSVGNode
              key={z.zone_id}
              zone={z}
              layout={LAYOUT[String(z.zone_id)]}
              onSelect={onSelect}
              setHoveredZone={setHoveredZone}
            />
          ))}
        </svg>

        {hoveredZone && (
          <div
            className="absolute z-50 p-3 rounded-lg shadow-2xl pointer-events-none backdrop-blur-md"
            style={{
              backgroundColor: `${BG_RAISED}E6`, 
              border: `1px solid ${riskColor(hoveredZone.zone.risk_level)}66`,
              left: Math.min(hoveredZone.x + 15, DESIGN_W - 190),
              top: Math.min(hoveredZone.y + 15, DESIGN_H - 120),
              minWidth: "170px"
            }}
          >
            <div className="flex items-center gap-2 mb-2 border-b pb-1.5" style={{ borderColor: LINE }}>
              <MapPin size={13} style={{ color: MUTED }} />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {LAYOUT[String(hoveredZone.zone.zone_id)]?.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-mono">
              <span style={{ color: DIM }}>Density:</span>
              <span style={{ color: TEXT }}>
                {hoveredZone.zone.density?.toFixed(2) || "0.00"}{" "}
                <span className="text-[9px]" style={{color: MUTED}}>({hoveredZone.zone.density_trend || "N/A"})</span>
              </span>

              <span style={{ color: DIM }}>Speed:</span>
              <span style={{ color: TEXT }}>{hoveredZone.zone.avg_speed || 0} m/s</span>

              <span style={{ color: DIM }}>Entropy:</span>
              <span style={{ color: TEXT }}>{hoveredZone.zone.flow_entropy || 0}</span>

              {hoveredZone.zone.bottleneck && (
                <span className="col-span-2 mt-1 py-1 px-2 rounded flex items-center justify-center gap-1.5 font-sans font-semibold text-[10px]" style={{ backgroundColor: `${RISK[4].color}22`, color: RISK[4].color }}>
                  <AlertTriangle size={11} /> Active Bottleneck
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {unknown.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {unknown.map((z) => (
            <button
              key={z.zone_id}
              onClick={() => onSelect(z.zone_id)}
              className="px-3 py-2 rounded-md text-xs font-mono transition-transform hover:scale-105"
              style={{ backgroundColor: `${riskColor(z.risk_level)}22`, border: `1px solid ${riskColor(z.risk_level)}`, color: TEXT }}
            >
              Zone {z.zone_id} · {riskLabel(z.risk_level)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   ZONE DETAIL 
============================================================================ */
function ZoneDetail({ zone, history }) {
  if (!zone) return null;
  const color = riskColor(zone.risk_level);
  const data = (history || []).map((h) => ({ t: h.t, density: h.density }));
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest" style={{ color: DIM }}>Zone</div>
          <div className="text-lg font-semibold" style={{ color: TEXT }}>{labelFor(zone.zone_id)}</div>
        </div>
        <div className="px-3 py-1.5 rounded-full font-mono text-xs font-bold" style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}` }}>
          {riskLabel(zone.risk_level).toUpperCase()}
        </div>
      </div>

      {zone.bottleneck && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-md text-xs" style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}44` }}>
          <AlertTriangle size={14} />
          Bottleneck forming — inflow is outpacing movement through this zone.
        </div>
      )}

      {data.length > 1 && (
        <div className="mb-4 rounded-md p-2" style={{ backgroundColor: BG_RAISED, border: `1px solid ${LINE}` }}>
          <div className="text-[10px] uppercase tracking-wider mb-1 px-1" style={{ color: DIM }}>Density, last few minutes</div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="densityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis domain={[0, 1]} hide />
              <Tooltip
                contentStyle={{ backgroundColor: BG_PANEL, border: `1px solid ${LINE}`, fontSize: 11 }}
                labelFormatter={() => ""}
                formatter={(v) => [v, "density"]}
              />
              <Area type="monotone" dataKey="density" stroke={color} fill="url(#densityFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <MetricRow icon={Users2} label="Density" value={zone.density.toFixed(2)} sub={zone.density_trend} />
        <MetricRow icon={Gauge} label="Avg. speed" value={`${zone.avg_speed} m/s`} />
        <MetricRow icon={Wind} label="Flow direction" value={`[${zone.flow_direction?.[0] || 0}, ${zone.flow_direction?.[1] || 0}]`} />
        <MetricRow icon={Radio} label="Flow entropy" value={zone.flow_entropy} />
        <MetricRow icon={AlertTriangle} label="Bottleneck" value={zone.bottleneck ? "Yes" : "No"} />
      </div>
    </div>
  );
}

/* ============================================================================
   SIDE DRAWER 
============================================================================ */
function ZoneDrawer({ zone, history, onClose }) {
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-sm h-full overflow-y-auto p-5"
        style={{ backgroundColor: BG_PANEL, borderLeft: `1px solid ${LINE}` }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-white/5" style={{ color: MUTED }}>
          <X size={18} />
        </button>
        <ZoneDetail zone={zone} history={history} />
      </div>
    </div>
  );
}

/* ============================================================================
   SIDE MENU 
============================================================================ */
function SideMenu({ open, onClose, onOpenZoneForm, onOpenNotify }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-72 h-full p-5" style={{ backgroundColor: BG_PANEL, borderRight: `1px solid ${LINE}` }}>
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: MUTED }}>Menu</span>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/5" style={{ color: MUTED }}>
            <X size={18} />
          </button>
        </div>
        <button
          onClick={onOpenZoneForm}
          className="w-full flex items-center justify-between px-3 py-3 rounded-md mb-2 text-left hover:bg-white/5"
          style={{ border: `1px solid ${LINE}`, color: TEXT }}
        >
          <span className="flex items-center gap-2 text-sm"><MapPin size={16} style={{ color: MUTED }} /> See zone details</span>
          <ChevronRight size={16} style={{ color: DIM }} />
        </button>
        <button
          onClick={onOpenNotify}
          className="w-full flex items-center justify-between px-3 py-3 rounded-md text-left hover:bg-white/5"
          style={{ border: `1px solid ${LINE}`, color: TEXT }}
        >
          <span className="flex items-center gap-2 text-sm"><Megaphone size={16} style={{ color: MUTED }} /> Send notification</span>
          <ChevronRight size={16} style={{ color: DIM }} />
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   MODAL SHELL
============================================================================ */
function ModalShell({ children, onClose, wide, blocking }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={blocking ? undefined : onClose} />
      <div
        className={`relative w-full ${wide ? "max-w-lg" : "max-w-md"} rounded-lg p-5 max-h-[90vh] overflow-y-auto`}
        style={{ backgroundColor: BG_PANEL, border: `1px solid ${LINE}` }}
      >
        {children}
      </div>
    </div>
  );
}

/* ============================================================================
   ZONE DETAILS FORM 
============================================================================ */
function ZoneFormModal({ zones, onClose }) {
  const [selectedId, setSelectedId] = useState(zones[0]?.zone_id || "");
  const [submitted, setSubmitted] = useState(null);
  const selectedZone = zones.find((z) => z.zone_id === selectedId);

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: MUTED }}>See zone details</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-white/5" style={{ color: MUTED }}><X size={18} /></button>
      </div>

      {!submitted ? (
        <>
          <label className="block text-xs mb-1.5" style={{ color: MUTED }}>Zone</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full mb-4 px-3 py-2.5 rounded-md text-sm font-mono"
            style={{ backgroundColor: BG_RAISED, border: `1px solid ${LINE}`, color: TEXT }}
          >
            {zones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>{labelFor(z.zone_id)}</option>
            ))}
          </select>
          <ActionButton onClick={() => setSubmitted(selectedId)} className="w-full">View zone</ActionButton>
        </>
      ) : (
        <>
          <ZoneDetail zone={selectedZone} history={[]} />
          <ActionButton variant="secondary" onClick={() => setSubmitted(null)} className="w-full mt-4">
            Choose a different zone
          </ActionButton>
        </>
      )}
    </ModalShell>
  );
}

/* ============================================================================
   SEND NOTIFICATION 
============================================================================ */
function NotifyModal({ zoneIds, onClose }) {
  const [target, setTarget] = useState("all");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(null);

  const handleSend = async () => {
    setSendError(null);
    if (!NOTIFY_ENDPOINT || NOTIFY_ENDPOINT.includes("your-backend.example.com")) {
      console.log("[mock notification send]", { target, message });
      setSent(true);
      return;
    }
    try {
      const res = await fetch(NOTIFY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, message }),
      });
      if (!res.ok) throw new Error(`POST /notify failed: ${res.status} ${res.statusText}`);
      setSent(true);
    } catch (e) {
      setSendError(e.message);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: MUTED }}>Send notification</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-white/5" style={{ color: MUTED }}><X size={18} /></button>
      </div>

      {sent ? (
        <div className="flex flex-col items-center text-center py-6">
          <CheckCircle2 size={32} style={{ color: RISK[1].color }} className="mb-3" />
          <div className="text-sm font-medium mb-1" style={{ color: TEXT }}>Alert sent</div>
          <div className="text-xs" style={{ color: MUTED }}>
            Delivered to {target === "all" ? "all users" : labelFor(target)}.
          </div>
          <ActionButton onClick={onClose} className="mt-5 w-full">Done</ActionButton>
        </div>
      ) : (
        <>
          <label className="block text-xs mb-1.5" style={{ color: MUTED }}>Send to</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full mb-4 px-3 py-2.5 rounded-md text-sm font-mono"
            style={{ backgroundColor: BG_RAISED, border: `1px solid ${LINE}`, color: TEXT }}
          >
            <option value="all">All users</option>
            {zoneIds.map((id) => (
              <option key={id} value={id}>{labelFor(id)}</option>
            ))}
          </select>

          <label className="block text-xs mb-1.5" style={{ color: MUTED }}>Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="e.g. Please proceed calmly toward Gate C."
            className="w-full mb-4 px-3 py-2.5 rounded-md text-sm resize-none"
            style={{ backgroundColor: BG_RAISED, border: `1px solid ${LINE}`, color: TEXT }}
          />

          {sendError && (
            <div className="mb-3 text-xs px-3 py-2 rounded-md" style={{ backgroundColor: `${RISK[4].color}18`, color: RISK[4].color, border: `1px solid ${RISK[4].color}44` }}>
              {sendError}
            </div>
          )}
          <ActionButton onClick={handleSend} disabled={!message.trim()} className="w-full">
            <span className="flex items-center justify-center gap-2"><Send size={14} /> Send alert</span>
          </ActionButton>
        </>
      )}
    </ModalShell>
  );
}

/* ============================================================================
   CRITICAL RISK MODAL 
============================================================================ */
function CriticalRiskModal({ overallLevel, recommendations, checklist, onToggle, onAuthorize, onClose }) {
  const { items, route, announcements, eventType } = useMemo(() => {
    const list = [];
    let routeInfo = null;
    let groupedAnnouncements = [];
    let event = null;

    if (!recommendations) return { items: list, route: routeInfo, announcements: groupedAnnouncements, eventType: event };

    // --- 1. EVENT STATUS (Extracted from checklist) ---
    if (recommendations.event_type) {
      event = recommendations.event_type.replace(/_/g, ' ');
    }

    // --- 2. EVACUATION ROUTE (Extracted to distinct badge) ---
    if (recommendations.evacuation_route && recommendations.evacuation_route.length > 0) {
      routeInfo = recommendations.evacuation_route.join(" → ");
    }

    // --- 3. MULTILINGUAL ANNOUNCEMENTS (Consolidated & grouped) ---
    if (recommendations.announcements && Array.isArray(recommendations.announcements)) {
      groupedAnnouncements = recommendations.announcements;
      if (groupedAnnouncements.length > 0) {
        list.push({
          id: "broadcast_all",
          icon: Megaphone,
          text: `Broadcast Multilingual Safety Alert to all affected zones`
        });
      }
    } else if (recommendations.announcement && recommendations.announcement.message) {
      // Fallback for mock data
      list.push({
        id: "announcement_mock",
        icon: Megaphone,
        text: `Broadcast Safety Alert: "${recommendations.announcement.message}"`,
      });
    }

    // --- 4. PHYSICAL TASKS (Kept in Action Checklist) ---
    // Handle real backend schema if available
    if (recommendations.recommended_actions && Array.isArray(recommendations.recommended_actions)) {
      recommendations.recommended_actions.forEach((act, idx) => {
        // Exclude broadcast messages from the physical checklist since we consolidated them
        if (act.action !== "BROADCAST_MESSAGE") {
          list.push({
            id: `act_${idx}`,
            icon: act.action.includes("GATE") ? DoorClosed : (act.action === "DEPLOY_SECURITY" ? ShieldCheck : ClipboardList),
            text: act.message || `${act.action} for ${act.target}`
          });
        }
      });
    }

    // Fallback overrides for Mock Data
    if (recommendations.gates_to_close) {
      recommendations.gates_to_close.forEach((g) =>
        list.push({ id: `close_${g}`, icon: DoorClosed, text: `Close ${g.replace("gate_", "Gate ")}` })
      );
    }
    if (recommendations.gates_to_open) {
      recommendations.gates_to_open.forEach((g) =>
        list.push({ id: `open_${g}`, icon: DoorOpen, text: `Open ${g.replace("gate_", "Gate ")}` })
      );
    }
    if (recommendations.staff_redistribution) {
      recommendations.staff_redistribution.forEach((s) =>
        list.push({
          id: `staff_${s.zone}`,
          icon: Users2,
          text: `Send ${s.additional_staff} additional staff to Zone ${s.zone}`,
        })
      );
    }

    return { items: list, route: routeInfo, announcements: groupedAnnouncements, eventType: event };
  }, [recommendations]);

  const anyChecked = Object.values(checklist).some(Boolean);
  const color = riskColor(overallLevel);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" />
      <div
        className="relative w-full max-w-lg rounded-lg p-5 max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ backgroundColor: BG_PANEL, border: `1px solid ${color}` }}
      >
        {/* Header & Status */}
        <div className="flex items-center gap-3 mb-1">
          <AlertTriangle size={22} style={{ color }} />
          <div className="text-lg font-bold" style={{ color }}>
            {riskLabel(overallLevel)} — action required
          </div>
        </div>
        {eventType && (
          <div className="text-xs font-bold uppercase tracking-widest mb-1 mt-1" style={{ color: RISK[4].color }}>
            Detected Event: {eventType}
          </div>
        )}
        <p className="text-xs mb-5" style={{ color: MUTED }}>
          Overall risk level is {overallLevel}/4. Review the recommended response below and check off
          what you're putting into action. This does nothing on its own — nothing is dispatched until you authorize it.
        </p>

        {/* Safe Status Banner for Hysteresis / Manual Dismissal */}
        {overallLevel < 2 && (
          <div className="mb-5 px-3 py-2.5 rounded-md text-xs font-bold bg-green-900/30 text-green-400 border border-green-800">
            Live metrics have returned to normal. Please authorize or dismiss this event.
          </div>
        )}

        {/* Evacuation Route Badge */}
        {route && (
          <div className="mb-5 flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold border"
               style={{ backgroundColor: `${color}14`, borderColor: `${color}55`, color: TEXT }}>
            <DoorOpen size={16} style={{ color }} />
            Evacuation Route: {route}
          </div>
        )}

        {/* Operator Action Checklist */}
        <div className="space-y-1.5 mb-5">
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: DIM }}>
            Physical Operator Tasks
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            const checked = !!checklist[item.id];
            return (
              <button
                key={item.id}
                onClick={() => onToggle(item.id)}
                className="w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-md hover:bg-white/5 transition-colors"
                style={{ border: `1px solid ${LINE}`, backgroundColor: checked ? `${color}14` : "transparent" }}
              >
                {checked ? (
                  <CheckCircle2 size={18} style={{ color }} className="mt-0.5 shrink-0" />
                ) : (
                  <Circle size={18} style={{ color: DIM }} className="mt-0.5 shrink-0" />
                )}
                <span className="flex items-center gap-2 text-sm leading-snug" style={{ color: TEXT }}>
                  <Icon size={14} style={{ color: MUTED }} className="shrink-0" />
                  {item.text}
                </span>
              </button>
            );
          })}
        </div>

        {/* PA System Announcement Preview block */}
        {announcements.length > 0 && (
          <div className="mb-5 p-3 rounded-md border" style={{ borderColor: LINE, backgroundColor: BG_RAISED }}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
              <Megaphone size={14} /> PA System Broadcast Preview
            </div>
            <div className="space-y-2.5">
              {announcements.map((ann, idx) => (
                <div key={idx} className="text-sm italic flex gap-2" style={{ color: DIM }}>
                  <span className="font-bold text-xs uppercase" style={{ color: MUTED }}>
                    [{ann.language}]
                  </span> 
                  <span>{ann.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons: Dismiss & Authorize */}
        <div className="flex gap-3">
          <ActionButton variant="secondary" onClick={onClose} className="w-1/3">
            Dismiss
          </ActionButton>
          
          <ActionButton onClick={onAuthorize} disabled={!anyChecked} className="w-2/3">
            <span className="flex items-center justify-center gap-2">
              <ShieldCheck size={16} /> Authorize response
            </span>
          </ActionButton>
        </div>
        <div className="text-[11px] text-center mt-2" style={{ color: DIM }}>
          {anyChecked ? "Ready to authorize." : "Check at least one action to continue."}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   DEMO CONTROLS 
============================================================================ */
function DemoControls({ open, onToggle, onBump, onCalm }) {
  return (
    <div className="fixed bottom-4 right-4 z-20">
      {open && (
        <div
          className="mb-2 p-3 rounded-lg w-56 text-xs"
          style={{ backgroundColor: BG_PANEL, border: `1px solid ${LINE}`, color: MUTED }}
        >
          <div className="uppercase tracking-wider mb-2 font-semibold" style={{ color: DIM }}>Demo controls</div>
          <button
            onClick={() => onBump("gate_A_approach", 0.35)}
            className="w-full text-left px-2.5 py-2 rounded mb-1.5 hover:bg-white/5"
            style={{ border: `1px solid ${LINE}`, color: TEXT }}
          >
            Escalate Gate A Approach
          </button>
          <button
            onClick={() => onBump("main_hall", 0.4)}
            className="w-full text-left px-2.5 py-2 rounded mb-1.5 hover:bg-white/5"
            style={{ border: `1px solid ${LINE}`, color: TEXT }}
          >
            Escalate Main Hall
          </button>
          <button
            onClick={onCalm}
            className="w-full text-left px-2.5 py-2 rounded hover:bg-white/5"
            style={{ border: `1px solid ${LINE}`, color: TEXT }}
          >
            Calm all zones
          </button>
        </div>
      )}
      <button
        onClick={onToggle}
        className="px-3 py-2 rounded-full text-[11px] font-mono"
        style={{ backgroundColor: BG_PANEL, border: `1px solid ${LINE}`, color: DIM }}
      >
        {open ? "Hide demo controls" : "Demo controls"}
      </button>
    </div>
  );
}

/* ============================================================================
   APP
============================================================================ */
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const simRef = useRef(initSim());
  const overridesRef = useRef({});
  const historyRef = useRef({}); 

  const seedTick = useMemo(() => (USE_MOCK_DATA ? tickSim(simRef.current, {}) : null), []);
  const [riskSummary, setRiskSummary] = useState(seedTick?.risk_summary || null);
  const [recommendations, setRecommendations] = useState(seedTick?.recommendations || null);
  const [stale, setStale] = useState(false);
  const [connected, setConnected] = useState(USE_MOCK_DATA);
  const [connectionError, setConnectionError] = useState(null);
  const [lastGoodAt, setLastGoodAt] = useState(Date.now());

  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoneFormOpen, setZoneFormOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const [criticalOpen, setCriticalOpen] = useState(false);
  const [ackLevel, setAckLevel] = useState(0);
  const [checklist, setChecklist] = useState({});

  useEffect(() => {
    if (!riskSummary) return;
    riskSummary.zones.forEach((z) => {
      historyRef.current[z.zone_id] = [{ t: 0, density: z.density }];
    });
  }, []);

  const fetchRealState = useCallback(async () => {
    const res = await fetch(STATE_ENDPOINT, { method: "GET" });
    if (!res.ok) throw new Error(`GET /state failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!data?.risk_summary || !data?.recommendations) {
      throw new Error("Response is missing risk_summary or recommendations");
    }
    return data;
  }, []);

  const fetchMockState = useCallback(async () => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < 0.07) reject(new Error("simulated network drop"));
        else resolve(tickSim(simRef.current, overridesRef.current));
      }, 120);
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = USE_MOCK_DATA ? await fetchMockState() : await fetchRealState();
      overridesRef.current = {}; 
      setRiskSummary(data.risk_summary);
      setRecommendations(data.recommendations);
      setStale(false);
      setConnected(true);
      setConnectionError(null);
      setLastGoodAt(Date.now());
      data.risk_summary.zones.forEach((z) => {
        const arr = historyRef.current[z.zone_id] || [];
        historyRef.current[z.zone_id] = [...arr.slice(-19), { t: arr.length, density: z.density }];
      });
    } catch (e) {
      if (connected) setStale(true); 
      else setConnectionError(e.message); 
    }
  }, [connected, fetchMockState, fetchRealState]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 2500);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (!riskSummary) return;
    const level = riskSummary.overall_risk_level;
    
    // We removed the "level < 2" auto-close logic completely.
    // Now, it only triggers the modal to open on High/Critical risks, 
    // and stays open until the operator manually closes it.
    if (level >= 3 && level > ackLevel && !criticalOpen) {
      setCriticalOpen(true);
      setChecklist({});
    }
  }, [riskSummary?.overall_risk_level]);

  const handleAuthorize = () => {
    setAckLevel(riskSummary.overall_risk_level);
    setCriticalOpen(false);
  };

  if (!isAuthenticated) {
    return <AuthorityLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  if (!riskSummary) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center font-sans px-6" style={{ backgroundColor: BG_VOID, color: TEXT }}>
        <div className="max-w-sm w-full text-center">
          {connectionError ? (
            <>
              <WifiOff size={28} style={{ color: RISK[4].color }} className="mx-auto mb-3" />
              <div className="text-sm font-semibold mb-1">Can't reach the backend</div>
              <div className="text-xs mb-4" style={{ color: MUTED }}>{connectionError}</div>
              <div className="text-[11px] font-mono px-3 py-2 rounded-md" style={{ backgroundColor: BG_PANEL, border: `1px solid ${LINE}`, color: DIM }}>
                Trying {STATE_ENDPOINT} every 2.5s
              </div>
            </>
          ) : (
            <>
              <Radio size={28} style={{ color: MUTED }} className="mx-auto mb-3 animate-pulse" />
              <div className="text-sm font-semibold mb-1">Connecting to backend…</div>
              <div className="text-xs" style={{ color: MUTED }}>{STATE_ENDPOINT}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  const selectedZone = riskSummary.zones.find((z) => z.zone_id === selectedZoneId);
  const overall = riskSummary.overall_risk_level;

  return (
    <div className="min-h-screen w-full font-sans" style={{ backgroundColor: BG_VOID, color: TEXT }}>
      {/* TOP BAR */}
      <div
        className="sticky top-0 z-10 flex items-center gap-4 px-4 sm:px-6 py-3"
        style={{ backgroundColor: `${BG_VOID}F2`, borderBottom: `1px solid ${LINE}`, backdropFilter: "blur(6px)" }}
      >
        <button onClick={() => setMenuOpen(true)} className="p-1.5 rounded-md hover:bg-white/5" style={{ color: MUTED }}>
          <Menu size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs sm:text-sm font-bold tracking-widest uppercase truncate">Crowd Watch</div>
          <div className="text-[10px] sm:text-[11px] font-mono" style={{ color: DIM }}>
            {stale
              ? `Signal lost — showing reading from ${new Date(lastGoodAt).toLocaleTimeString()}`
              : `Live · updated ${new Date(riskSummary.timestamp).toLocaleTimeString()}`}
          </div>
        </div>
        {stale && <WifiOff size={16} style={{ color: RISK[3].color }} />}
        {/* ADD THE SIGN OUT BUTTON RIGHT HERE */}
        <button 
          onClick={() => setIsAuthenticated(false)}
          className="text-xs px-2.5 py-1 rounded-md hover:bg-white/5 font-mono"
          style={{ border: `1px solid ${LINE}`, color: MUTED }}
        >
          Sign Out
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: DIM }}>Overall</div>
            <div className="text-xs font-mono font-bold" style={{ color: riskColor(overall) }}>{riskLabel(overall)}</div>
          </div>
          <RiskBeacon level={overall} size={44} />
        </div>
      </div>

      {/* MAIN */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-semibold" style={{ color: MUTED }}>Venue overview</h1>
          <div className="flex items-center gap-3 text-[11px] font-mono" style={{ color: DIM }}>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: riskColor(l) }} />
                {RISK[l]?.short || "UNKNOWN"}
              </span>
            ))}
          </div>
        </div>

        <VenueHeatmap zones={riskSummary.zones} onSelect={setSelectedZoneId} />
        
        {/* Level 2 Non-Blocking Banner */}
        {overall === 2 && !criticalOpen && (
          <div
            className="mt-4 flex items-center justify-between px-4 py-3 rounded-md border-l-4 shadow-lg"
            style={{ backgroundColor: `${riskColor(2)}14`, borderColor: riskColor(2) }}
          >
            <div className="flex items-center gap-3 text-sm" style={{ color: TEXT }}>
              <AlertTriangle size={18} style={{ color: riskColor(2) }} />
              <div>
                <span className="font-bold uppercase tracking-wider text-xs" style={{ color: riskColor(2) }}>
                  Congestion Warning
                </span>
                <div className="text-xs" style={{ color: MUTED }}>
                  Elevated density detected in the venue. Consider reviewing proactive measures.
                </div>
              </div>
            </div>
            <ActionButton variant="secondary" onClick={() => setCriticalOpen(true)}>
              Review actions
            </ActionButton>
          </div>
        )}
        
        {overall >= 3 && !criticalOpen && (
          <div
            className="mt-4 flex items-center justify-between px-4 py-3 rounded-md"
            style={{ backgroundColor: `${riskColor(overall)}14`, border: `1px solid ${riskColor(overall)}55` }}
          >
            <div className="flex items-center gap-2 text-sm" style={{ color: TEXT }}>
              <ClipboardList size={16} style={{ color: riskColor(overall) }} />
              Response plan authorized for level {ackLevel}. Reopen if you need to review it again.
            </div>
            <ActionButton variant="secondary" onClick={() => { setCriticalOpen(true); }}>
              Review plan
            </ActionButton>
          </div>
        )}
      </div>

      {/* SIDE DRAWER */}
      {selectedZone && (
        <ZoneDrawer zone={selectedZone} history={historyRef.current[selectedZone.zone_id]} onClose={() => setSelectedZoneId(null)} />
      )}

      {/* SIDE MENU */}
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenZoneForm={() => { setMenuOpen(false); setZoneFormOpen(true); }}
        onOpenNotify={() => { setMenuOpen(false); setNotifyOpen(true); }}
      />

      {zoneFormOpen && <ZoneFormModal zones={riskSummary.zones} onClose={() => setZoneFormOpen(false)} />}
      {notifyOpen && (
        <NotifyModal zoneIds={riskSummary.zones.map((z) => z.zone_id)} onClose={() => setNotifyOpen(false)} />
      )}

      {/* CRITICAL RISK MODAL */}
      {criticalOpen && (
        <CriticalRiskModal
          overallLevel={overall}
          recommendations={recommendations}
          checklist={checklist}
          onToggle={(id) => setChecklist((c) => ({ ...c, [id]: !c[id] }))}
          onAuthorize={handleAuthorize}
          onClose={() => { setCriticalOpen(false); setAckLevel(0); }}
        />
      )}

      <DemoControls
        open={demoOpen}
        onToggle={() => setDemoOpen((o) => !o)}
        onBump={(zoneId, delta) => { overridesRef.current[zoneId] = delta; }}
        onCalm={() => {
          Object.keys(simRef.current).forEach((id) => {
            simRef.current[id].density = ZONE_SEED.find((z) => z.id === id).base;
          });
        }}
      />
    </div>
  );
}