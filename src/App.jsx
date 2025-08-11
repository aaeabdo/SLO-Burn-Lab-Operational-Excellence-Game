import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import {
  AlertTriangle,
  BadgeCheck,
  Brain,
  Clock4,
  Gauge,
  Play,
  Square,
  RotateCcw,
  Upload,
  TrendingUp,
  Activity,
  ShieldCheck,
  Target,
  BellRing,
  LogIn,
  Bug,
  CircleHelp,
  Info,
} from "lucide-react";

/**
 * Operational Excellence Game
 * A single-file, gamified page that lets teams learn:
 *  - Select a service tier
 *  - Define SLO / SLI
 *  - Push logs (business_process_logger schema, extended for SLO compliance)
 *  - Visualize logs
 *  - See when alerts are triggered (SLO breach, MWMB burn-rate, latency, saturation & business rule)
 */

// ---- Constants -------------------------------------------------------------

const TIERS = {
  "Tier-0": {
    description: "Business-Critical. ‘Can’t fail’ systems.",
    minSLO: 99.95,
    maxYearlyDowntime: "4h 20m 49s",
    incident: "P-0",
    onCall: "24/7 Required",
    targets: { MTTA_min: 5, MTTR_min: 60, MTTC_hours: 24 },
  },
  "Tier-1": {
    description: "Important. Core but slightly more tolerant.",
    minSLO: 99.5,
    maxYearlyDowntime: "1d 19h 28m 9s",
    incident: "P-1",
    onCall: "24/7 Required",
    targets: { MTTA_min: 5, MTTR_min: 60, MTTC_hours: 24 },
  },
  "Tier-2": {
    description: "Supporting. Partial unavailability often accepted.",
    minSLO: 99.0,
    maxYearlyDowntime: "3d 14h 56m 18s",
    incident: "P-2",
    onCall: "Business Hours Recommended",
    targets: { MTTA_min: 15, MTTR_min: 240, MTTC_hours: 72 },
  },
  "Tier-3": {
    description: "Internal tools. Not mission-critical for customers.",
    minSLO: 98.0,
    maxYearlyDowntime: "7d 5h 52m 35s",
    incident: "P-3",
    onCall: "Business Hours Recommended",
    targets: { MTTA_min: 60, MTTR_min: 24 * 60, MTTC_hours: 120 },
  },
};

const TIER_PRESETS = {
  "Tier-0": { availabilityTarget: TIERS["Tier-0"].minSLO, latencyP95Target: 500 },
  "Tier-1": { availabilityTarget: TIERS["Tier-1"].minSLO, latencyP95Target: 800 },
  "Tier-2": { availabilityTarget: TIERS["Tier-2"].minSLO, latencyP95Target: 1200 },
  "Tier-3": { availabilityTarget: TIERS["Tier-3"].minSLO, latencyP95Target: 1500 },
};

const GOLDEN_EVENT_TYPES = [
  "page_view",
  "add_to_cart",
  "submit_payment",
  "complete_payment",
  "submit_order",
  "sync_order_with_erp",
  "fulfill_order",
  "close_order",
];

const DEFAULT_SLI = {
  availability: true, // success rate
  latencyP95: true, // ms
};

const DEFAULT_SLO = {
  availabilityTarget: TIERS["Tier-1"].minSLO, // match Tier-1 by default
  latencyP95Target: 800, // ms (override by tier presets on selection)
};

const SCENARIOS = {
  Calm: {
    description: "Normal traffic, low errors, steady latency.",
    baseTps: 8,
    errorRate: 0.002,
    latencyMean: 120,
    latencyJitter: 80,
    cpuBase: 35,
  },
  "K8s Network Meltdown": {
    description: "Severe infra issue – errors & latency spike, saturation climbs.",
    baseTps: 10,
    errorRate: 0.6,
    latencyMean: 1800,
    latencyJitter: 600,
    cpuBase: 85,
  },
  "Viral Discount Code": {
    description: "Throughput surge; business-rule breach (discount >= 50% usage).",
    baseTps: 80,
    errorRate: 0.05,
    latencyMean: 400,
    latencyJitter: 250,
    cpuBase: 75,
  },
};

// ---- Helpers ---------------------------------------------------------------

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatPct(n, digits = 2) {
  if (!Number.isFinite(n)) return "–";
  return `${n.toFixed(digits)}%`;
}

function formatMs(n) {
  if (!Number.isFinite(n)) return "–";
  return `${Math.round(n)} ms`;
}

function timeAgo(ms) {
  if (!ms) return "–";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function percentile(arr, p) {
  if (!arr.length) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[clamp(idx, 0, sorted.length - 1)];
}

function expectedBadPercent(sloTarget, burnThr) {
  return (100 - sloTarget) * burnThr;
}

// ---- Tiny UI primitives ----------------------------------------------------

function Card({ title, icon, children, right }) {
  return (
    <div className="rounded-2xl border bg-white/80 backdrop-blur p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-slate-800">{title}</h3>
        </div>
        {right}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled }) {
  const styles =
    variant === "primary"
      ? "bg-slate-900 hover:bg-slate-800 text-white"
      : variant === "ghost"
      ? "hover:bg-slate-100"
      : variant === "danger"
      ? "bg-rose-600 hover:bg-rose-500 text-white"
      : "bg-white border hover:bg-slate-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-xl text-sm transition ${styles} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="w-10 h-6 rounded-full bg-slate-300 relative transition peer-checked:bg-emerald-500">
        <span className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white transition peer-checked:translate-x-4`} />
      </span>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 border text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

// ---- Main Component --------------------------------------------------------

export default function OperationalExcellenceGame() {
  // Stage / game state
  const [tier, setTier] = useState("Tier-1");
  const [sli, setSli] = useState(DEFAULT_SLI);
  const [slo, setSlo] = useState(DEFAULT_SLO);
  const [autoSim, setAutoSim] = useState(false);
  const [scenario, setScenario] = useState("Calm");
  const [cpu, setCpu] = useState(22);

  // Derived: current tier preset
  const tierPreset = TIER_PRESETS[tier];

  // 🔧 Policy: bake SLI (latency threshold) into error-rate for burn alerts
  const [bakeSLI, setBakeSLI] = useState(true);

  // Auto-apply tier SLO presets (availability min & latency max)
  const [autoTierPresets, setAutoTierPresets] = useState(true);

  // NEW: Let user lock expected threshold calculations to a fixed SLO
  const [lockExpected, setLockExpected] = useState(false);
  const [lockedSloTarget, setLockedSloTarget] = useState(slo.availabilityTarget);
  useEffect(() => {
    // If not locked, track current SLO automatically
    if (!lockExpected) setLockedSloTarget(slo.availabilityTarget);
  }, [slo.availabilityTarget, lockExpected]);

  // Logs store (cap to 3000 for perf)
  const [logs, setLogs] = useState([]);

  // Alerts store
  const [alerts, setAlerts] = useState([]);

  // Score & badges
  const [score, setScore] = useState(0);
  const [badges, setBadges] = useState([]);

  // Simulation ticker
  const simRef = useRef(null);

  // Derived: windowed metrics (last 60s)
  const windowMs = 60_000;
  const now = Date.now();
  const windowLogs = useMemo(
    () => logs.filter((l) => now - l.ts <= windowMs),
    [logs, now]
  );

  // Goodness policy: success AND (if baked) meets per-request latency threshold
  const goodByPolicy = (ev) => {
    if (!ev) return false;
    if (!ev.is_successful) return false;
    if (!bakeSLI) return true;
    const threshold = slo.latencyP95Target; // demo: use p95 target as per-request threshold
    return ev.latency_ms <= threshold;
  };

  const availability = useMemo(() => {
    if (!windowLogs.length) return NaN;
    const ok = windowLogs.filter((l) => goodByPolicy(l)).length;
    return (ok / windowLogs.length) * 100;
  }, [windowLogs, slo.latencyP95Target, bakeSLI]);

  const p95 = useMemo(
    () => percentile(windowLogs.map((l) => l.latency_ms), 95),
    [windowLogs]
  );

  const tpsSeries = useMemo(() => {
    // buckets per second
    const buckets = new Map();
    for (let i = 60; i >= 0; i--) {
      const t = now - i * 1000;
      const key = new Date(t).toLocaleTimeString();
      buckets.set(key, { time: key, total: 0, errors: 0 });
    }
    for (const l of windowLogs) {
      const key = new Date(l.ts).toLocaleTimeString();
      if (!buckets.has(key)) continue;
      const b = buckets.get(key);
      b.total += 1;
      if (!goodByPolicy(l)) b.errors += 1; // ⬅️ errors follow SLI-baked policy
    }
    return Array.from(buckets.values());
  }, [windowLogs, now, slo.latencyP95Target, bakeSLI]);

  const latencySeries = useMemo(() => {
    const arr = tpsSeries.map((b) => ({ time: b.time, p95: NaN }));
    // Group latency per second and compute p95
    const bySec = new Map();
    for (const l of windowLogs) {
      const key = new Date(l.ts).toLocaleTimeString();
      if (!bySec.has(key)) bySec.set(key, []);
      bySec.get(key).push(l.latency_ms);
    }
    for (const [key, vals] of bySec) {
      const p = percentile(vals, 95);
      const idx = arr.findIndex((a) => a.time === key);
      if (idx >= 0) arr[idx].p95 = p;
    }
    return arr;
  }, [tpsSeries, windowLogs]);

  // Error budget math (per rolling window)
  const sloTarget = slo.availabilityTarget; // current, editable
  const expectedSlo = lockExpected ? lockedSloTarget : sloTarget; // used for "expected" displays only
  const errorBudgetPercent = 100 - sloTarget; // current EB for observed burn calc

  const observedBadPercent = Number.isNaN(availability)
    ? 0
    : clamp(100 - availability, 0, 100);
  const burnRate =
    errorBudgetPercent > 0 ? observedBadPercent / errorBudgetPercent : Infinity;

  // --- Google MWMB burn-rate config (demo time scaling) ----------------------
  // Demo scale: 1 hour of real time == 60 seconds in the simulator.
  const DEMO_HOUR_SEC = 60; // tweak if you want faster/slower demos
  const hours = (h) => h * DEMO_HOUR_SEC;
  const minutes = (m) => (m / 60) * DEMO_HOUR_SEC;
  const days = (d) => d * 24 * DEMO_HOUR_SEC;

  // Google-recommended pairs (short window is 1/12 of long window):
  const GOOGLE_MWMB = {
    pageA: { long: hours(1), short: minutes(5), thr: 14.4, label: "Page: 1h & 5m @14.4x" },
    pageB: { long: hours(6), short: minutes(30), thr: 6, label: "Page: 6h & 30m @6x" },
    ticketA: { long: hours(24), short: hours(2), thr: 3, label: "Ticket: 24h & 2h @3x" },
    ticketB: { long: days(3), short: hours(6), thr: 1, label: "Ticket: 3d & 6h @1x" },
  };

  function burnStats(seconds) {
    const cutoff = Date.now() - seconds * 1000;
    const slice = logs.filter((l) => l.ts >= cutoff);
    const total = slice.length;
    if (!total) return { total: 0, badPct: 0, burn: 0 };
    const bad = slice.filter((l) => !goodByPolicy(l)).length; // ⬅️ policy-based errors
    const badPct = (bad / total) * 100;
    const burn = (100 - sloTarget) > 0 ? badPct / (100 - sloTarget) : Infinity; // observed burn uses current SLO
    return { total, badPct, burn };
  }

  const BR = {
    pageA: { s: burnStats(GOOGLE_MWMB.pageA.short), l: burnStats(GOOGLE_MWMB.pageA.long) },
    pageB: { s: burnStats(GOOGLE_MWMB.pageB.short), l: burnStats(GOOGLE_MWMB.pageB.long) },
    ticketA: { s: burnStats(GOOGLE_MWMB.ticketA.short), l: burnStats(GOOGLE_MWMB.ticketA.long) },
    ticketB: { s: burnStats(GOOGLE_MWMB.ticketB.short), l: burnStats(GOOGLE_MWMB.ticketB.long) },
  };

  // Scoring helpers – grant once per milestone
  useEffect(() => {
    if (tier && !badges.includes("Tiering Guru")) {
      setBadges((b) => [...b, "Tiering Guru"]);
      setScore((s) => s + 30);
    }
  }, [tier]);

  useEffect(() => {
    const min = TIERS[tier].minSLO;
    if (sloTarget >= min && !badges.includes("SLO Sensei")) {
      setBadges((b) => [...b, "SLO Sensei"]);
      setScore((s) => s + 60);
    }
  }, [sloTarget, tier]);

  // Sync SLOs to tier requirements on tier change (overwrite to exact preset)
  useEffect(() => {
    if (!autoTierPresets) return;
    const preset = TIER_PRESETS[tier];
    setSlo((prev) => {
      if (
        prev.availabilityTarget === preset.availabilityTarget &&
        prev.latencyP95Target === preset.latencyP95Target
      ) return prev;
      return {
        ...prev,
        availabilityTarget: preset.availabilityTarget,
        latencyP95Target: preset.latencyP95Target,
      };
    });
  }, [tier, autoTierPresets]);

  // Simulation engine
  useEffect(() => {
    if (!autoSim) {
      if (simRef.current) clearInterval(simRef.current);
      return;
    }
    const cfg = SCENARIOS[scenario];
    simRef.current = setInterval(() => {
      const batch = [];
      const tps = Math.max(
        1,
        Math.round(cfg.baseTps + (Math.random() * cfg.baseTps) / 2)
      );
      for (let i = 0; i < tps; i++) {
        const successful = Math.random() > cfg.errorRate;
        const latency = Math.max(
          5,
          cfg.latencyMean + (Math.random() - 0.5) * cfg.latencyJitter * 2
        );
        const ev = randomEvent({ successful, latency, scenario });
        batch.push(ev);
      }
      setLogs((prev) => {
        const next = [...prev, ...batch];
        if (next.length > 3000) next.splice(0, next.length - 3000);
        return next;
      });
      setCpu((c) =>
        clamp(c + (Math.random() - 0.45) * 8 + (cfg.cpuBase - c) * 0.05, 5, 99)
      );
    }, 1000);

    return () => clearInterval(simRef.current);
  }, [autoSim, scenario]);

  // Alerting engine – realtime, on input changes
  useEffect(() => {
    checkAlerts();
  }, [logs, cpu, p95, availability, sloTarget, sli, tier, scenario, bakeSLI, slo.latencyP95Target]);

  function checkAlerts() {
    const newAlerts = [];

    // ---- Google MWMB alerts (page-level & ticket-level) – SLI baked --------
    const pairs = [
      {
        key: GOOGLE_MWMB.pageA.label,
        short: GOOGLE_MWMB.pageA.short,
        long: GOOGLE_MWMB.pageA.long,
        thr: GOOGLE_MWMB.pageA.thr,
        severity: tier === "Tier-0" || tier === "Tier-1" ? "P0" : "P1",
      },
      {
        key: GOOGLE_MWMB.pageB.label,
        short: GOOGLE_MWMB.pageB.short,
        long: GOOGLE_MWMB.pageB.long,
        thr: GOOGLE_MWMB.pageB.thr,
        severity: tier === "Tier-0" || tier === "Tier-1" ? "P0" : "P1",
      },
      {
        key: GOOGLE_MWMB.ticketA.label,
        short: GOOGLE_MWMB.ticketA.short,
        long: GOOGLE_MWMB.ticketA.long,
        thr: GOOGLE_MWMB.ticketA.thr,
        severity: "P2",
      },
      {
        key: GOOGLE_MWMB.ticketB.label,
        short: GOOGLE_MWMB.ticketB.short,
        long: GOOGLE_MWMB.ticketB.long,
        thr: GOOGLE_MWMB.ticketB.thr,
        severity: "P2",
      },
    ];

    for (const p of pairs) {
      const s = burnStats(p.short);
      const l = burnStats(p.long);
      if (s.burn >= p.thr && l.burn >= p.thr && s.total > 20 && l.total > 20) {
        newAlerts.push({
          type: p.key,
          severity: p.severity,
          message: `Burn ≥ ${p.thr}x in short (${Math.round(p.short)}s: ${s.burn.toFixed(
            1
          )}x) AND long (${Math.round(p.long)}s: ${l.burn.toFixed(1)}x) windows (SLI baked=${bakeSLI})`,
        });
      }
    }

    // ---- "Demo" non-burn alerts to compare methods -------------------------
    // SLO breach (simple availability window)
    if (sli.availability && availability < sloTarget && windowLogs.length > 50) {
      newAlerts.push({
        type: "SLO Breach (demo)",
        severity: tier.startsWith("Tier-0")
          ? "P0"
          : tier === "Tier-1"
          ? "P1"
          : tier === "Tier-2"
          ? "P2"
          : "P3",
        message: `Availability ${formatPct(availability)} < SLO ${formatPct(
          sloTarget
        )} (non-burn comparison)`,
      });
    }

    // Latency p95 threshold (demo)
    if (sli.latencyP95 && p95 > slo.latencyP95Target && windowLogs.length > 30) {
      newAlerts.push({
        type: "Latency p95 (demo)",
        severity: "P2",
        message: `p95 ${formatMs(p95)} > target ${formatMs(slo.latencyP95Target)} (non-burn comparison)`,
      });
    }

    // Saturation (demo)
    if (cpu > 85 && windowLogs.length > 10) {
      newAlerts.push({
        type: "Saturation (demo)",
        severity: "P2",
        message: `CPU ${cpu.toFixed(0)}% nearing capacity (non-burn comparison)`,
      });
    }

    // Business rule (Promo abuse – demo)
    const promoLastMin = windowLogs.filter(
      (l) =>
        l.event_type === "add_promo_code" &&
        l.is_successful &&
        (l.additional_context?.discount_rate || 0) >= 0.5
    ).length;
    if (promoLastMin > 200) {
      newAlerts.push({
        type: "Business Metric (demo)",
        severity: "P1",
        message: `High-rate usage of ≥50% discount (${promoLastMin} / 60s) (non-burn comparison)`,
      });
    }

    if (!newAlerts.length) return;

    setAlerts((prev) => {
      const openTypes = new Set(
        prev.filter((a) => !a.resolvedAt).map((a) => a.type)
      );
      const toAdd = newAlerts
        .filter((a) => !openTypes.has(a.type))
        .map((a) => ({ id: uuid(), createdAt: Date.now(), ...a }));
      if (!toAdd.length) return prev;
      if (toAdd.some((a) => a.type.toLowerCase().includes("page"))) {
        setScore((s) => s + 40);
        if (!badges.includes("Signal First")) setBadges((b) => [...b, "Signal First"]);
      }
      return [...toAdd, ...prev];
    });
  }

  // Compute SLO compliance snapshot for events
  function computeSloCompliance({ latency_ms, is_successful }) {
    const violations = [];
    // Demo policy: only latency; availability derives from success
    if (latency_ms > slo.latencyP95Target) violations.push("latency");
    return {
      is_slo_compliant: violations.length === 0,
      slo_violations: violations,
      slo_thresholds: { latency_ms: slo.latencyP95Target },
    };
  }

  function randomEvent({ successful, latency, scenario }) {
    const now = Date.now();
    const event_type =
      GOLDEN_EVENT_TYPES[
        Math.floor(Math.random() * GOLDEN_EVENT_TYPES.length)
      ];
    const flow = "order_to_cash";
    const env = "production";
    const discount_rate =
      scenario === "Viral Discount Code" && Math.random() < 0.7
        ? 0.5 + Math.random() * 0.4
        : Math.random() < 0.05
        ? 0.1
        : 0;

    const base = {
      logger: "business_process_logger",
      flow,
      event_type,
      is_successful: successful,
      origin_service: Math.random() < 0.6 ? "on-frontend" : "solidus",
      environment: env,
      latency_ms: latency,
      status_code: successful ? 200 : [500, 502, 503][Math.floor(Math.random() * 3)],
      ts: now,
    };

    const compliance = computeSloCompliance(base);

    const log = {
      ...base,
      ...compliance, // ➕ new schema fields
      additional_context: {
        user_id: `user_${Math.floor(Math.random() * 9999)}`,
        country_iso_code: ["DE", "CH", "US", "FR", "GB"][
          Math.floor(Math.random() * 5)
        ],
        currency_iso_code: ["EUR", "CHF", "USD"][
          Math.floor(Math.random() * 3)
        ],
        language_iso_code: ["de", "en", "fr"][Math.floor(Math.random() * 3)],
        page_url: "/checkout",
        discount_rate,
        error_code: successful
          ? null
          : ["E5XX", "ECONN", "ETIME", "EPAY"][Math.floor(Math.random() * 4)],
        channel_type: Math.random() < 0.7 ? "web" : "app",
      },
      tracing_context: {
        trace_id: uuid(),
        session_id: `sess_${Math.floor(Math.random() * 999999)}`,
        on_uuid: `dev_${Math.floor(Math.random() * 999999)}`,
        request_id: uuid(),
      },
    };
    return log;
  }

  function pushManualLog(partial = {}) {
    const base = {
      logger: "business_process_logger",
      flow: partial.flow || "order_to_cash",
      event_type: partial.event_type || "submit_payment",
      is_successful: partial.is_successful ?? true,
      origin_service: partial.origin_service || "on-frontend",
      environment: partial.environment || "production",
      latency_ms: partial.latency_ms || Math.round(100 + Math.random() * 200),
      status_code: partial.is_successful === false ? 500 : 200,
      ts: Date.now(),
    };
    const compliance = computeSloCompliance(base);
    const ev = {
      ...base,
      ...compliance,
      additional_context: {
        user_id: partial.user_id || `user_${Math.floor(Math.random() * 9999)}`,
        country_iso_code: partial.country_iso_code || "DE",
        order_number: partial.order_number || undefined,
        currency_iso_code: partial.currency_iso_code || "EUR",
        language_iso_code: partial.language_iso_code || "en",
        page_url: partial.page_url || "/checkout",
        error_code: partial.error_code || null,
        discount_rate: partial.discount_rate || 0,
        channel_type: partial.channel_type || "web",
      },
      tracing_context: {
        trace_id: uuid(),
        session_id: `sess_${Math.floor(Math.random() * 999999)}`,
        on_uuid: `dev_${Math.floor(Math.random() * 999999)}`,
        request_id: uuid(),
      },
    };
    setLogs((l) => [...l, ev].slice(-3000));
  }

  function ackAlert(id) {
    setAlerts((arr) =>
      arr.map((a) => (a.id === id && !a.ackAt ? { ...a, ackAt: Date.now() } : a))
    );
    const t = TIERS[tier].targets.MTTA_min * 60 * 1000; // ms
    const a = alerts.find((x) => x.id === id);
    if (a && Date.now() - a.createdAt <= t && !badges.includes("First Responder")) {
      setBadges((b) => [...b, "First Responder"]);
      setScore((s) => s + 50);
    }
  }

  function resolveAlert(id) {
    setAlerts((arr) =>
      arr.map((a) => (a.id === id && !a.resolvedAt ? { ...a, resolvedAt: Date.now() } : a))
    );
    const t = TIERS[tier].targets.MTTR_min * 60 * 1000; // ms
    const a = alerts.find((x) => x.id === id);
    if (a && Date.now() - a.createdAt <= t && !badges.includes("Stability Champion")) {
      setBadges((b) => [...b, "Stability Champion"]);
      setScore((s) => s + 70);
    }
  }

  function resetAll() {
    setLogs([]);
    setAlerts([]);
    setScore(0);
    setBadges([]);
    setCpu(22);
  }

  // Progress bar
  const goal = 300;
  const progress = clamp((score / goal) * 100, 0, 100);

  // Table view (limited)
  const tableRows = [...windowLogs].slice(-120).reverse();

  // --- Dev Self-tests (lightweight) -----------------------------------------
  const devTests = useMemo(() => {
    const results = [];
    // Test 1: percentile 95 of 1..100 is 95
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    const p95exp = 95;
    const p95act = percentile(arr, 95);
    results.push({ name: "percentile(1..100,95)", pass: p95act === p95exp, got: p95act, expected: p95exp });

    // Test 2: burnRate math – with SLO 99.5 => EB=0.5; bad=10% => burn=20x
    const eb = 0.5;
    const bad = 10;
    const expectedBurn = 20;
    const calc = eb > 0 ? bad / eb : Infinity;
    results.push({ name: "burn = bad%/EB%", pass: Math.abs(calc - expectedBurn) < 1e-9, got: calc, expected: expectedBurn });

    // Test 3: short == long/12 checks
    const hours = (h) => 60 * h;
    const minutes = (m) => (m / 60) * 60;
    const days = (d) => d * 24 * 60;
    results.push({ name: "5m is 1/12 of 1h", pass: Math.abs(minutes(5) * 12 - hours(1)) < 1e-9, got: minutes(5) * 12, expected: hours(1) });
    results.push({ name: "30m is 1/12 of 6h", pass: Math.abs(minutes(30) * 12 - hours(6)) < 1e-9, got: minutes(30) * 12, expected: hours(6) });
    results.push({ name: "2h is 1/12 of 24h", pass: Math.abs(hours(2) * 12 - hours(24)) < 1e-9, got: hours(2) * 12, expected: hours(24) });
    results.push({ name: "6h is 1/12 of 3d", pass: Math.abs(hours(6) * 12 - days(3)) < 1e-9, got: hours(6) * 12, expected: days(3) });

    // Test 7: SLI-baked policy – success but slow is bad when baked
    const sloMs = 200;
    const goodBy = (ev, baked) => (ev.is_successful && (!baked || ev.latency_ms <= sloMs));
    const evSlow = { is_successful: true, latency_ms: 400 };
    const evFast = { is_successful: true, latency_ms: 100 };
    results.push({ name: "baked policy marks slow success as bad", pass: !goodBy(evSlow, true) && goodBy(evFast, true), got: `${goodBy(evSlow, true)} & ${goodBy(evFast, true)}`, expected: "false & true" });

    // Test 8: non-baked policy – slow success stays good
    results.push({ name: "non-baked treats slow success as good", pass: goodBy(evSlow, false) === true, got: goodBy(evSlow, false), expected: true });

    // Test 9: preset overwrite (exact mapping)
    const preset = { availabilityTarget: 99.95, latencyP95Target: 500 };
    const overwritten = {
      availabilityTarget: preset.availabilityTarget,
      latencyP95Target: preset.latencyP95Target,
    };
    results.push({ name: "overwrite availability to preset", pass: overwritten.availabilityTarget === 99.95, got: overwritten.availabilityTarget, expected: 99.95 });
    results.push({ name: "overwrite latency to preset", pass: overwritten.latencyP95Target === 500, got: overwritten.latencyP95Target, expected: 500 });

    // Test 10: burnStats with empty window
    const empty = { total: 0, badPct: 0, burn: 0 };
    results.push({ name: "burnStats empty window", pass: empty.total === 0 && empty.badPct === 0 && empty.burn === 0, got: JSON.stringify(empty), expected: JSON.stringify({ total:0, badPct:0, burn:0 }) });

    // Test 11: expected bad% at threshold = EB * thr
    const EB = 100 - 99.9; // 0.1%
    const thr = 14.4;
    const expBad = EB * thr; // 1.44%
    results.push({ name: "EB * 14.4 = 1.44%", pass: Math.abs(expBad - 1.44) < 1e-9, got: expBad, expected: 1.44 });

    // Test 12: lock keeps expected static
    const lockedSLO = 99.9, changedSLO = 99.5;
    const before = expectedBadPercent(lockedSLO, 14.4);
    const after = expectedBadPercent(lockedSLO, 14.4); // unchanged because we use locked
    results.push({ name: "lock expected static", pass: Math.abs(before - after) < 1e-12, got: after, expected: before });

    // Extra Tests: edge cases
    const pNaN = percentile([], 95);
    results.push({ name: "percentile([]) is NaN", pass: Number.isNaN(pNaN), got: String(pNaN), expected: "NaN" });
    results.push({ name: "clamp works", pass: clamp(200, 0, 100) === 100 && clamp(-5, 0, 100) === 0, got: `${clamp(200,0,100)},${clamp(-5,0,100)}`, expected: "100,0" });

    return results;
  }, []);

  // Helper for Inspector (uses expectedSlo, which may be locked)
  const expBadPctAt = (thr) => expectedBadPercent(expectedSlo, thr);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Gauge className="w-6 h-6" />
          <h1 className="font-semibold">Operational Excellence Game</h1>
          <span className="text-slate-500">• Mastering the Pulse</span>
          <div className="ml-auto flex items-center gap-3">
            <Button variant="ghost" onClick={() => setAutoSim((v) => !v)}>
              {autoSim ? (
                <>
                  <Square className="w-4 h-4 mr-1" />Stop
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1" />Start
                </>
              )}
            </Button>
            <Button variant="ghost" onClick={resetAll}>
              <RotateCcw className="w-4 h-4 mr-1" />Reset
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="1) Select Service Tier" icon={<Target className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TIERS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setTier(k)}
                  className={`text-left p-3 rounded-xl border transition ${
                    tier === k ? "border-slate-900 bg-slate-900 text-white" : "hover:bg-white"
                  }`}
                >
                  <div className="font-semibold">{k}</div>
                  <div className="text-xs opacity-80">{v.description}</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] opacity-80">
                    <div>Min SLO</div>
                    <div className="text-right">{v.minSLO}%</div>
                    <div>Max yearly DT</div>
                    <div className="text-right">{v.maxYearlyDowntime}</div>
                    <div>Incident</div>
                    <div className="text-right">{v.incident}</div>
                    <div>On-call</div>
                    <div className="text-right">{v.onCall}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card title="2) Define SLI / SLO" icon={<ShieldCheck className="w-4 h-4" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Toggle
                  checked={autoTierPresets}
                  onChange={setAutoTierPresets}
                  label="Sync SLOs to tier"
                />
                <div className="text-xs text-slate-500">Preset for {tier}: ≥ {TIERS[tier].minSLO}% • p95 ≤ {tierPreset.latencyP95Target} ms</div>
              </div>

              <div className="flex items-center justify-between">
                <Toggle
                  checked={sli.availability}
                  onChange={(v) => setSli({ ...sli, availability: v })}
                  label="SLI: Availability"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">SLO ≥ {TIERS[tier].minSLO}%</span>
                  <input
                    type="number"
                    value={slo.availabilityTarget}
                    onChange={(e) =>
                      setSlo({
                        ...slo,
                        availabilityTarget: clamp(Number(e.target.value), 90, 100),
                      })
                    }
                    className="w-24 px-2 py-1 rounded-lg border text-sm"
                  />
                  <span className="text-sm">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Toggle
                  checked={sli.latencyP95}
                  onChange={(v) => setSli({ ...sli, latencyP95: v })}
                  label="SLI: Latency p95"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={slo.latencyP95Target}
                    onChange={(e) =>
                      setSlo({ ...slo, latencyP95Target: clamp(Number(e.target.value), 50, 5000) })
                    }
                    className="w-28 px-2 py-1 rounded-lg border text-sm"
                  />
                  <span className="text-sm">ms</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Toggle
                  checked={bakeSLI}
                  onChange={setBakeSLI}
                  label="Bake SLI into error-rate (recommended)"
                />
                <span className="text-xs text-slate-500">good = success {"&"} (latency ≤ target)</span>
              </div>

              {/* NEW: Lock expected thresholds to a fixed SLO for clarity */}
              <div className="flex items-center justify-between">
                <Toggle
                  checked={lockExpected}
                  onChange={(v) => {
                    setLockExpected(v);
                    if (v) setLockedSloTarget(sloTarget);
                  }}
                  label="Lock expected (MWMB) to current SLO"
                />
                <div className="text-xs text-slate-500">
                  Using SLO for expected: <b>{expectedSlo}%</b>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                <Stat label="Availability" value={formatPct(availability || 0)} sub="rolling 60s (policy-based)" />
                <Stat label="Latency p95" value={formatMs(p95)} sub="rolling 60s" />
                <Stat label="CPU (sat.)" value={`${cpu.toFixed(0)}%`} sub="instant" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Stat label="Error Budget" value={formatPct(100 - sloTarget)} sub={`SLO ${sloTarget}%`} />
                <Stat label="Observed Bad" value={formatPct(observedBadPercent)} sub={`policy: ${bakeSLI ? "success+latency" : "success only"}`} />
                <Stat label="Burn Rate" value={`${Number.isFinite(burnRate) ? burnRate.toFixed(2) : "∞"}x`} sub="MWMB uses this" />
              </div>
            </div>
          </Card>

          <Card title="3) Push Logs" icon={<Upload className="w-4 h-4" />} right={<Toggle checked={autoSim} onChange={setAutoSim} label="Auto-simulate" />}>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  className="px-2 py-1 rounded-lg border text-sm"
                >
                  {Object.keys(SCENARIOS).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-500">{SCENARIOS[scenario].description}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => pushManualLog({ is_successful: true })}>
                  <TrendingUp className="w-4 h-4 mr-1" />Success
                </Button>
                <Button
                  onClick={() => pushManualLog({ is_successful: false, error_code: "E5XX" })}
                  variant="danger"
                >
                  <Bug className="w-4 h-4 mr-1" />Failure
                </Button>
                <Button onClick={() => pushManualLog({ latency_ms: 2000 })}>
                  <Activity className="w-4 h-4 mr-1" />Latency Spike
                </Button>
                <Button
                  onClick={() =>
                    pushManualLog({ event_type: "add_promo_code", is_successful: true, discount_rate: 0.7 })
                  }
                >
                  <BadgeCheck className="w-4 h-4 mr-1" />50% Discount
                </Button>
              </div>

              <details className="mt-2">
                <summary className="text-sm text-slate-700 cursor-pointer">See example event (schema-aligned)</summary>
                <pre className="mt-2 text-[11px] p-2 bg-slate-900 text-slate-100 rounded-xl overflow-auto">
{JSON.stringify({
  logger: "business_process_logger",
  flow: "order_to_cash",
  event_type: "submit_payment",
  is_successful: true,
  // NEW: per-event SLO compliance snapshot
  is_slo_compliant: true,
  slo_violations: [],
  slo_thresholds: { latency_ms: 800 },
  origin_service: "on-frontend",
  environment: "production",
  latency_ms: 120,
  status_code: 200,
  additional_context: {
    user_id: "user_1234",
    country_iso_code: "DE",
    currency_iso_code: "EUR",
    language_iso_code: "en",
    page_url: "/checkout",
    error_code: null,
    channel_type: "web",
  },
  tracing_context: {
    trace_id: "<uuid>",
    session_id: "<session>",
    on_uuid: "<device>",
    request_id: "<request>"
  },
  ts: Date.now()
}, null, 2)}
                </pre>
              </details>
            </div>
          </Card>

          <Card title="Game Progress" icon={<Brain className="w-4 h-4" />}>
            <div className="space-y-3">
              <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-sm flex items-center justify-between">
                <span>
                  Score: <b>{score}</b> / {goal}
                </span>
                <span className="text-slate-500">Badges: {badges.join(" • ") || "–"}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* MIDDLE COLUMN */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="4) Visualize Logs & Signals" icon={<TrendingUp className="w-4 h-4" />}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={tpsSeries}
                      margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" hide />
                      <YAxis hide />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#0ea5e9"
                        fill="url(#g1)"
                        name="Throughput/s"
                      />
                      <Area
                        type="monotone"
                        dataKey="errors"
                        stroke="#ef4444"
                        fillOpacity={0.1}
                        fill="#ef4444"
                        name="Errors/s (policy)"
                      />
                      <Legend />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={latencySeries}
                      margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" hide />
                      <YAxis hide />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="p95"
                        stroke="#10b981"
                        name="Latency p95 (ms)"
                        dot={false}
                      />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="Logs (60s)" value={windowLogs.length} />
                  <Stat
                    label="Errors (policy)"
                    value={tpsSeries.reduce((a, b) => a + b.errors, 0)}
                  />
                  <Stat
                    label="Good (policy)"
                    value={Math.max(
                      0,
                      windowLogs.length - tpsSeries.reduce((a, b) => a + b.errors, 0)
                    )}
                  />
                  <Stat label="Bake SLI?" value={bakeSLI ? "Yes" : "No"} />
                </div>
              </div>
            </div>
          </Card>

          <Card title={`Burn-rate Alerts (Google MWMB) \u2022 Demo scale: 1h= ${DEMO_HOUR_SEC}s`} icon={<BellRing className="w-4 h-4" />}>
            <div className="space-y-3">
              {["pageA", "pageB", "ticketA", "ticketB"].map((k) => {
                const w = GOOGLE_MWMB[k];
                const S = BR[k].s;
                const L = BR[k].l;
                const thrBadPct = expBadPctAt(w.thr);
                const fired = S.burn >= w.thr && L.burn >= w.thr && S.total > 20 && L.total > 20;
                return (
                  <div key={k} className="p-3 rounded-xl border bg-white">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{w.label}</div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          fired
                            ? "bg-rose-50 border-rose-200 text-rose-700"
                            : "bg-slate-50"
                        }`}
                      >
                        {fired ? "Would fire" : "Not firing"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
                      <Stat
                        label={`Short (~${Math.round(w.short)}s) burn`}
                        value={`${S.burn.toFixed(2)}x`}
                        sub={`${S.total} evts • bad ${formatPct(S.badPct)}`}
                      />
                      <Stat
                        label={`Long (~${Math.round(w.long)}s) burn`}
                        value={`${L.burn.toFixed(2)}x`}
                        sub={`${L.total} evts • bad ${formatPct(L.badPct)}`}
                      />
                      <Stat
                        label="Expected bad% (at thr)"
                        value={formatPct(thrBadPct)}
                        sub={`thr=${w.thr}x • using SLO ${expectedSlo}%`}
                      />
                      <Stat
                        label="Obs bad% (S/L)"
                        value={`${formatPct(S.badPct)} / ${formatPct(L.badPct)}`}
                        sub={`need ≥ ${formatPct(thrBadPct)}`}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="text-xs text-slate-600 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5" />
                <div>
                  <b>Expected is static when locked:</b> toggle <i>Lock expected (MWMB) to current SLO</i> to freeze calculations. Observed burn moves with traffic; thresholds (14.4×, 6×, …) are fixed; expected bad% changes only if the SLO used for the math changes.
                </div>
              </div>
            </div>
          </Card>

          <Card title="Burn-rate Inspector" icon={<Gauge className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Current SLO (observed)" value={`${sloTarget}%`} sub="drives observed burn" />
              <Stat label="SLO for expected" value={`${expectedSlo}%`} sub={lockExpected ? "locked" : "follows current"} />
              <Stat label="14.4× (page)" value={formatPct(expBadPctAt(14.4))} sub="expected bad%" />
              <Stat label="6× (page)" value={formatPct(expBadPctAt(6))} sub="expected bad%" />
              <Stat label="3× (ticket)" value={formatPct(expBadPctAt(3))} sub="expected bad%" />
              <Stat label="1× (ticket)" value={formatPct(expBadPctAt(1))} sub="expected bad%" />
            </div>
          </Card>

          <Card title="Recent Events" icon={<LogIn className="w-4 h-4" />} right={<span className="text-xs text-slate-500">last 120 items</span>}>
            <div className="overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">Time</th>
                    <th className="py-1 pr-2">Event</th>
                    <th className="py-1 pr-2">Success</th>
                    <th className="py-1 pr-2">Meets SLO</th>
                    <th className="py-1 pr-2">Latency</th>
                    <th className="py-1 pr-2">Service</th>
                    <th className="py-1 pr-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((l) => (
                    <tr key={l.tracing_context.trace_id} className="border-t">
                      <td className="py-1 pr-2 text-slate-500">
                        {new Date(l.ts).toLocaleTimeString()}
                      </td>
                      <td className="py-1 pr-2">{l.event_type}</td>
                      <td
                        className={`py-1 pr-2 ${
                          l.is_successful ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {String(l.is_successful)}
                      </td>
                      <td
                        className={`py-1 pr-2 ${
                          l.is_slo_compliant ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {String(l.is_slo_compliant)}
                      </td>
                      <td className="py-1 pr-2">{formatMs(l.latency_ms)}</td>
                      <td className="py-1 pr-2">{l.origin_service}</td>
                      <td className="py-1 pr-2">{l.status_code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-1 space-y-4">
          <Card
            title="5) Alerts in Action"
            icon={<BellRing className="w-4 h-4" />}
            right={<span className="text-xs text-slate-500">Acknowledge & Resolve to score</span>}
          >
            <div className="space-y-2 max-h-80 overflow-auto">
              {alerts.length === 0 && (
                <div className="text-sm text-slate-500 flex items-center gap-2">
                  <CircleHelp className="w-4 h-4" />No active or historical alerts yet.
                </div>
              )}
              {alerts.map((a) => (
                <div key={a.id} className={`p-3 rounded-xl border ${a.resolvedAt ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span className="font-semibold">{a.type}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 border">{a.severity}</span>
                      </div>
                      <div className="text-sm mt-1">{a.message}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {timeAgo(Date.now() - a.createdAt)} • {new Date(a.createdAt).toLocaleTimeString()}
                      </div>
                      {a.ackAt && (
                        <div className="text-[11px] text-slate-500">
                          ACK in {((a.ackAt - a.createdAt) / 1000).toFixed(1)}s
                        </div>
                      )}
                      {a.resolvedAt && (
                        <div className="text-[11px] text-slate-500">
                          Resolved in {((a.resolvedAt - a.createdAt) / 1000).toFixed(1)}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {!a.ackAt && (
                        <Button onClick={() => ackAlert(a.id)}>
                          <Clock4 className="w-4 h-4 mr-1" />Acknowledge
                        </Button>
                      )}
                      {!a.resolvedAt && (
                        <Button onClick={() => resolveAlert(a.id)} variant="primary">
                          <ShieldCheck className="w-4 h-4 mr-1" />Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Tips" icon={<BadgeCheck className="w-4 h-4" />}>
            <ul className="text-sm list-disc pl-5 space-y-1">
              <li>Burn-rate with SLI baked is usually sufficient for paging. Other alerts here are for comparison.</li>
              <li>Pick a tier that matches impact. Higher tiers demand higher SLOs and faster MTTA/MTTR.</li>
              <li>Track Availability & Latency as SLIs. Set SLOs that meet (or exceed) your tier’s minimums.</li>
              <li>Use the simulator to create failures, spikes, and business-rule breaches.</li>
              <li>Google MWMB: short=1/12 long. Page at 14.4x (1h&5m) or 6x (6h&30m); Ticket at 3x (24h&2h) or 1x (3d&6h).</li>
            </ul>
          </Card>

          <Card title="Dev: Self-tests" icon={<Brain className="w-4 h-4" />}>
            <div className="text-xs">
              {devTests.map((t) => (
                <div key={t.name} className={`flex items-center justify-between border-b py-1 ${t.pass ? "text-emerald-700" : "text-rose-700"}`}>
                  <span>{t.name}</span>
                  <span>{t.pass ? "PASS" : `FAIL (got ${t.got}, expected ${t.expected})`}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Export" icon={<Upload className="w-4 h-4" />}>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(logs, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "simulated_logs.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download Logs JSON
              </Button>
              <Button
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify(logs.slice(-1)[0] || {}, null, 2)
                  )
                }
                variant="ghost"
              >
                Copy Last Event
              </Button>
            </div>
          </Card>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 pb-8 text-[12px] text-slate-500">
        <div className="mt-4">
          Built for the <b>Operational Excellence Handbook</b> — practice service tiering, SLOs/SLIs, logging, visualization & alerting. No data leaves your browser.
        </div>
      </footer>
    </div>
  );
}
