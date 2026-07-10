import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import { DEFAULT_API_BASE, getJson, joinUrl, postJson } from "./api";
import { extractRootCauseFromPdf } from "./pdfRootCause";
import "./root-cause.css";
import docPlusLogoDark from "./assets/docplus-logo-dark.png";
import docPlusLogoLight from "./assets/docplus-logo-light.png";
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "complaint", label: "Complaint Investigation", icon: "clinical_notes" },
  { id: "twin", label: "Digital Twin", icon: "hub" },
  { id: "audit", label: "Audit Shadow", icon: "visibility" },
  { id: "cybersecurity", label: "Cybersecurity", icon: "security" },
  { id: "performance", label: "Performance", icon: "monitoring" },
  { id: "reports", label: "Reports", icon: "summarize" },
    { id: "about", label: "About Us", icon: "groups" },
  
];

const DASHBOARD_CACHE_KEY = "medtrace-dashboard-cache";
const COMPLAINT_DRAFT_KEY = "medtrace-complaint-draft";
const TWIN_CACHE_KEY = "medtrace-twin-cache";
const DASHBOARD_INITIAL_DATA = {
  health: { status: "ok", nodes: 870, edges: 2981 },
  documents: { graph_nodes: 870, graph_edges: 2981, vector: { provider: "chromadb" } },
  backend: { provider: "neo4j" },
  score: {
    score: 82.5,
    requirements: [
      { requirement_id: "REQ-PWR-001", score: 100 },
      { requirement_id: "REQ-PWR-002", score: 80 },
      { requirement_id: "REQ-PWR-003", score: 100 },
      { requirement_id: "REQ-PWR-004", score: 100 },
      { requirement_id: "REQ-PWR-005", score: 80 },
      { requirement_id: "REQ-PWR-006", score: 100 },
    ],
  },
  kpis: { node_count: 870, edge_count: 2981, stale_test_count: 5, open_capa_count: 2, orphan_count: 0 },
  freshness: [
    { requirement_id: "REQ-MEAS-032", status: "STALE" },
    { requirement_id: "REQ-CONN-074", status: "STALE" },
    { requirement_id: "REQ-SPO2-007", status: "STALE" },
    { requirement_id: "REQ-SPO2-008", status: "STALE" },
    { requirement_id: "REQ-SPO2-009", status: "STALE" },
  ],
};

function readStorageJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function writeStorageJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore private-mode or storage quota failures.
  }
}

function valueAt(source, path) {
  return String(path)
    .split(".")
    .reduce((node, key) => (node && node[key] !== undefined ? node[key] : undefined), source);
}

function firstValue(source, paths, fallback = undefined) {
  for (const path of paths) {
    const value = valueAt(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [value];
}

function numberLike(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function formatValue(value, empty = "--") {
  return hasValue(value) ? String(value) : empty;
}

function formatCompact(value) {
  return hasValue(value) ? compactNumber(value) : "--";
}

function compactNumber(value) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(numberLike(value));
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function riskClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("high")) return "risk-high";
  if (normalized.includes("medium") || normalized.includes("amber")) return "risk-medium";
  if (normalized.includes("low") || normalized.includes("green")) return "risk-low";
  return "risk-neutral";
}

function percentValue(value) {
  if (!hasValue(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function scoreFromStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("pass") || normalized.includes("green") || normalized.includes("closed")) return 100;
  if (normalized.includes("stale") || normalized.includes("review") || normalized.includes("pending")) return 60;
  if (normalized.includes("fail") || normalized.includes("red") || normalized.includes("gap")) return 20;
  return undefined;
}




function extractDevices(payload) {
  return asArray(payload?.devices || payload?.available_devices || payload?.data?.devices)
    .map((device) =>
      typeof device === "string"
        ? { id: device, name: device, raw: device }
        : {
            id: device.id || device.device_id || device.key || device.name,
            name: device.name || device.device_name || device.label || device.model,
            current_firmware: device.current_firmware || device.firmware_version,
            raw: device,
          },
    )
    .filter((device) => device.id);
}

function extractFrameworkOptions(payload) {
  const value = payload?.dynamic_inputs?.regulatory_framework;
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  return Array.from(new Set(value.match(/[A-Z][A-Z0-9_]+/g) || []));
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

function normalizeGraph(payload) {
  const graph = payload?.graph || payload?.payload || payload?.data || payload || {};
  const nodes = asArray(graph.nodes || graph.vertices || graph.graph_nodes).map((node, index) => ({
    id: node.id || node.node_id || node.key || node.properties?.id || `node-${index}`,
    label:
      node.label ||
      node.name ||
      node.title ||
      node.properties?.name ||
      node.properties?.title ||
      node.id ||
      node.properties?.id ||
      `Node ${index + 1}`,
    type: node.type || node.kind || node.category || node.labels?.[0] || node.properties?.type || "Node",
    score: percentValue(
      node.score ??
        node.readiness_score ??
        node.audit_score ??
        node.confidence_score ??
        node.properties?.score ??
        node.properties?.readiness_score ??
        node.properties?.audit_score ??
        node.properties?.confidence_score,
    ),
    raw: node,
  }));
  const edges = asArray(graph.edges || graph.relationships || graph.links).map((edge, index) => ({
    id: edge.id || `edge-${index}`,
    source: edge.source || edge.from || edge.start || edge.start_node || edge.source_id,
    target: edge.target || edge.to || edge.end || edge.end_node || edge.target_id,
    label: edge.label || edge.type || edge.relationship || "linked",
    raw: edge,
  }));

  return { nodes, edges: edges.filter((edge) => edge.source && edge.target) };
}

function extractFindings(payload) {
  const candidates = [
    payload?.audit_findings,
    payload?.findings,
    payload?.state?.audit_findings,
    payload?.final_state?.audit_findings,
    payload?.summary?.audit_findings,
    payload?.results,
  ];
  for (const candidate of candidates) {
    const rows = asArray(candidate).filter((item) => item && typeof item === "object");
    if (rows.length) {
      return rows.map((item, index) => ({
        id: item.id || item.finding_id || item.code || `FINDING-${String(index + 1).padStart(3, "0")}`,
        risk: item.risk || item.risk_level || item.severity || "Unspecified",
        title: item.title || item.observation || item.summary || item.issue || "Backend finding",
        detail: item.detail || item.description || item.rationale || item.recommendation || "",
        regulation: item.regulatory_reference || item.regulation || item.framework || "",
        raw: item,
      }));
    }
  }
  return [];
}

function extractReportAuditFindings(report) {
  return extractFindings({
    audit_findings:
      report?.audit_findings ||
      report?.audit_shadow?.findings ||
      report?.audit_shadow?.audit_findings ||
      report?.summary?.audit_shadow?.findings ||
      report?.summary?.audit_findings_detail,
  });
}

function extractReportCyberFindings(report) {
  return asArray(
    report?.cybersecurity_findings ||
      report?.cybersecurity?.findings ||
      report?.summary?.cybersecurity?.findings ||
      report?.summary?.cybersecurity_findings_detail ||
      report?.summary?.cves,
  ).filter((item) => item && typeof item === "object");
}

function extractReportSbomComponents(report) {
  return asArray(
    report?.sbom_components ||
      report?.cybersecurity?.sbom_components ||
      report?.summary?.cybersecurity?.sbom_components ||
      report?.summary?.sbom_components_detail ||
      report?.summary?.components,
  ).filter((item) => item && (typeof item === "object" || typeof item === "string"));
}

function reportCount(report, paths) {
  const value = firstValue(report || {}, paths);
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.length;
  return undefined;
}

function Icon({ name, className = "" }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function Button({ children, icon, variant = "primary", className = "", ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
    </button>
  );
}

function Card({ children, className = "" }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function SectionTitle({ eyebrow, title, children, action }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {children ? <p>{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

function StatusPill({ ok, label }) {
  return (
    <span className={`status-pill ${ok ? "ok" : "warn"}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function MetricCard({ icon, label, value, detail, tone = "gold" }) {
  return (
    <Card className={`metric metric-${tone}`}>
      <div className="metric-icon">
        <Icon name={icon} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </Card>
  );
}

function ProgressBar({ value = 0, label }) {
  const safeValue = Math.max(0, Math.min(100, numberLike(value)));
  return (
    <div className="progress-wrap">
      <div className="progress-meta">
        <span>{label}</span>
        <span>{Math.round(safeValue)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function WaitingProgress({ active, label = "Running agent workflow" }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return undefined;
    }
    setProgress(8);
    const timer = setInterval(() => {
      setProgress((current) => Math.min(94, current + Math.max(2, (96 - current) * 0.12)));
    }, 450);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;
  return (
    <Card className="waiting-panel">
      <div className="waiting-orbit">
        <span />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-4">
          <strong>{label}</strong>
          <span className="tiny">Backend request in progress</span>
        </div>
        <ProgressBar value={progress} label="Waiting period" />
        <div className="agent-steps">
          {["Intake", "Root Cause", "Evidence", "Risk", "CAPA", "Audit", "Cyber"].map((step, index) => (
            <span key={step} className={progress > index * 13 ? "active" : ""}>
              {step}
            </span>
          ))}
        </div>

        <div className="waiting-note">
          <Icon name="info" />
          <span>
            We have deployed our multi-agent agentic AI on Railway free tier, so due to minimal resources, it takes time. Please wait...
          </span>
        </div>

      </div>
    </Card>
  );
}

function JsonPanel({ data, title = "Raw response" }) {
  if (!data) return null;
  return (
    <details className="json-panel">
      <summary>{title}</summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="error-banner">
      <Icon name="warning" />
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ icon = "data_object", title, children }) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState icon="error" title="Page render failed">
          {this.state.error.message || "A backend payload could not be rendered."}
        </EmptyState>
      );
    }

    return this.props.children;
  }
}

function DeviceField({ value, onChange, devices = [], allowEmpty = false }) {
  if (devices.length) {
    return (
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">Backend default</option> : <option value="">Select a backend device</option>}
        {devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.name ? `${device.name} (${device.id})` : device.id}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Loaded from backend capabilities"
    />
  );
}

function FrameworkField({ value, onChange, options = [] }) {
  if (options.length) {
    return (
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Backend default</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Loaded from backend capabilities"
    />
  );
}

function Gauge({ value, label }) {
  const hasMetric = hasValue(value);
  const safeValue = hasMetric ? Math.max(0, Math.min(100, numberLike(value))) : 0;
  return (
    <div className="gauge" style={{ "--value": `${safeValue * 3.6}deg` }}>
      <div className="gauge-ring">
        <div>
          <strong>{hasMetric ? Math.round(safeValue) : "--"}</strong>
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}

function Heatmap({ title, rows }) {
  if (!rows.length) {
    return (
      <Card>
        <SectionTitle eyebrow="Backend data" title={title} />
        <EmptyState icon="dataset" title="No backend rows returned">
          Refresh after the related endpoint returns scored rows.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle eyebrow="Readiness heatmap" title={title}>
        Color intensity reflects audit confidence, stale evidence, and closure risk.
      </SectionTitle>
      <div className="heatmap-grid">
        {rows.map((row) => {
          const value = Math.max(0, Math.min(100, numberLike(row.value)));
          return (
            <div className="heat-cell" key={row.label} style={{ "--heat": value }}>
              <span>{row.label}</span>
              <strong>{Math.round(value)}</strong>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BarChart({ title, data }) {
  if (!data.length) {
    return (
      <Card>
        <SectionTitle eyebrow="Backend data" title={title} />
        <EmptyState icon="bar_chart" title="No backend distribution returned">
          Run the workflow again after the backend returns distribution values.
        </EmptyState>
      </Card>
    );
  }

  const max = Math.max(1, ...data.map((item) => numberLike(item.value)));
  return (
    <Card>
      <SectionTitle eyebrow="Evidence distribution" title={title}>
        Useful for showing judges where certainty comes from.
      </SectionTitle>
      <div className="bar-chart">
        {data.map((item) => (
          <div className="bar-row" key={item.label}>
            <span>{item.label}</span>
            <div>
              <i style={{ width: `${(numberLike(item.value) / max) * 100}%` }} />
            </div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MiniTrend({ data }) {
  if (!data.length) return null;
  const points = data;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const coords = points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 100 - ((value - min) / Math.max(1, max - min)) * 82 - 9;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="mini-trend" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={coords} />
    </svg>
  );
}

function statusScore(value, fallback = 70) {
  const normalized = String(value ?? "").toLowerCase();
  if (!normalized) return fallback;
  if (["ok", "online", "ready", "enabled", "available", "connected", "healthy", "chromadb", "neo4j", "true"].some((word) => normalized.includes(word))) return 95;
  if (["partial", "cached", "fallback", "degraded", "warning", "pending"].some((word) => normalized.includes(word))) return 72;
  if (["offline", "error", "failed", "unavailable", "disabled", "false"].some((word) => normalized.includes(word))) return 42;
  return fallback;
}

function durationToPerformance(durationMs) {
  if (!Number.isFinite(durationMs)) return undefined;
  return Math.max(20, Math.min(100, 100 - Math.min(80, durationMs / 125)));
}

function extractTraceRows(tracePayload) {
  const stepPayload =
    tracePayload?.steps ||
    tracePayload?.agent_steps ||
    tracePayload?.events ||
    tracePayload?.timeline ||
    tracePayload?.runs ||
    tracePayload?.nodes;

  return asArray(stepPayload)
    .filter((row) => row && typeof row === "object")
    .map((row, index) => {
      const duration = firstValue(row, ["duration_ms", "elapsed_ms", "latency_ms", "runtime_ms", "duration"]);
      const normalizedDuration = hasValue(duration) ? numberLike(duration) : undefined;
      const value =
        percentValue(row.performance_score ?? row.performance ?? row.score ?? row.success_rate ?? row.success ?? row.confidence ?? row.value) ??
        durationToPerformance(normalizedDuration) ??
        scoreFromStatus(row.status || row.state || row.result) ??
        statusScore(row.status || row.state || row.result, 76);

      return {
        label: row.agent || row.name || row.step || row.stage || row.node || row.label || `Agent ${index + 1}`,
        value: Math.max(0, Math.min(100, numberLike(value, 76))),
        detail: hasValue(normalizedDuration)
          ? `${Math.round(normalizedDuration)} ms`
          : titleCase(row.status || row.state || row.result || "Trace AI"),
      };
    })
    .filter((row) => row.label && hasValue(row.value));
}

function buildAgentPerformanceRows({ data, lastReport, score, stale, vectorStatus, neo4jStatus, langGraphStatus, openAiStatus }) {
  const traceCandidates = [
    lastReport?.summary?.trace_ai,
    lastReport?.trace_ai,
    lastReport?.agent_debug?.trace_ai,
    data?.debug?.trace_ai,
    data?.debug?.agent_performance,
  ];

  for (const candidate of traceCandidates) {
    const rows = extractTraceRows(candidate);
    if (rows.length) return rows.slice(0, 8);
  }

  const readinessScore = percentValue(score) ?? 76;
  const staleCount = Array.isArray(stale) ? stale.length : numberLike(stale, 0);
  const freshnessScore = Math.max(35, Math.min(100, 100 - staleCount * 8));
  const apiScore = statusScore(firstValue(data, ["health.status", "documents.status", "debug.status"]) || (data?.health ? "ok" : ""), 76);
  const graphScore = Math.round((statusScore(neo4jStatus, 78) + readinessScore) / 2);
  const vectorScore = statusScore(vectorStatus, 72);
  const langGraphScore = statusScore(langGraphStatus, 70);
  const reasoningScore = statusScore(openAiStatus, 68);

  return [
    { label: "Intake", value: apiScore, detail: "FastAPI" },
    { label: "Graph Context", value: graphScore, detail: "Neo4j + M1" },
    { label: "Evidence Retrieval", value: vectorScore, detail: "Chroma/RAG" },
    { label: "Risk Scoring", value: Math.round((readinessScore + freshnessScore) / 2), detail: "M2 risk" },
    { label: "CAPA Drafting", value: Math.round((readinessScore + graphScore) / 2), detail: "Closure gate" },
    { label: "Audit Shadow", value: Math.round((freshnessScore + graphScore) / 2), detail: "Gap scan" },
    { label: "LangGraph", value: langGraphScore, detail: "Orchestration" },
    { label: "OpenAI Reasoning", value: reasoningScore, detail: "Final synthesis" },
  ];
}

function AgentPerformanceGraph({ data, lastReport, score, stale, vectorStatus, neo4jStatus, langGraphStatus, openAiStatus }) {
  const rows = useMemo(
    () => buildAgentPerformanceRows({ data, lastReport, score, stale, vectorStatus, neo4jStatus, langGraphStatus, openAiStatus }),
    [data, lastReport, score, stale, vectorStatus, neo4jStatus, langGraphStatus, openAiStatus],
  );
  const trendPoints = rows.map((row) => Math.round(numberLike(row.value)));
  const average = rows.length ? Math.round(rows.reduce((total, row) => total + numberLike(row.value), 0) / rows.length) : undefined;
  const best = rows.reduce((current, row) => (numberLike(row.value) > numberLike(current?.value, -1) ? row : current), null);
  const watch = rows.reduce((current, row) => (numberLike(row.value) < numberLike(current?.value, 101) ? row : current), null);

  return (
    <Card>
      <SectionTitle eyebrow="Agent performance" title="Agent Performance Graph">
        Uses Trace AI timing data when a run is available, then falls back to live backend health, graph readiness, vector retrieval, and stale-evidence pressure.
      </SectionTitle>
      <div className="summary-grid">
        <div>
          <span>Overall performance</span>
          <strong>{hasValue(average) ? `${average}%` : "--"}</strong>
        </div>
        <div>
          <span>Best stage</span>
          <strong>{formatValue(best?.label)}</strong>
        </div>
        <div>
          <span>Needs attention</span>
          <strong>{formatValue(watch?.label)}</strong>
        </div>
      </div>
      {trendPoints.length ? (
        <MiniTrend data={trendPoints} />
      ) : (
        <EmptyState icon="monitoring" title="No performance signals returned">
          Run an agent workflow or refresh after `/agents/debug/status` returns telemetry.
        </EmptyState>
      )}
      <div className="bar-chart">
        {rows.map((row) => (
          <div className="bar-row" key={row.label}>
            <span>
              {row.label}
              {row.detail ? <small> {row.detail}</small> : null}
            </span>
            <div>
              <i style={{ width: `${Math.max(0, Math.min(100, numberLike(row.value)))}%` }} />
            </div>
            <strong>{Math.round(numberLike(row.value))}%</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GraphView({ graph, onSelect, selectedId }) {
  const [clickedNodeId, setClickedNodeId] = useState("");
  const [graphError, setGraphError] = useState("");
  const normalized = useMemo(() => normalizeGraph(graph), [graph]);
  const selectedNodeId = selectedId || clickedNodeId;
  const model = useMemo(() => {
    const MAX_VISIBLE_NODES = 180;
    const MAX_VISIBLE_RELS = 320;
    const palette = ["#22c55e", "#d4a82f", "#38bdf8", "#f97316", "#a78bfa", "#14b8a6", "#f43f5e", "#84cc16"];
    const typeIndex = new Map();
    const deviceNode = normalized.nodes.find((node) => String(node.type).toLowerCase().includes("device"));
    const visibleNodes = [
      ...(deviceNode ? [deviceNode] : []),
      ...normalized.nodes.filter((node) => node.id !== deviceNode?.id),
    ].slice(0, MAX_VISIBLE_NODES);
    const visibleIds = new Set(visibleNodes.map((node) => String(node.id)));
    const visibleEdges = normalized.edges
      .filter((edge) => visibleIds.has(String(edge.source)) && visibleIds.has(String(edge.target)))
      .slice(0, MAX_VISIBLE_RELS);

    const nodes = visibleNodes.map((node, index) => {
      const normalizedType = String(node.type || "Node");
      if (!typeIndex.has(normalizedType)) typeIndex.set(normalizedType, typeIndex.size);
      const colorIndex = typeIndex.get(normalizedType);
      const isDevice = node.id === deviceNode?.id;
      return {
        id: String(node.id),
        caption: String(node.label || node.id).slice(0, 34),
        captions: [
          { value: String(node.label || node.id).slice(0, 34), styles: ["bold"] },
          { value: titleCase(normalizedType).slice(0, 24), styles: [] },
        ],
        color: palette[colorIndex % palette.length],
        size: isDevice ? 46 : 22 + Math.min(18, numberLike(node.score) / 7),
        selected: String(node.id) === String(selectedNodeId),
        rawNode: node,
        x: isDevice ? 0 : undefined,
        y: isDevice ? 0 : undefined,
        pinned: isDevice,
      };
    });

    const rels = visibleEdges.map((edge, index) => ({
      id: `rel-${String(edge.id || index)}`,
      from: String(edge.source),
      to: String(edge.target),
      type: String(edge.label || "linked"),
      caption: String(edge.label || "linked").slice(0, 24),
      color: "#87938b",
      width: 1.3,
    }));

    return { nodes, rels, typeEntries: Array.from(typeIndex.keys()).slice(0, 8) };
  }, [normalized, selectedNodeId]);

  useEffect(() => {
    setGraphError("");
  }, [graph]);

  if (!normalized.nodes.length) {
    return (
      <div className="graph-view empty-graph">
        <EmptyState icon="hub" title="No backend graph returned">
          Select a backend device and refresh this view once the graph endpoint responds.
        </EmptyState>
      </div>
    );
  }

  if (graphError) {
    return (
      <div className="graph-view empty-graph">
        <EmptyState icon="hub" title="Graph renderer unavailable">
          {graphError}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="graph-view bloom-graph">
      <InteractiveNvlWrapper
        className="nvl-graph-frame"
        nodes={model.nodes}
        rels={model.rels}
        layout="forceDirected"
        nvlOptions={{ renderer: "canvas", disableTelemetry: true }}
        layoutOptions={{ initialZoom: 0.9 }}
        mouseEventCallbacks={{
          onNodeClick: (node) => {
            setClickedNodeId(node.id);
            onSelect?.(node.rawNode || node);
          },
          onDrag: true,
          onZoom: true,
          onPan: true,
        }}
        onInitializationError={(err) => {
          setGraphError(err instanceof Error ? err.message : String(err));
        }}
      />
      <div className="graph-overlay">
        <strong>{normalized.nodes.length}</strong>
        <span>nodes</span>
        <strong>{normalized.edges.length}</strong>
        <span>relationships</span>
      </div>
      <div className="graph-legend">
        {model.typeEntries.map((type, index) => (
          <span key={type} style={{ "--node-color": `var(--graph-${(index % 8) + 1})` }}>
            <i />
            {titleCase(type)}
          </span>
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding }) {
  return (
    <div className={`finding-card ${riskClass(finding.risk)}`}>
      <div className="finding-head">
        <span>{finding.id}</span>
        <strong>{finding.risk}</strong>
      </div>
      <h3>{finding.title}</h3>
      <p>{finding.detail}</p>
      <small>{finding.regulation}</small>
    </div>
  );
}


function cleanRootCauseRawValue(value) {
  return String(value || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(?:INFERRED DATA|DEMO DATA|NOT CONTROLLED EVIDENCE|REVIEW REQUIRED)\b/gi, " ")
    .replace(/\bREQUIRED\]/gi, " ")
    .replace(/\]/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRootCauseDisplayValue(value) {
  return formatValue(cleanRootCauseRawValue(value));
}

function hasUsefulKeyWhyChain(value) {
  const cleaned = cleanRootCauseRawValue(value);
  if (!cleaned || cleaned === "--") return false;
  if (/\bpage\s+\d+\b/i.test(cleaned)) return false;
  if (/\bconfidential\b/i.test(cleaned)) return false;
  if (/\bAI\s+draft\b/i.test(cleaned)) return false;
  return true;
}

function isNoiseRootCauseRow(row) {
  const hypothesis = cleanRootCauseRawValue(row?.hypothesis);
  const keyWhyChain = cleanRootCauseRawValue(row?.key_why_chain || row?.keyWhyChain);
  const combined = `${hypothesis} ${keyWhyChain}`;

  return /\b(evidence\s+balance|similar\s+incident|cross[-\s]?check|generated\s+by\s+docplus)\b/i.test(combined);
}

function prepareRootCauseRows(rows = []) {
  const seenIds = new Set();
  const inputRows = Array.isArray(rows) ? rows : [];
  const prepared = [];

  for (const row of inputRows) {
    const id = cleanRootCauseRawValue(row?.id).toUpperCase();
    const hypothesis = cleanRootCauseRawValue(row?.hypothesis);
    const probability = cleanRootCauseRawValue(row?.probability);
    const keyWhyChain = cleanRootCauseRawValue(row?.key_why_chain || row?.keyWhyChain);

    if (!id) continue;
    if (seenIds.has(id)) continue;
    if (!hypothesis) continue;
    if (!/\d+(?:\.\d+)?\s*%/.test(probability)) continue;
    if (!hasUsefulKeyWhyChain(keyWhyChain)) continue;
    if (isNoiseRootCauseRow({ hypothesis, key_why_chain: keyWhyChain })) continue;

    seenIds.add(id);
    prepared.push({
      id,
      hypothesis,
      probability,
      key_why_chain: keyWhyChain,
    });
  }

  return prepared;
}

function RootCauseTable({ rows = [], error = "", sectionText = "" }) {
  const safeRows = prepareRootCauseRows(rows);

  if (error) {
    return (
      <Card>
        <SectionTitle eyebrow="Extracted from PDF" title="Root Cause Analysis" />
        <EmptyState icon="plagiarism" title="Root cause extraction failed">
          {error}
        </EmptyState>
      </Card>
    );
  }

  if (!safeRows.length && !sectionText) {
    return (
      <Card>
        <SectionTitle eyebrow="Extracted from PDF" title="Root Cause Analysis" />
        <EmptyState icon="plagiarism" title="No complete root cause cards found">
          Run Complaint Investigation again. Cards are shown only when ID, Hypothesis, Probability, and Key Why Chain are all found.
        </EmptyState>
      </Card>
    );
  }

  if (!safeRows.length && sectionText) {
    return (
      <Card>
        <SectionTitle eyebrow="Extracted from PDF" title="Root Cause Analysis" />
        <EmptyState icon="plagiarism" title="No complete root cause cards found">
          The PDF was parsed, but no complete root cause row with ID, Hypothesis, Probability, and Key Why Chain was found.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card className="root-cause-panel">
      <SectionTitle eyebrow="Case Data" title="Root Cause Analysis">
      </SectionTitle>

      <div className="root-cause-card-grid">
        {safeRows.map((row, index) => {
          const id = cleanRootCauseDisplayValue(row.id);
          const hypothesis = cleanRootCauseDisplayValue(row.hypothesis);
          const probability = cleanRootCauseDisplayValue(row.probability);
          const keyWhyChain = cleanRootCauseDisplayValue(row.key_why_chain || row.keyWhyChain);

          return (
            <article className="root-cause-card" key={row.id || `root-cause-${index}`}>
              <div className="root-cause-card-head">
                <div>
                  <span>ID</span>
                  <strong>{id}</strong>
                </div>
                <div className="root-cause-probability">
                  <span>Probability</span>
                  <strong>{probability}</strong>
                </div>
              </div>

              <div className="root-cause-card-body">
                <div className="root-cause-field">
                  <span>Hypothesis</span>
                  <p>{hypothesis}</p>
                </div>

                <div className="root-cause-field">
                  <span>Key Why Chain</span>
                  <p>{keyWhyChain}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

function Shell({ children, activePage, setActivePage, theme, setTheme, apiBase, setApiBase, backendOk, investigationRunning }) {
  const activeItem = NAV_ITEMS.find((item) => item.id === activePage) || NAV_ITEMS[0];
  const brandLogo = theme === "dark" ? docPlusLogoDark : docPlusLogoLight;

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-slot">
            <img src={brandLogo} alt="DocPlus+ logo" />
          </div>
          <small>REGULATORY INTELLIGENCE, TRACED</small>
        </div>

        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? "active" : ""}
              onClick={() => setActivePage(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <StatusPill ok={backendOk} label={backendOk ? "Backend online" : "Waiting for backend"} />
          {investigationRunning ? <StatusPill ok={false} label="Investigation running..." /> : null}
          <label>
            API
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
          </label>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Hackathon command center</p>
            <h1>{activeItem.label}</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} />
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
          </div>
        </header>
        <div className="page-transition">
          <PageErrorBoundary resetKey={activePage}>{children}</PageErrorBoundary>
        </div>
      </main>
    </div>
  );
}

function Dashboard({ apiBase, deviceId, setDeviceId, setBackendOk, devices = [], lastReport }) {
  const [data, setData] = useState(() => readStorageJson(DASHBOARD_CACHE_KEY, DASHBOARD_INITIAL_DATA));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshState, setRefreshState] = useState(() => (readStorageJson(DASHBOARD_CACHE_KEY) ? "cached" : "initial"));
  const requestRef = useRef(0);
  const abortRef = useRef(null);



  async function loadDashboard() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError("");
    const encodedDevice = deviceId ? encodeURIComponent(deviceId) : "";
    const endpoints = {
      health: "/health",
      documents: "/documents/health",
      capabilities: "/agents/capabilities",
      debug: "/agents/debug/status",
      backend: "/graph/backend-status",
      ...(encodedDevice
        ? {
            score: `/graph/device/${encodedDevice}/score`,
            kpis: `/graph/device/${encodedDevice}/kpis`,
            freshness: `/graph/device/${encodedDevice}/evidence-freshness`,
          }
        : {}),
    };

    const entries = await Promise.allSettled(
      Object.entries(endpoints).map(async ([key, path]) => [key, await getJson(apiBase, path, { signal: controller.signal })]),
    );
    if (controller.signal.aborted) return;
    if (requestId !== requestRef.current) return;
    const next = {};
    const failed = [];
    entries.forEach((entry) => {
      if (entry.status === "fulfilled") next[entry.value[0]] = entry.value[1];
      else if (entry.reason?.name !== "AbortError") failed.push(entry.reason.message || String(entry.reason));
    });
    setData((current) => {
      const merged = { ...current, ...next };
      writeStorageJson(DASHBOARD_CACHE_KEY, merged);
      return merged;
    });
    const capabilityDevices = extractDevices(next.capabilities);
    if (!deviceId && capabilityDevices[0]?.id) setDeviceId(capabilityDevices[0].id);
    setBackendOk(Boolean(next.health || next.documents || next.debug));
    if (failed.length === Object.keys(endpoints).length) {
      setRefreshState("cached");
      setError("Using initial dashboard values while the backend is unreachable.");
    } else if (failed.length) {
      setRefreshState("partial");
      setError(`Some dashboard endpoints failed: ${failed.slice(0, 3).join("; ")}`);
    } else {
      setRefreshState("live");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadDashboard();
    return () => abortRef.current?.abort();
  }, [apiBase, deviceId]);

  const graphNodes = firstValue(data, [
    "health.nodes",
    "health.graph_nodes",
    "health.node_count",
    "health.graph.node_count",
    "documents.graph_nodes",
    "kpis.node_count",
  ]);
  const graphEdges = firstValue(data, [
    "health.edges",
    "health.graph_edges",
    "health.edge_count",
    "health.graph.edge_count",
    "documents.graph_edges",
    "kpis.edge_count",
  ]);
  const score = firstValue(data, ["score.score", "score.readiness_score", "kpis.audit_readiness_score"]);
  const stale = Array.isArray(data.freshness)
    ? data.freshness.length
    : firstValue(data, ["freshness.stale_count", "freshness.stale_links", "kpis.stale_test_count"]);
  const vectorStatus = firstValue(data, [
    "debug.vector.status",
    "debug.chroma.status",
    "documents.vector.status",
    "documents.vector.provider",
    "documents.vector.requested_backend",
    "capabilities.architecture.m4_retrieval_layer.provider",
  ]);
  const neo4jStatus = firstValue(data, [
    "backend.status",
    "backend.provider",
    "debug.neo4j.status",
    "health.architecture.m1_graph_layer.provider",
  ]);
  const langGraphStatus = firstValue(data, [
    "debug.langgraph.status",
    "debug.langgraph.enabled",
    "capabilities.architecture.m2_orchestration_layer.enabled",
  ]);
  const openAiStatus = firstValue(data, [
    "debug.openai.status",
    "debug.llm.status",
    "debug.openai.enabled",
    "capabilities.architecture.m2_reasoning_layer.enabled",
  ]);

  return (
    <div className="page-grid">
      <ErrorBanner message={error} />
      <section className="hero-band">
        <div>
          <p className="eyebrow">Before the regulator finds the gap, we already closed it.</p>
          <h2>The AI that thinks like the auditor you are afraid of.</h2>
          <p>
            A live traceability console for complaints, CAPA, audit readiness, digital twin evidence,
            cybersecurity, and report generation.
          </p>
          <div className="hero-actions">
            <label className="inline-field">
              Device
              <DeviceField value={deviceId} onChange={setDeviceId} devices={devices} />
            </label>
            <Button icon="refresh" onClick={loadDashboard} disabled={loading}>
              {loading ? "Refreshing" : "Refresh"}
            </Button>
            <StatusPill
              ok={refreshState === "live" || refreshState === "partial"}
              label={refreshState === "live" ? "Live data" : refreshState === "partial" ? "Partially refreshed" : refreshState === "cached" ? "Cached values" : "Initial values"}
            />
          </div>
        </div>
        <div className="hero-visual">
          <div className="pulse-core" />
          <Gauge value={score} label="Device Audit Readiness" />
        </div>
      </section>

      <div className="metrics-grid">
        <MetricCard icon="schema" label="Graph nodes" value={formatCompact(graphNodes)} detail={`${formatCompact(graphEdges)} edges`} />
        <MetricCard icon="verified" label="Audit score" value={hasValue(score) ? `${Math.round(numberLike(score))}/100` : "--"} detail="Device readiness" tone="green" />
        <MetricCard icon="link_off" label="Trace gaps" value={formatValue(stale)} detail="Stale or weak links" tone="red" />
        <MetricCard icon="database_search" label="Vector index" value={formatValue(titleCase(vectorStatus))} detail={`Neo4j ${formatValue(titleCase(neo4jStatus))}`} tone="blue" />
      </div>

      <AgentPerformanceGraph
        data={data}
        lastReport={lastReport}
        score={score}
        stale={stale}
        vectorStatus={vectorStatus}
        neo4jStatus={neo4jStatus}
        langGraphStatus={langGraphStatus}
        openAiStatus={openAiStatus}
      />
    </div>
  );
}

function ComplaintInvestigation({apiBase, lastReport, runInvestigation, investigationRunning, investigationError }) {
  const [form, setForm] = useState({
    complaint_text: localStorage.getItem(COMPLAINT_DRAFT_KEY) || "",
    include_audit_shadow: true,
    include_trace_decay: true,
    include_cybersecurity: true,
  });

  useEffect(() => {
    localStorage.setItem(COMPLAINT_DRAFT_KEY, form.complaint_text);
  }, [form.complaint_text]);

  async function submitComplaint(event) {
    event.preventDefault();
    await runInvestigation(form.complaint_text, {
      include_audit_shadow: form.include_audit_shadow,
      include_trace_decay: form.include_trace_decay,
      include_cybersecurity: form.include_cybersecurity,
    });
  }

  const loading = investigationRunning;
  const error = investigationError;
  const result = lastReport;
  const summary = result?.summary || {};
  const breakdown = summary.evidence_class_breakdown || {};
  const evidenceData = Object.keys(breakdown).length
    ? Object.entries(breakdown).map(([label, value]) => ({ label: titleCase(label), value }))
    : [];
  const confidencePercent = percentValue(summary.evidence_confidence_score);

  return (
    <div className="page-grid">
      <ErrorBanner message={error} />
      <WaitingProgress active={loading} label="Generating complaint investigation and CAPA report" />

      <div className="two-col wide-left">
        <Card>
          <SectionTitle eyebrow="Complaint to CAPA" title="Investigation intake">
            This calls the live M4 document endpoint. The backend resolves device, framework, AuditShadow, Trace Decay, and SBOM context.
          </SectionTitle>
          <form className="form-grid complaint-only-form" onSubmit={submitComplaint}>
            <label className="full">
              Complaint text
              <textarea
                value={form.complaint_text}
                onChange={(event) => setForm({ ...form, complaint_text: event.target.value })}
                placeholder="Example: screen is fully black, not giving any reading"
                required
              />
            </label>
            <div className="form-actions full">
              <Button icon="play_arrow" disabled={loading}>
                Run Investigation
              </Button>
            </div>
          </form>
        </Card>

        <div className="stack">
          <MetricCard
            icon="priority_high"
            label="Risk level"
            value={formatValue(summary.risk_level)}
            detail={`RPN ${formatValue(summary.rpn)}`}
            tone="red"
          />
          <MetricCard
            icon="approval"
            label="CAPA closure"
            value={formatValue(titleCase(summary.capa_closure_tier))}
            detail={formatValue(summary.capa_closure_status)}
            tone="green"
          />
          <MetricCard
            icon="psychology_alt"
            label="Evidence confidence"
            value={hasValue(confidencePercent) ? `${Math.round(confidencePercent)}%` : "--"}
            detail={formatValue(summary.evidence_confidence)}
            tone="blue"
          />
        </div>
      </div>

      {result ? (
        <>
          <div className="two-col">
            <Card>
              <SectionTitle eyebrow="Generated document" title={formatValue(result.document_id, "Complaint CAPA report")} />
              <div className="report-card">
                <Icon name="picture_as_pdf" />
                <div>
                  <strong>{formatValue(result.filename)}</strong>
                  <p>{formatValue(result.project_name || summary.project)}</p>
                  <small>{formatValue(result.generated_at)}</small>
                </div>
                {result.download_url ? (
                  <a className="btn btn-primary" href={joinUrl(apiBase, result.download_url)} target="_blank" rel="noreferrer">
                    <Icon name="download" />
                    <span>Download</span>
                  </a>
                ) : null}
              </div>
              <div className="summary-grid">
                {[
                  ["Device", summary.device_id],
                  ["Component", summary.affected_component],
                  ["Severity", summary.complaint_severity],
                  ["Reportable", hasValue(summary.reportable) ? String(summary.reportable) : ""],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{formatValue(value)}</strong>
                  </div>
                ))}
              </div>
            </Card>
            <BarChart title="Evidence Class Breakdown" data={evidenceData} />
          </div>
          <div className="two-col">
            <Card>
              <SectionTitle eyebrow="Audit and trace appendices" title="Live sources" />
              {asArray(result.live_sources).length ? (
                <div className="chip-list">
                  {asArray(result.live_sources).map((source) => <span key={String(source)}>{titleCase(source)}</span>)}
                </div>
              ) : (
                <EmptyState icon="source" title="No live sources returned">
                  The generated report response did not include source provenance.
                </EmptyState>
              )}
              <div className="finding-list compact">
                {extractFindings({ summary }).slice(0, 3).map((finding) => (
                  <FindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            </Card>
            <JsonPanel data={result} title="Backend response" />
          </div>
        </>
      ) : (
        <EmptyState icon="assignment" title="No report generated yet">
          Run the investigation to produce a CAPA-ready PDF, summary metadata, evidence classes, and source provenance.
        </EmptyState>
      )}
    </div>
  );
}

function DigitalTwin({ apiBase, deviceId }) {
  const [data, setData] = useState(null);
  const [score, setScore] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("empty");
  const requestRef = useRef(0);
  const abortRef = useRef(null);

  async function loadTwin(force = false) {
    if (!deviceId) {
      setData(null);
      setScore(null);
      setKpis(null);
      setError("No backend device is selected yet. Load capabilities or choose a device before opening the graph endpoints.");
      setLoading(false);
      return;
    }

    const cached = readStorageJson(TWIN_CACHE_KEY, {})?.[deviceId];
    if (cached && !force) {
      setData(cached.data || null);
      setScore(cached.score || null);
      setKpis(cached.kpis || null);
      setSource("cached");
      setError("");
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError("");

    try {
      const encodedDevice = encodeURIComponent(deviceId);
      const endpointEntries = [
        ["data", `/graph/device/${encodedDevice}/twin`],
        ["score", `/graph/device/${encodedDevice}/score`],
        ["kpis", `/graph/device/${encodedDevice}/kpis`],
      ];
      const responses = await Promise.allSettled(
        endpointEntries.map(async ([key, path]) => ({
          key,
          value: await getJson(apiBase, path, { signal: controller.signal }),
        })),
      );
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      const values = {};
      const failures = [];
      responses.forEach((response, index) => {
        if (response.status === "fulfilled") values[response.value.key] = response.value.value;
        else if (response.reason?.name !== "AbortError") failures.push(`${endpointEntries[index][0]}: ${response.reason.message || response.reason}`);
      });

      const hasAnyLivePayload = hasValue(values.data) || hasValue(values.score) || hasValue(values.kpis);
      if (hasAnyLivePayload) {
        const nextData = values.data ?? cached?.data ?? null;
        const nextScore = values.score ?? cached?.score ?? null;
        const nextKpis = values.kpis ?? cached?.kpis ?? null;
        setData(nextData);
        setScore(nextScore);
        setKpis(nextKpis);
        setSource(failures.length ? "partial" : "live");
        writeStorageJson(TWIN_CACHE_KEY, {
          ...readStorageJson(TWIN_CACHE_KEY, {}),
          [deviceId]: { data: nextData, score: nextScore, kpis: nextKpis },
        });
        if (failures.length) setError(`Some digital twin endpoints failed: ${failures.join("; ")}`);
      } else {
        throw new Error(failures.join("; ") || "Digital twin endpoints returned no payload.");
      }
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      setError(err.message);
      if (!cached) {
        setData(null);
        setScore(null);
        setKpis(null);
        setSource("empty");
      }
    } finally {
      if (!controller.signal.aborted && requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadTwin(false);
    return () => abortRef.current?.abort();
  }, [apiBase, deviceId]);

  const readiness = firstValue({ score, kpis }, ["score.score", "score.readiness_score", "kpis.audit_readiness_score"]);
  const kpiEntries = Object.entries(kpis || {}).filter(([, value]) => typeof value !== "object").slice(0, 6);

  return (
    <div className="page-grid">
      <ErrorBanner message={error} />
      <WaitingProgress active={loading} label="Loading digital twin graph" />
      <Card className="twin-graph-panel">
        <SectionTitle
          eyebrow="Digital twin"
          title={`${deviceId || "Backend device"} graph twin`}
          action={
            <div className="topbar-actions">
              <StatusPill
                ok={source === "live" || source === "partial" || source === "cached"}
                label={source === "live" ? "Live graph" : source === "partial" ? "Partially refreshed" : source === "cached" ? "Cached graph" : "Waiting for graph"}
              />
              <Button icon="refresh" onClick={() => loadTwin(true)}>{loading ? "Refreshing" : "Refresh"}</Button>
            </div>
          }
        >
          Neo4j Bloom-style traceability view for device, firmware, requirements, tests, risks, CAPAs, and SBOM.
        </SectionTitle>
        <GraphView graph={data} />
      </Card>
      <Card>
        <div className="twin-status-strip">
          <SectionTitle
            eyebrow="Twin status"
            title="Graph readiness"
          />
          <Gauge value={readiness} label="Score" />
          {kpiEntries.length ? (
            <div className="summary-grid">
              {kpiEntries.map(([key, value]) => (
                <div key={key}>
                  <span>{titleCase(key)}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="analytics" title="No KPI payload returned">
              Refresh after the backend returns device KPIs.
            </EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}

function AuditShadow({ lastReport, deviceId }) {
  const summary = lastReport?.summary || {};
  const rawRootCauseRows = lastReport?.extracted_from_pdf?.root_cause_table || [];
  const rootCauseRows = prepareRootCauseRows(rawRootCauseRows);
  const rootCauseText =
    lastReport?.extracted_from_pdf?.root_cause_text ||
    lastReport?.extracted_from_pdf?.root_cause_raw_section ||
    "";
  const rootCauseExtractionError = lastReport?.extracted_from_pdf?.extraction_error || "";
  const rootCauseCount = rootCauseRows.length || undefined;
  const readiness = percentValue(summary.evidence_confidence_score);
  const reportDeviceId = summary.device_id;
  const mismatchMessage =
    reportDeviceId && deviceId && reportDeviceId !== deviceId
      ? `Showing Root Cause Analysis for device ${reportDeviceId}, which differs from the currently selected device ${deviceId}. Run a new investigation for ${deviceId} to refresh this data.`
      : "";

  return (
    <div className="page-grid">
      <ErrorBanner message={mismatchMessage} />

      <section className="audit-runner">
        <div>
          <p className="eyebrow">From latest investigation</p>
          <h2>Root Cause Analysis from the complaint run.</h2>
          <p>
            This page shows Root Cause Analysis cards extracted from the generated investigation PDF.
          </p>

          <div className="summary-grid">
            <div>
              <span>Root cause rows</span>
              <strong>{formatValue(rootCauseCount)}</strong>
            </div>
            <div>
              <span>Framework</span>
              <strong>{formatValue(summary.regulatory_framework)}</strong>
            </div>
          </div>
        </div>

        <Gauge
          value={readiness}
          label={
            <span className="gauge-label">
              <span>Investigation Evidence</span>
              <span>Confidence</span>
            </span>
          }
        />
      </section>

      {!lastReport ? (
        <EmptyState icon="assignment" title="No investigation response yet">
          Run Complaint Investigation first. After the PDF is generated, this page will show the extracted Root Cause Analysis cards.
        </EmptyState>
      ) : (
        <RootCauseTable
          rows={rootCauseRows}
          error={rootCauseExtractionError}
          sectionText={rootCauseText}
        />
      )}
    </div>
  );
}

function Cybersecurity({ lastReport }) {
  const summary = lastReport?.summary || {};
  const findings = extractReportCyberFindings(lastReport);
  const components = extractReportSbomComponents(lastReport);
  const findingCount = reportCount(lastReport, ["summary.cybersecurity_findings", "cybersecurity_findings"]);
  const componentCount = reportCount(lastReport, ["summary.sbom_components", "sbom_components"]);

  return (
    <div className="page-grid">
      <div className="two-col">
        <Card>
          <SectionTitle eyebrow="From latest investigation" title="Cybersecurity summary">
            SBOM and CVE data are displayed from the Complaint Investigation response.
          </SectionTitle>
          <div className="summary-grid">
            <div>
              <span>Device</span>
              <strong>{formatValue(summary.device_id)}</strong>
            </div>
            <div>
              <span>SBOM components</span>
              <strong>{formatValue(componentCount ?? (components.length || undefined))}</strong>
            </div>
            <div>
              <span>Cyber findings</span>
              <strong>{formatValue(findingCount ?? (findings.length || undefined))}</strong>
            </div>
            <div>
              <span>Risk level</span>
              <strong>{formatValue(summary.risk_level)}</strong>
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle eyebrow="SBOM inventory" title="Components" />
          {!lastReport ? (
            <EmptyState icon="assignment" title="No investigation response yet">
              Run Complaint Investigation to fill Cybersecurity with backend response data.
            </EmptyState>
          ) : components.length ? (
            <div className="chip-list">
              {components.map((component) => (
                <span key={typeof component === "string" ? component : component.name || component.id}>
                  {typeof component === "string" ? component : component.name || component.id || "Component"}
                </span>
              ))}
            </div>
          ) : (
            <EmptyState icon="inventory_2" title="No SBOM components returned">
              The latest investigation returned an SBOM component count but no component rows.
            </EmptyState>
          )}
        </Card>
      </div>
      <Card>
        <SectionTitle eyebrow="CVE findings" title="Security risk board" />
        {findings.length ? (
          <div className="cve-grid">
            {findings.map((finding, index) => {
              const cvss = percentValue(finding.cvss || finding.cvss_score || finding.score);
              return (
                <div className={`cve-card ${riskClass(finding.severity || finding.risk_level)}`} key={finding.cve_id || index}>
                  <div>
                    <span>{formatValue(finding.component || finding.package)}</span>
                    <strong>{formatValue(finding.cve_id || finding.cve)}</strong>
                  </div>
                  {hasValue(cvss) ? (
                    <ProgressBar value={cvss * (cvss <= 10 ? 10 : 1)} label={`${formatValue(finding.severity || "Severity")} CVSS ${cvss}`} />
                  ) : null}
                  <p>{formatValue(finding.description || finding.reviewer_note || finding.summary, "No description returned")}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="security" title="No CVE findings returned">
            {lastReport ? "The latest investigation returned no detailed CVE rows." : "Run Complaint Investigation to populate the risk board."}
          </EmptyState>
        )}
      </Card>
      <JsonPanel data={lastReport} title="Latest investigation response" />
    </div>
  );
}

function Reports({ apiBase, lastReport }) {
  const summary = lastReport?.summary || {};
  const breakdown = summary.evidence_class_breakdown || {};
  const evidenceData = Object.keys(breakdown).length
    ? Object.entries(breakdown).map(([label, value]) => ({ label: titleCase(label), value }))
    : [];

  return (
    <div className="page-grid">
      <div className="two-col">
        <Card>
          <SectionTitle eyebrow="From latest investigation" title="Report center">
            Generated complaint CAPA PDFs and metadata from the backend investigation response.
          </SectionTitle>
          {lastReport ? (
            <div className="report-card">
              <Icon name="picture_as_pdf" />
              <div>
                <strong>{formatValue(lastReport.filename || lastReport.document_id)}</strong>
                <p>{formatValue(lastReport.project_name)}</p>
                <small>{formatValue(lastReport.generated_at)}</small>
              </div>
              {lastReport.download_url ? (
                <a className="btn btn-primary" href={joinUrl(apiBase, lastReport.download_url)} target="_blank" rel="noreferrer">
                  <Icon name="download" />
                  <span>Download</span>
                </a>
              ) : null}
            </div>
          ) : (
            <EmptyState icon="summarize" title="No session report yet">
              Generate one from Complaint Investigation and it will appear here.
            </EmptyState>
          )}
        </Card>
        <Card>
          <SectionTitle eyebrow="Executive summary" title="Investigation metadata" />
          {lastReport ? (
            <div className="summary-grid">
              {[
                ["Device", summary.device_id],
                ["Firmware", summary.current_firmware],
                ["Severity", summary.complaint_severity],
                ["Risk", summary.risk_level],
                ["RPN", summary.rpn],
                ["Reportable", hasValue(summary.reportable) ? String(summary.reportable) : ""],
                ["CAPA tier", titleCase(summary.capa_closure_tier)],
                ["Evidence", summary.evidence_confidence],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{formatValue(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="assignment" title="No report metadata yet">
              Run Complaint Investigation to populate the report summary.
            </EmptyState>
          )}
        </Card>
      </div>
      <div className="two-col">
        <Card>
          <SectionTitle eyebrow="Live sources" title="Backend provenance" />
          {asArray(lastReport?.live_sources).length ? (
            <div className="chip-list">
              {asArray(lastReport.live_sources).map((item, index) => (
                <span key={`${String(item)}-${index}`}>
                  {typeof item === "string" ? titleCase(item) : titleCase(item.name || item.path || `Source ${index + 1}`)}
                </span>
              ))}
            </div>
          ) : (
            <EmptyState icon="source" title="No source provenance returned">
              Run Complaint Investigation to populate source provenance.
            </EmptyState>
          )}
        </Card>
        <BarChart title="Evidence Class Breakdown" data={evidenceData} />
      </div>
      <JsonPanel data={lastReport} title="Latest investigation response" />
    </div>
  );
}



// ============ COMPONENT CODE STARTS HERE ============
 
const PERF_REPORT = {
  snapshot: [
    { label: "Graph Nodes", value: 870 },
    { label: "Graph Edges", value: 2925 },
    { label: "API Operations", value: 39 },
    { label: "M2 Completed Runs", value: 214 },
    { label: "Runtime Snapshots", value: 1563 },
    { label: "Agent Steps Captured", value: 403 },
    { label: "LLM Calls Captured", value: 183 },
    { label: "Generated PDFs", value: 15 },
    { label: "SBOM Components", value: 35 },
    { label: "CVE Findings", value: 7 },
  ],
  radar: {
    title: "MedTrace AI Capability Scorecard",
    labels: [
      "Innovation",
      "Technical Excellence",
      "Business Impact",
      "Evidence Grounding",
      "Workflow Automation",
      "Scalability",
      "Demo Readiness",
      "Regulatory Fit",
    ],
    values: [92, 88, 86, 91, 89, 84, 82, 90],
  },
  prototypeScale: {
    title: "Prototype Scale: Graph, Agents, Reports & Cybersecurity Coverage",
    data: [
      { label: "Graph Nodes", value: 870 },
      { label: "Graph Edges", value: 2925 },
      { label: "M2 Completed Runs", value: 214 },
      { label: "Agent Steps Captured", value: 403 },
      { label: "LLM Calls Captured", value: 183 },
      { label: "Generated PDFs", value: 15 },
      { label: "SBOM Components", value: 35 },
      { label: "CVE Findings", value: 7 },
      { label: "API Operations", value: 39 },
    ],
  },
  agentRuntime: {
    title: "Measured Average Agent Runtime by Workflow Step",
    unit: "sec",
    data: [
      { label: "Complaint Intake", value: 51.97 },
      { label: "Root Cause", value: 6.15 },
      { label: "Firmware Traceability", value: 1.72 },
      { label: "Evidence Retrieval", value: 2.36 },
      { label: "Risk Assessment", value: 0.21 },
      { label: "CAPA Draft", value: 2.68 },
      { label: "OpenAI Reasoning", value: 57.01 },
      { label: "AuditShadow", value: 52.4 },
      { label: "Cybersecurity Scan", value: 39.31 },
    ],
  },
  workflowSavings: {
    title: "Estimated Manual Workflow Time vs MedTrace AI Assisted Time (minutes)",
    data: [
      { label: "Complaint Triage", manual: 120, medtrace: 12 },
      { label: "Evidence Trace Review", manual: 180, medtrace: 15 },
      { label: "Root Cause Drafting", manual: 90, medtrace: 8 },
      { label: "Risk/RPN Prep", manual: 60, medtrace: 4 },
      { label: "CAPA Package", manual: 240, medtrace: 25 },
      { label: "Firmware Impact Review", manual: 90, medtrace: 8 },
      { label: "Audit Gap Check", manual: 180, medtrace: 10 },
      { label: "Report Assembly", manual: 300, medtrace: 5 },
    ],
  },
  businessImpactScores: {
    title: "Business Impact Score by Area",
    data: [
      { label: "Complaint Speed", value: 92 },
      { label: "Audit Visibility", value: 90 },
      { label: "CAPA Confidence", value: 86 },
      { label: "Firmware Risk Detection", value: 88 },
      { label: "Cybersecurity Visibility", value: 78 },
      { label: "Report Automation", value: 94 },
      { label: "Integration Readiness", value: 87 },
      { label: "Reviewer Support", value: 91 },
    ],
  },
  llmTokens: {
    title: "Average LLM Token Usage by Agent Task",
    data: [
      { label: "Complaint Intake", prompt: 2800.3, completion: 821.5 },
      { label: "Symptom Classification", prompt: 1342.5, completion: 520.5 },
      { label: "Root Cause", prompt: 5215.3, completion: 643.2 },
      { label: "Complaint Final Reasoning", prompt: 4746.6, completion: 3372.0 },
      { label: "Audit Final Reasoning", prompt: 5527.0, completion: 3054.0 },
    ],
  },
  cveSeverity: {
    title: "SBOM/NVD CVE Findings by Severity",
    data: [
      { label: "Critical", value: 0 },
      { label: "High", value: 2 },
      { label: "Medium", value: 5 },
      { label: "Low", value: 0 },
    ],
  },
  graphComposition: {
    title: "Knowledge Graph Node Composition",
    data: [
      { label: "Test", value: 130 },
      { label: "Requirement", value: 120 },
      { label: "Complaint", value: 115 },
      { label: "Risk", value: 110 },
      { label: "CAPA", value: 105 },
      { label: "RiskControl", value: 100 },
      { label: "SoftwareRequirement", value: 100 },
      { label: "TestRun", value: 100 },
      { label: "TestCase", value: 100 },
      { label: "Evidence", value: 34 },
      { label: "ReferenceKnowledge", value: 24 },
      { label: "SourceDocument", value: 16 },
    ],
  },
  judgeMetrics: [
    { claim: "Graph-backed regulatory intelligence", value: "870 nodes, 2,925 edges" },
    { claim: "Working API platform", value: "39 API operations" },
    { claim: "Real agent workflow history", value: "214 completed M2 runs" },
    { claim: "Runtime observability", value: "403 captured agent steps" },
    { claim: "LLM usage measured, not hidden", value: "183 captured LLM calls" },
    { claim: "Report generation works", value: "15 generated PDFs" },
    { claim: "Cybersecurity/SBOM coverage", value: "35 SBOM components, 7 CVE findings" },
    { claim: "Estimated manual workflow reduction", value: "89.6% to 98.3% depending on workflow" },
  ],
};
 
// Simple horizontal bar chart row set (mirrors the existing BarChart look/feel).
function PerfBarChart({ title, subtitle, data, unit = "", color = "gold" }) {
  const max = Math.max(1, ...data.map((item) => Number(item.value) || 0));
  return (
    <Card>
      <SectionTitle eyebrow="Static report data" title={title}>
        {subtitle}
      </SectionTitle>
      <div className="bar-chart">
        {data.map((item) => (
          <div className="bar-row" key={item.label}>
            <span>{item.label}</span>
            <div>
              <i
                className={`perf-bar-${color}`}
                style={{ width: `${(Number(item.value) / max) * 100}%` }}
              />
            </div>
            <strong>
              {item.value}
              {unit}
            </strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
 
// Two-series grouped bar chart (manual vs. medtrace, or prompt vs. completion tokens).
function PerfGroupedBarChart({ title, subtitle, data, seriesA, seriesB }) {
  const max = Math.max(1, ...data.flatMap((item) => [Number(item[seriesA.key]) || 0, Number(item[seriesB.key]) || 0]));
  return (
    <Card>
      <SectionTitle eyebrow="Static report data" title={title}>
        {subtitle}
      </SectionTitle>
      <div className="chip-list" style={{ marginBottom: "0.75rem" }}>
        <span className="perf-legend-a">{seriesA.label}</span>
        <span className="perf-legend-b">{seriesB.label}</span>
      </div>
      <div className="bar-chart">
        {data.map((item) => (
          <div key={item.label} style={{ marginBottom: "0.6rem" }}>
            <div className="bar-row">
              <span>{item.label}</span>
              <div>
                <i className="perf-bar-a" style={{ width: `${(Number(item[seriesA.key]) / max) * 100}%` }} />
              </div>
              <strong>{item[seriesA.key]}</strong>
            </div>
            <div className="bar-row">
              <span />
              <div>
                <i className="perf-bar-b" style={{ width: `${(Number(item[seriesB.key]) / max) * 100}%` }} />
              </div>
              <strong>{item[seriesB.key]}</strong>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
 
// SVG radar / spider chart for the capability scorecard.
function RadarChart({ title, labels, values, size = 320 }) {
  const center = size / 2;
  const radius = size * 0.36;
  const angleStep = (Math.PI * 2) / labels.length;
 
  const pointAt = (index, value) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };
 
  const polygonPoints = values.map((value, index) => pointAt(index, value).join(",")).join(" ");
  const rings = [25, 50, 75, 100];
 
  return (
    <Card>
      <SectionTitle eyebrow="Static report data" title={title}>
        Scale is 0 to 100 across eight capability dimensions.
      </SectionTitle>
      <div className="radar-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} className="radar-svg">
          {rings.map((ring) => (
            <polygon
              key={ring}
              points={labels.map((_, index) => pointAt(index, ring).join(",")).join(" ")}
              className="radar-ring"
            />
          ))}
          {labels.map((_, index) => {
            const [x, y] = pointAt(index, 100);
            return <line key={index} x1={center} y1={center} x2={x} y2={y} className="radar-axis" />;
          })}
          <polygon points={polygonPoints} className="radar-shape" />
          {values.map((value, index) => {
            const [x, y] = pointAt(index, value);
            return <circle key={index} cx={x} cy={y} r={4} className="radar-point" />;
          })}
          {labels.map((label, index) => {
            const [x, y] = pointAt(index, 116);
            return (
              <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label">
                {label}
              </text>
            );
          })}
        </svg>
        <div className="radar-score-list">
          {labels.map((label, index) => (
            <div key={label} className="radar-score-row">
              <span>{label}</span>
              <strong>{values[index]}</strong>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
 
function PerformanceAnalysis() {
  const r = PERF_REPORT;
  return (
    <div className="page-grid">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Static report · pitch deck ready</p>
          <h2>Performance and business impact, in one place.</h2>
          <p>
            Measured prototype telemetry (graph, agents, LLM calls, reports, cybersecurity) alongside
            modeled business-impact estimates for judge Q&amp;A and demo storytelling.
          </p>
        </div>
      </section>
 
      <div className="metrics-grid">
        {r.snapshot.slice(0, 4).map((metric) => (
          <MetricCard
            key={metric.label}
            icon="monitoring"
            label={metric.label}
            value={metric.value.toLocaleString()}
            detail="Measured prototype data"
          />
        ))}
      </div>
      <div className="metrics-grid">
        {r.snapshot.slice(4).map((metric) => (
          <MetricCard
            key={metric.label}
            icon="insights"
            label={metric.label}
            value={metric.value.toLocaleString()}
            detail="Measured prototype data"
            tone="blue"
          />
        ))}
      </div>
 
      <div className="two-col">
        <RadarChart title={r.radar.title} labels={r.radar.labels} values={r.radar.values} />
        <PerfBarChart
          title={r.prototypeScale.title}
          subtitle="How much the prototype already contains."
          data={r.prototypeScale.data}
          color="gold"
        />
      </div>
 
      <div className="two-col">
        <PerfBarChart
          title={r.agentRuntime.title}
          subtitle="Measured from deduped trace_ai.steps runtime records."
          data={r.agentRuntime.data}
          unit=" s"
          color="blue"
        />
        <PerfBarChart
          title={r.businessImpactScores.title}
          subtitle="Presentation scores based on current prototype capability and expected customer value."
          data={r.businessImpactScores.data}
          color="green"
        />
      </div>
 
      <PerfGroupedBarChart
        title={r.workflowSavings.title}
        subtitle="Static estimated values for business-impact storytelling."
        data={r.workflowSavings.data}
        seriesA={{ key: "manual", label: "Manual baseline" }}
        seriesB={{ key: "medtrace", label: "MedTrace AI target" }}
      />
 
      <PerfGroupedBarChart
        title={r.llmTokens.title}
        subtitle="Measured from deduped runtime trace_ai.llm_calls."
        data={r.llmTokens.data}
        seriesA={{ key: "prompt", label: "Avg prompt tokens" }}
        seriesB={{ key: "completion", label: "Avg completion tokens" }}
      />
 
      <div className="two-col">
        <PerfBarChart
          title={r.cveSeverity.title}
          subtitle="Measured from cybersecurity_scan_DEV-PULSE-OX.json."
          data={r.cveSeverity.data}
          color="red"
        />
        <PerfBarChart
          title={r.graphComposition.title}
          subtitle="Measured from local graph node labels."
          data={r.graphComposition.data}
          color="gold"
        />
      </div>
 
      <Card>
        <SectionTitle eyebrow="Slide-ready" title="Judge-Friendly Metrics Summary" />
        <div className="summary-grid">
          {r.judgeMetrics.map((row) => (
            <div key={row.claim}>
              <span>{row.claim}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}



// ============ COMPONENT CODE STARTS HERE ============
 
const TEAM_MEMBERS = [
  {
    name: "Hariharanvignesh K",
    hclRole: "Graduate Engineer Trainee",
    hackathonRole: "Agent Framework Lead",
    linkedin: "https://www.linkedin.com/in/hariharanvignesh2003/",
    initials: "HK",
  },
  {
    name: "Sivasankari G R",
    hclRole: "Graduate Engineer Trainee",
    hackathonRole: "Integration & Graph Lead",
    linkedin: "https://www.linkedin.com/in/sivasankarigr/",
    initials: "SG",
  },
  {
    name: "Deepika E",
    hclRole: "Graduate Engineer Trainee",
    hackathonRole: "Frontend & UX Lead",
    linkedin: "https://www.linkedin.com/in/deepika-eswaran/",
    initials: "DE",
  },
  {
    name: "Devadharshini T K",
    hclRole: "Graduate Engineer Trainee",
    hackathonRole: "Database Administrator",
    linkedin: "https://www.linkedin.com/in/devadharshinitk/",
    initials: "DT",
  },
];
 
function TeamMemberCard({ member, index }) {
  return (
    <div className="team-card-flip" style={{ "--flip-delay": `${index * 90}ms` }}>
      <div className="team-card-inner">
        <div className="team-card-face team-card-front">
          <div className="team-avatar">
            <span>{member.initials}</span>
          </div>
          <h3>{member.name}</h3>
          <p className="team-role-hackathon">{member.hackathonRole}</p>
          <span className="team-flip-hint">
            <Icon name="autorenew" />
            Hover for details
          </span>
        </div>
 
        <div className="team-card-face team-card-back">
          <Icon name="badge" className="team-back-icon" />
          <h3>{member.name}</h3>
          <div className="team-back-meta">
            <div>
              <span>HCL Role</span>
              <strong>{member.hclRole}</strong>
            </div>
            <div>
              <span>Hackathon Role</span>
              <strong>{member.hackathonRole}</strong>
            </div>
          </div>
          <a
            className="btn btn-primary team-linkedin-btn"
            href={member.linkedin}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="link" />
            <span>View LinkedIn</span>
          </a>
        </div>
      </div>
    </div>
  );
}
 
function AboutUs() {
  return (
    <div className="page-grid">
      <section className="hero-band">
        <div>
          <p className="eyebrow">The people behind MedTrace AI</p>
          <h2>Meet the team.</h2>
          <p>
            Four Graduate Engineer Trainees at HCL, building a proactive compliance intelligence
            platform for medical device manufacturers — end to end, in one hackathon.
          </p>
        </div>
      </section>
 
      <div className="team-card-grid">
        {TEAM_MEMBERS.map((member, index) => (
          <TeamMemberCard key={member.name} member={member} index={index} />
        ))}
      </div>
    </div>
  );
}
 

 
export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [theme, setTheme] = useState(() => localStorage.getItem("medtrace-theme") || "dark");
  const [apiBase, setApiBase] = useState(() => localStorage.getItem("medtrace-api-base") || DEFAULT_API_BASE);
  const [deviceId, setDeviceId] = useState("");
  const [capabilities, setCapabilities] = useState(null);
  const [backendOk, setBackendOk] = useState(false);
  const [investigationRunning, setInvestigationRunning] = useState(false);
  const [investigationError, setInvestigationError] = useState("");
  const [lastReport, setLastReportState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("medtrace-last-report") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    localStorage.setItem("medtrace-theme", theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("medtrace-api-base", apiBase);
  }, [apiBase]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadCapabilities() {
      try {
        const response = await getJson(apiBase, "/agents/capabilities", { signal: controller.signal });
        if (cancelled) return;
        setCapabilities(response);
        setBackendOk(true);
        const backendDevices = extractDevices(response);
        setDeviceId((current) => current || backendDevices[0]?.id || "");
      } catch (err) {
        if (cancelled) return;
        if (err.name === "AbortError") return;
        setCapabilities(null);
      }
    }

    loadCapabilities();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiBase]);

  const setLastReport = useCallback((report) => {
    setLastReportState(report);
    localStorage.setItem("medtrace-last-report", JSON.stringify(report));
  }, []);

  const runInvestigation = useCallback(async (complaintText, options = {}) => {
    setInvestigationRunning(true);
    setInvestigationError("");

    try {
      const body = cleanPayload({ complaint_text: complaintText, ...options });
      const response = await postJson(apiBase, "/documents/complaint-report", body);

      let rootCauseRows = [];
      let rootCauseText = "";
      let rootCauseRawSection = "";
      let pdfExtractionError = "";

      if (response?.download_url) {
        try {
          const pdfUrl = joinUrl(apiBase, response.download_url);
          const extracted = await extractRootCauseFromPdf(pdfUrl);

          rootCauseRows = extracted.rootCauseTable || [];
          rootCauseText = extracted.rootCauseText || "";
          rootCauseRawSection = extracted.rawRootCauseSection || "";
        } catch (pdfErr) {
          pdfExtractionError =
            pdfErr.message || "Could not extract Root Cause Analysis from the generated PDF.";
        }
      } else {
        pdfExtractionError = "Backend response did not include a PDF download URL.";
      }

      const enrichedResponse = {
        ...response,
        extracted_from_pdf: {
          ...(response.extracted_from_pdf || {}),
          root_cause_table: rootCauseRows,
          root_cause_text: rootCauseText,
          root_cause_raw_section: rootCauseRawSection,
          extraction_error: pdfExtractionError,
        },
      };

      setLastReport(enrichedResponse);

      if (response?.summary?.device_id) {
        setDeviceId(response.summary.device_id);
      }
    } catch (err) {
      setInvestigationError(err.message);
    } finally {
      setInvestigationRunning(false);
    }
  }, [apiBase, setLastReport]);

  const devices = useMemo(() => extractDevices(capabilities), [capabilities]);
  const frameworkOptions = useMemo(() => extractFrameworkOptions(capabilities), [capabilities]);

  const page = useMemo(() => {
    const props = {
      apiBase,
      deviceId,
      setDeviceId,
      setBackendOk,
      setLastReport,
      lastReport,
      capabilities,
      devices,
      frameworkOptions,
      runInvestigation,
      investigationRunning,
      investigationError,
    };
    switch (activePage) {
      case "dashboard":
        return <Dashboard {...props} />;
      case "complaint":
        return <ComplaintInvestigation {...props} />;
      case "twin":
        return <DigitalTwin {...props} />;
      case "audit":
        return <AuditShadow {...props} />;
      case "cybersecurity":
        return <Cybersecurity {...props} />;
      case "performance":
          return <PerformanceAnalysis {...props} />;
      case "reports":
        return <Reports {...props} />;
      case "about":
          return <AboutUs {...props} />;
      default:
        return <Dashboard {...props} />;
    }
  }, [activePage, apiBase, deviceId, lastReport, capabilities, devices, frameworkOptions, setLastReport, investigationRunning, investigationError, runInvestigation]);

  return (
    <Shell
      activePage={activePage}
      setActivePage={setActivePage}
      theme={theme}
      setTheme={setTheme}
      apiBase={apiBase}
      setApiBase={setApiBase}
      backendOk={backendOk}
      investigationRunning={investigationRunning}
    >
      {page}
    </Shell>
  );
}
