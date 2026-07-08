# MedTrace AI Complete Project Documentation

Date: 2026-07-08

Workspace: `C:\Users\harih\Downloads\fron\fron`

This document is the consolidated project handoff for the current MedTrace AI frontend workspace. It captures the current architecture, runtime behavior, page-by-page implementation, backend endpoints consumed by the frontend, state and cache rules, setup commands, verification notes, and known caveats.

## 1. Project Summary

MedTrace AI is an audit-readiness frontend for a FastAPI backend. The app presents a command-center style interface for medical device traceability, complaint investigation, digital twin graph visualization, Audit Shadow output, cybersecurity findings, and generated complaint/CAPA reports.

The current workspace contains the frontend application. The backend is expected to run separately at `http://127.0.0.1:8000` unless overridden by environment configuration.

The app is built with:

- React 19.
- Vite 6.
- CSS in `src/styles.css`.
- Neo4j NVL React wrapper for the Digital Twin graph.
- Material Symbols via Google Fonts for icons.

## 2. Current Repository Layout

```text
C:\Users\harih\Downloads\fron\fron
  .agents/
  .git/
  .pnpm-store/
  dist/
  node_modules/
  src/
    api.js
    App.jsx
    LineSidebar.jsx
    main.jsx
    styles.css
  .env
  .gitignore
  FRONTEND_HANDOFF.md
  index.html
  new_tst.txt
  package-lock.json
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  postcss.config.js
  README.md
  tailwind.config.js
  vite.config.js
  vite-dev.err.log
  vite-dev.log
```

Important notes:

- `src/App.jsx` is the main application file. It contains routing, page components, UI primitives, backend normalization helpers, state flow, local cache flow, and graph rendering.
- `src/api.js` contains shared API helpers.
- `src/styles.css` contains nearly all visual design and responsive behavior.
- `src/main.jsx` mounts React into `#root`.
- `src/LineSidebar.jsx` is currently empty and not imported.
- `dist/` contains the last production build output.
- `node_modules/` and `.pnpm-store/` are local dependency artifacts.

## 3. Package Metadata

`package.json`:

```json
{
  "name": "medtrace-ai-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "@neo4j-nvl/react": "^1.2.0",
    "@vitejs/plugin-react": "^4.3.4",
    "gsap": "^3.15.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vite": "^6.0.7"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17"
  }
}
```

Dependency notes:

- `@neo4j-nvl/react` is actively used by `GraphView` through `InteractiveNvlWrapper`.
- `gsap` is installed but is not currently referenced in `src`.
- `@vitejs/plugin-react`, `vite`, `react`, and `react-dom` are active runtime/build dependencies.
- `tailwindcss`, `postcss`, and `autoprefixer` are configured, but the application also relies heavily on hand-written CSS.

Package manager notes:

- The project now has both `package-lock.json` and `pnpm-lock.yaml`.
- `@neo4j-nvl/react` was installed through `corepack pnpm`, so `pnpm-lock.yaml` records the newer graph dependency tree.
- `pnpm-workspace.yaml` contains:

```yaml
packages:
  - .

onlyBuiltDependencies:
  - esbuild
```

- The local system `npm` shim was observed to be broken in this environment because it points to a missing `npm-cli.js`. Builds were verified using the bundled Codex Node runtime.

## 4. Environment Configuration

`.env`:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

The frontend default backend URL is defined in `src/api.js`:

```js
export const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
```

The app also lets the user edit the API base URL from the sidebar. That value is persisted to local storage under `medtrace-api-base`.

## 5. Development And Build Commands

Run frontend development server:

```powershell
npm.cmd run dev
```

Because the local `npm` shim has been unreliable on this machine, the verified build command used during implementation was:

```powershell
& "C:\Users\harih\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" node_modules\vite\bin\vite.js build
```

Expected frontend dev URL:

```text
http://127.0.0.1:5173/
```

If port `5173` is already used, Vite may choose another port such as:

```text
http://127.0.0.1:5174/
```

Preview production build:

```powershell
npm.cmd run preview
```

Expected backend startup from existing README:

```powershell
cd "D:\vs code\medTraceAi"
.\.venv\Scripts\Activate.ps1
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## 6. HTML Entry Point

`index.html`:

- Mounts React into `<div id="root"></div>`.
- Loads `src/main.jsx`.
- Sets title to `MedTrace AI`.
- Loads Google Fonts:
  - Inter.
  - Material Symbols Outlined.
- Sets viewport for responsive behavior.
- Sets browser theme color to `#071018`.

## 7. React Entry Point

`src/main.jsx`:

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

The app runs under React Strict Mode.

## 8. API Helper Layer

File: `src/api.js`

Exports:

- `DEFAULT_API_BASE`
- `joinUrl(baseUrl, path)`
- `apiRequest(baseUrl, path, options = {})`
- `getJson(baseUrl, path, options = {})`
- `postJson(baseUrl, path, body, options = {})`
- `deleteJson(baseUrl, path, options = {})`

Behavior:

- `joinUrl` accepts absolute URLs and relative backend paths.
- `apiRequest` uses `fetch`.
- JSON body payloads are serialized automatically unless the body is already a string or `FormData`.
- Non-OK responses attempt to parse JSON error details first, then fall back to text.
- If `options.raw` is true, `apiRequest` returns the raw `Response`.
- JSON responses are parsed when `content-type` includes `application/json`.
- Other responses return text.
- API helpers accept fetch options such as `signal`.
- There are no frontend API timeout timers.

## 9. Navigation Model

Navigation is defined by `NAV_ITEMS` in `src/App.jsx`:

```js
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "complaint", label: "Complaint Investigation", icon: "clinical_notes" },
  { id: "twin", label: "Digital Twin", icon: "hub" },
  { id: "traceability", label: "Traceability", icon: "fact_check" },
  { id: "audit", label: "Audit Shadow", icon: "visibility" },
  { id: "cybersecurity", label: "Cybersecurity", icon: "security" },
  { id: "reports", label: "Reports", icon: "summarize" },
];
```

Removed page:

- Graph Explorer was removed from navigation and routing.

Routing implementation:

- The active page is stored as `activePage` in `App`.
- A `useMemo` switch renders the active page component.
- Shared props are passed to pages through a `props` object.

Pages:

- `Dashboard`
- `ComplaintInvestigation`
- `DigitalTwin`
- `Traceability`
- `AuditShadow`
- `Cybersecurity`
- `Reports`

## 10. Global App State

Main state in `App`:

- `activePage`
- `theme`
- `apiBase`
- `deviceId`
- `capabilities`
- `backendOk`
- `investigationRunning`
- `investigationError`
- `lastReport`

Persisted state:

- Theme is stored in `medtrace-theme`.
- API base URL is stored in `medtrace-api-base`.
- Last complaint investigation report is stored in `medtrace-last-report`.

Important state rules:

- `lastReport` is the only shared source for Complaint Investigation result data.
- Audit Shadow, Cybersecurity, and Reports read from `lastReport`.
- Dashboard and Digital Twin remain independent from complaint report state.
- Traceability is device-level graph state, not complaint-scoped report state.
- A new complaint investigation invalidates traceability cache for that report device.

## 11. Local Storage Keys

Defined cache/storage keys:

| Key | Owner | Purpose |
|---|---|---|
| `medtrace-dashboard-cache` | Dashboard | Stores latest dashboard merged payload. |
| `medtrace-complaint-draft` | Complaint Investigation | Stores draft complaint text. |
| `medtrace-twin-cache` | Digital Twin | Stores graph, score, and KPI payloads by device. |
| `medtrace-traceability-cache` | Traceability | Stores matrix, freshness, orphan, and CAPA-context payloads by device. |
| `medtrace-theme` | App | Stores light/dark theme. |
| `medtrace-api-base` | App/Shell | Stores editable backend API base URL. |
| `medtrace-last-report` | App | Stores latest complaint investigation response. |

Storage helpers:

- `readStorageJson(key, fallback = null)`
- `writeStorageJson(key, value)`

Storage helper behavior:

- JSON parse errors fall back safely.
- Storage quota/private mode write errors are ignored.

## 12. Important Helper Functions

General formatting:

- `valueAt(source, path)`
- `firstValue(source, paths, fallback)`
- `asArray(value)`
- `numberLike(value, fallback)`
- `hasValue(value)`
- `formatValue(value, empty)`
- `formatCompact(value)`
- `compactNumber(value)`
- `titleCase(value)`
- `riskClass(value)`
- `percentValue(value)`
- `scoreFromStatus(value)`

Backend payload normalization:

- `extractDevices(payload)`
- `extractFrameworkOptions(payload)`
- `cleanPayload(payload)`
- `normalizeGraph(payload)`
- `extractFindings(payload)`
- `extractReportAuditFindings(report)`
- `extractReportCyberFindings(report)`
- `extractReportSbomComponents(report)`
- `reportCount(report, paths)`
- `extractTraceabilityRows(matrixPayload, capaContext, freshnessPayload)`

UI primitives:

- `Icon`
- `Button`
- `Card`
- `SectionTitle`
- `StatusPill`
- `MetricCard`
- `ProgressBar`
- `WaitingProgress`
- `JsonPanel`
- `ErrorBanner`
- `EmptyState`
- `PageErrorBoundary`
- `DeviceField`
- `FrameworkField`
- `Gauge`
- `Heatmap`
- `BarChart`
- `MiniTrend`
- `GraphView`
- `FindingCard`
- `Shell`

## 13. Payload Normalization Details

### Devices

`extractDevices(payload)` reads:

- `payload.devices`
- `payload.available_devices`
- `payload.data.devices`

It supports string devices and object devices. It normalizes:

- `id`
- `name`
- `current_firmware`
- `raw`

### Graph

`normalizeGraph(payload)` supports graph payloads from:

- `payload.graph`
- `payload.payload`
- `payload.data`
- direct payload

Node fields recognized:

- `id`
- `node_id`
- `key`
- `properties.id`
- `label`
- `name`
- `title`
- `properties.name`
- `properties.title`
- `type`
- `kind`
- `category`
- first value of `labels`
- `properties.type`
- score/readiness/confidence variants

Edge fields recognized:

- `id`
- `source`
- `from`
- `start`
- `start_node`
- `source_id`
- `target`
- `to`
- `end`
- `end_node`
- `target_id`
- `label`
- `type`
- `relationship`

Edges without source or target are filtered out.

### Findings

`extractFindings(payload)` searches:

- `payload.audit_findings`
- `payload.findings`
- `payload.state.audit_findings`
- `payload.final_state.audit_findings`
- `payload.summary.audit_findings`
- `payload.results`

It normalizes:

- `id`
- `risk`
- `title`
- `detail`
- `regulation`
- `raw`

### Audit Shadow Report Findings

`extractReportAuditFindings(report)` reads:

- `report.audit_findings`
- `report.audit_shadow.findings`
- `report.audit_shadow.audit_findings`
- `report.summary.audit_shadow.findings`
- `report.summary.audit_findings_detail`

### Cybersecurity Findings

`extractReportCyberFindings(report)` reads:

- `report.cybersecurity_findings`
- `report.cybersecurity.findings`
- `report.summary.cybersecurity.findings`
- `report.summary.cybersecurity_findings_detail`
- `report.summary.cves`

### SBOM Components

`extractReportSbomComponents(report)` reads:

- `report.sbom_components`
- `report.cybersecurity.sbom_components`
- `report.summary.cybersecurity.sbom_components`
- `report.summary.sbom_components_detail`
- `report.summary.components`

### Traceability Rows

`extractTraceabilityRows(matrixPayload, capaContext, freshnessPayload)` supports:

- Top-level array matrix payloads.
- Object-wrapped matrix rows under `matrix`, `requirements`, `rows`, or `data`.
- Fallback to CAPA-context requirements.
- Fallback to evidence freshness rows.

This fixed the earlier issue where Traceability showed no rows when the backend returned a top-level array.

## 14. Shell Layout

`Shell` contains:

- Sidebar brand area.
- Sidebar navigation.
- Backend status pill.
- Persistent investigation-running status pill.
- API base URL input.
- Topbar with current page title.
- Theme toggle.
- Page content wrapped in `PageErrorBoundary`.

Persistent sidebar indicators:

- `Backend online` or `Waiting for backend`.
- `Investigation running...` while a complaint report request is active.

Theme:

- Light and dark modes are controlled by `data-theme` and `document.documentElement.classList`.
- User selection is stored in `medtrace-theme`.

## 15. Dashboard Page

Component: `Dashboard`

Purpose:

- Immediate operational overview.
- Device-level graph/readiness metrics.
- Backend health/status summary.

Initial data:

- Dashboard renders immediately using `DASHBOARD_INITIAL_DATA`.
- Current initial values include:
  - `nodes: 870`
  - `edges: 2981`
  - score `82.5`
  - stale evidence examples.

Cache:

- Uses `medtrace-dashboard-cache`.
- Initializes from cache when available.
- Background refresh merges successful endpoint payloads over current cache/initial data.

Refresh state labels:

- `Live data`
- `Partially refreshed`
- `Cached values`
- `Initial values`

Endpoints:

- `GET /health`
- `GET /documents/health`
- `GET /agents/capabilities`
- `GET /agents/debug/status`
- `GET /graph/backend-status`
- `GET /graph/device/{device_id}/score`
- `GET /graph/device/{device_id}/kpis`
- `GET /graph/device/{device_id}/evidence-freshness`

Dashboard metrics:

- Graph nodes.
- Graph edges.
- Audit score metric card.
- Trace gaps.
- Vector index.
- Backend signal.
- Requirement score trace.
- System list for FastAPI, Neo4j, Chroma, and LangGraph.

Important label clarification:

- Dashboard hero gauge label is `Device Audit Readiness`.
- This is device-level graph readiness from `/graph/device/{device_id}/score` or related KPI fallback.
- It is not the same metric as the Audit Shadow investigation evidence-confidence gauge.

## 16. Complaint Investigation Page

Component: `ComplaintInvestigation`

Purpose:

- User enters complaint text.
- App calls backend document/report endpoint.
- Response becomes the shared `lastReport`.

Visible user input:

- Complaint text textarea only.

Placeholder:

```text
Example: screen is fully black, not giving any reading
```

Removed inputs:

- Device ID.
- Firmware.
- Serial number.
- Lot.
- Framework selector.
- New firmware.
- Changed components.
- AuditShadow checkbox.
- Trace Decay checkbox.
- Cybersecurity checkbox.
- Fresh NVD scan checkbox.

Backend request:

- `POST /documents/complaint-report`

Request body currently includes:

- `complaint_text`
- `include_audit_shadow`
- `include_trace_decay`
- `include_cybersecurity`

The include flags are kept in internal form state and sent to the backend, but they are no longer exposed as visible checkboxes.

App-level investigation state:

- `investigationRunning`
- `investigationError`
- `runInvestigation(complaintText, options)`

Reason for app-level state:

- Page navigation unmounts the active page component.
- If request state lived only inside `ComplaintInvestigation`, switching pages would hide the running state.
- Now Shell shows `Investigation running...` across all pages.

On successful response:

- `setLastReport(response)` stores report in React state and local storage.
- If `response.summary.device_id` exists, selected `deviceId` is updated.
- Traceability cache for that report device is invalidated.

Complaint page displays:

- Generated document card.
- PDF download link when `download_url` exists.
- Risk level.
- CAPA closure.
- Evidence confidence.
- Evidence class breakdown.
- Live sources.
- Backend response JSON panel.

## 17. Digital Twin Page

Component: `DigitalTwin`

Purpose:

- Neo4j Bloom-style graph view for device traceability.
- Displays graph twin, readiness, and KPIs.

Graph renderer:

- Uses `@neo4j-nvl/react`.
- Uses `InteractiveNvlWrapper`.
- Supports click selection, dragging, pan, and zoom.
- Graph telemetry is disabled via NVL options.

Cache:

- Uses `medtrace-twin-cache`.
- Cache is keyed by device ID.
- Page visit/device change uses cached data when available.
- Backend calls occur:
  - on first view for uncached device.
  - when user clicks Refresh.

Endpoints during live refresh:

- `GET /graph/device/{device_id}/twin`
- `GET /graph/device/{device_id}/score`
- `GET /graph/device/{device_id}/kpis`

Source status labels:

- `Live graph`
- `Partially refreshed`
- `Cached graph`
- `Waiting for graph`

Removed from Digital Twin:

- Risk Control Verification Matrix.
- Twin Risk Surface heatmap.

Graph constraints:

- Visible node cap is implemented in `GraphView`.
- Visible relationship cap is implemented in `GraphView`.
- Counts overlay shows total normalized node and relationship counts from backend payload.

Known performance caveat:

- NVL force-directed layout can take a few seconds when the component remounts.
- This is layout recomputation, not a data fetch issue when cache is present.
- Future optimization options:
  - reduce visible node/relationship caps.
  - keep pages mounted and toggle visibility instead of unmounting on navigation.

## 18. GraphView Implementation

Component: `GraphView`

Purpose:

- Normalize backend graph payloads for NVL.
- Render graph in Digital Twin page.

Internal state:

- `clickedNodeId`
- `graphError`

Rendering behavior:

- If no graph nodes are available, shows an empty graph state.
- If NVL initialization fails, shows `Graph renderer unavailable`.
- Converts nodes into NVL shape:
  - `id`
  - `caption`
  - `captions`
  - `color`
  - `size`
  - `selected`
  - `rawNode`
  - optional pinned device node position
- Converts relationships into NVL shape:
  - `id`
  - `from`
  - `to`
  - `type`
  - `caption`
  - `color`
  - `width`

Node palette:

- Green.
- Gold.
- Blue.
- Orange.
- Purple.
- Teal.
- Red.
- Lime.

## 19. Traceability Page

Component: `Traceability`

Purpose:

- Device-level requirement coverage and traceability integrity.
- Shows requirement rows, evidence rows, stale links, orphan nodes, raw graph payload.

Cache:

- Uses `medtrace-traceability-cache`.
- Cache is keyed by device ID.
- Page visit/device change uses cached data when available.
- Backend calls occur:
  - on first view for uncached device.
  - after complaint investigation invalidates cache for that device.
  - when user clicks Refresh.

Endpoints:

- `GET /graph/requirements/matrix/{device_id}`
- `GET /graph/device/{device_id}/evidence-freshness`
- `GET /graph/traceability/orphans`
- `GET /graph/device/{device_id}/capa-context`

Source status labels:

- `Live data`
- `Partially refreshed`
- `Cached values`
- `Waiting for data`

Failure behavior:

- Uses `Promise.allSettled`.
- Individual endpoint failures are captured in `endpointErrors`.
- Error banner includes per-endpoint failure details.
- If every endpoint rejects, page also sets a broader traceability error.

Device mismatch warning:

- If selected `deviceId` does not appear in `/agents/capabilities`, page shows a warning.

Removed from Traceability:

- Firmware What-If card.
- Ripple Propagation UI.
- `POST /graph/whatif/firmware-change` action.

Traceability display:

- Requirement coverage heatmap.
- Requirement traceability data table.
- Data quality card with stale links and orphan nodes.
- Raw payload JSON panel.

## 20. Audit Shadow Page

Component: `AuditShadow`

Purpose:

- Display Audit Shadow findings from the latest complaint investigation response.

Data source:

- `lastReport`
- No independent Audit Shadow backend call.
- No mock audit endpoint.

Removed from Audit Shadow:

- Run Mock Audit button.
- Framework selector.

Metric clarification:

- Gauge label is `Investigation Evidence Confidence`.
- Gauge value is `percentValue(summary.evidence_confidence_score)`.
- This is a complaint investigation evidence-confidence proxy.
- It is not the Dashboard device-level audit readiness score.

Device mismatch banner:

- `AuditShadow` receives selected `deviceId`.
- It compares `lastReport.summary.device_id` with the selected `deviceId`.
- If they differ, it shows:

```text
Showing AuditShadow results for device {reportDeviceId}, which differs from the currently selected device {deviceId}. Run a new investigation for {deviceId} to refresh this data.
```

Displayed content:

- Findings count.
- Framework.
- Gauge.
- Finding cards when detailed rows exist.
- Empty state when no investigation response exists.
- Empty state when no detailed findings are returned.
- Raw latest investigation response JSON panel.

## 21. Cybersecurity Page

Component: `Cybersecurity`

Purpose:

- Display SBOM and CVE/security findings from the latest complaint investigation response.

Data source:

- `lastReport`
- No independent scan request.
- No standalone SBOM scan form.

Removed from Cybersecurity:

- Run Scan button.
- Device ID selector.
- SBOM path input.
- Max components input.
- CVEs per component input.
- Force fresh NVD scan checkbox.

Displayed content:

- Device.
- SBOM component count.
- Cyber findings count.
- Risk level.
- Components chip list.
- CVE findings/security risk board.
- Raw latest investigation response JSON panel.

Data extraction:

- Uses `extractReportCyberFindings`.
- Uses `extractReportSbomComponents`.

## 22. Reports Page

Component: `Reports`

Purpose:

- Present generated complaint/CAPA report metadata and download link from latest investigation.

Data source:

- `lastReport`
- No independent document capabilities call.

Removed from Reports:

- Document Service Capabilities panel.
- Document endpoint contract panels from primary UI.

Displayed content:

- PDF filename or document ID.
- Project name.
- Generated timestamp.
- Download link if `download_url` exists.
- Executive summary metadata:
  - Device.
  - Firmware.
  - Severity.
  - Risk.
  - RPN.
  - Reportable.
  - CAPA tier.
  - Evidence.
- Live source provenance.
- Evidence class breakdown.
- Raw latest investigation response JSON panel.

## 23. Backend Endpoint Inventory Used By Frontend

Health and backend status:

- `GET /health`
- `GET /documents/health`
- `GET /agents/debug/status`
- `GET /graph/backend-status`

Capabilities:

- `GET /agents/capabilities`

Dashboard device graph and readiness:

- `GET /graph/device/{device_id}/score`
- `GET /graph/device/{device_id}/kpis`
- `GET /graph/device/{device_id}/evidence-freshness`

Complaint investigation/report generation:

- `POST /documents/complaint-report`

Digital Twin:

- `GET /graph/device/{device_id}/twin`
- `GET /graph/device/{device_id}/score`
- `GET /graph/device/{device_id}/kpis`

Traceability:

- `GET /graph/requirements/matrix/{device_id}`
- `GET /graph/device/{device_id}/evidence-freshness`
- `GET /graph/traceability/orphans`
- `GET /graph/device/{device_id}/capa-context`

Download links:

- Report download uses `joinUrl(apiBase, lastReport.download_url)` when backend returns `download_url`.

Removed/not currently called:

- Graph Explorer page endpoints.
- Mock Audit endpoint.
- Standalone cybersecurity scan endpoint.
- Document capabilities UI endpoints.
- `POST /graph/whatif/firmware-change`.

## 24. Data Flow By User Scenario

### Opening the app

1. `App` initializes theme and API base from local storage.
2. `App` initializes `lastReport` from local storage.
3. `App` calls `/agents/capabilities`.
4. If devices are returned, first backend device becomes selected when no device is already selected.
5. `Dashboard` renders initial/cache values immediately.
6. `Dashboard` refreshes backend data in the background.

### Running complaint investigation

1. User opens Complaint Investigation.
2. User enters complaint text.
3. User clicks Run Investigation.
4. `runInvestigation` in `App` starts.
5. `Shell` shows `Investigation running...`.
6. Frontend posts to `/documents/complaint-report`.
7. On success:
   - `lastReport` updates.
   - `medtrace-last-report` updates.
   - selected `deviceId` updates if response has `summary.device_id`.
   - traceability cache for that report device is invalidated.
8. Audit Shadow, Cybersecurity, and Reports immediately read from updated `lastReport`.

### Opening Digital Twin

1. If selected device has cached twin data, display cache and do not call backend.
2. If selected device has no cached twin data, fetch twin, score, and KPI payloads.
3. User can force refresh with Refresh.
4. Graph displays through Neo4j NVL.

### Opening Traceability

1. If selected device has cached traceability data, display cache and do not call backend.
2. If no cache exists, fetch matrix, freshness, orphans, and CAPA context.
3. If a complaint report invalidated the device cache, next visit fetches fresh data.
4. User can force refresh with Refresh.

### Opening Audit Shadow

1. Page reads latest `lastReport`.
2. If no report exists, show empty state.
3. If report device differs from selected device, show mismatch warning.
4. Gauge shows investigation evidence confidence.
5. Findings render from detailed audit finding fields if present.

### Opening Cybersecurity

1. Page reads latest `lastReport`.
2. If no report exists, show empty state.
3. If components/findings are present, display them.
4. Otherwise show an empty state explaining no detailed rows were returned.

### Opening Reports

1. Page reads latest `lastReport`.
2. If no report exists, show empty state.
3. If report exists, show PDF/report metadata, download URL, executive summary, provenance, and raw JSON.

## 25. Error Handling And Request Guards

Implemented protections:

- `AbortController` on Dashboard refreshes.
- `AbortController` on Digital Twin refreshes.
- `AbortController` on Traceability refreshes.
- `AbortController` on capabilities loading.
- Request ID guards on Dashboard, Digital Twin, and Traceability.
- `Promise.allSettled` for multi-endpoint dashboard/twin/traceability calls.
- `PageErrorBoundary` wraps page content.
- API helper extracts backend error details.
- Local storage parse/write failures are handled safely.

No frontend API timeout:

- The app intentionally does not impose request timeout timers.
- Requests can run as long as backend/browser fetch allows.
- Abort is only used for stale UI requests when device/API/page refresh changes.

## 26. Metric Definitions And Clarifications

Dashboard:

- Gauge label: `Device Audit Readiness`.
- Source: device graph score endpoints.
- Primary lookup:
  - `score.score`
  - `score.readiness_score`
  - `kpis.audit_readiness_score`
- Meaning: device-level graph readiness/audit readiness for the currently selected device.

Audit Shadow:

- Gauge label: `Investigation Evidence Confidence`.
- Source:
  - `lastReport.summary.evidence_confidence_score`
- Meaning: evidence confidence from the latest complaint investigation report.
- Can refer to a different device than currently selected on Dashboard.
- Mismatch banner warns when this happens.

Complaint Investigation:

- Evidence confidence metric card also uses `summary.evidence_confidence_score`.

Traceability:

- Heatmap values come from normalized traceability rows.
- Scores come from explicit score/readiness/coverage fields or inferred status mapping.

## 27. Styling And UI System

Main styling file:

- `src/styles.css`

Design themes:

- Light theme variables under `:root`.
- Dark theme variables under `:root[data-theme="dark"]`.

Primary color tokens:

- Backgrounds: `--bg`, `--bg-soft`.
- Panels: `--panel`, `--panel-strong`.
- Text: `--text`, `--muted`.
- Lines: `--line`.
- Accents: `--gold`, `--green`, `--pulse`, `--blue`, `--red`.
- Graph colors: `--graph-1` through `--graph-8`.

Major layout classes:

- `.app-shell`
- `.sidebar`
- `.sidebar-footer`
- `.main`
- `.topbar`
- `.page-grid`
- `.hero-band`
- `.panel`
- `.metrics-grid`
- `.two-col`
- `.wide-left`
- `.stack`

Graph classes:

- `.graph-view`
- `.bloom-graph`
- `.nvl-graph-frame`
- `.graph-overlay`
- `.graph-legend`

State/feedback classes:

- `.status-pill`
- `.status-dot`
- `.error-banner`
- `.waiting-panel`
- `.empty-state`
- `.progress-wrap`
- `.progress-track`
- `.progress-fill`

Responsive behavior:

- Breakpoints at max widths around:
  - `1180px`
  - `860px`
  - `560px`
- Reduced motion support through `@media (prefers-reduced-motion: reduce)`.

## 28. Accessibility And UX Notes

Current strengths:

- Buttons use text plus Material Symbols icons.
- Theme toggle has `aria-label`.
- Graph has empty/error fallback states.
- Error banners use consistent visual language.
- Long-running complaint investigation remains visible globally.
- Empty states explain what data is missing.

Potential improvements:

- Add more explicit ARIA labels to icon-heavy controls if the app expands.
- Add keyboard focus styling for graph interactions.
- Consider preserving page mounts to reduce graph remount latency.
- Consider route URLs if browser back/forward navigation becomes required.

## 29. Verification History

Production builds have been run repeatedly with:

```powershell
& "C:\Users\harih\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" node_modules\vite\bin\vite.js build
```

Latest build status:

- Build succeeded.
- Vite transformed 488 modules.
- Build emitted NVL worker assets.
- Vite reported a large chunk warning because Neo4j NVL adds graph/layout code.
- The warning is not a failure.

Observed build warning:

```text
Some chunks are larger than 500 kB after minification.
```

Reason:

- Neo4j NVL and layout workers significantly increase JavaScript bundle size.

Potential future optimization:

- Code-split the Digital Twin graph page with dynamic import.
- Configure Rollup manual chunks.
- Increase `build.chunkSizeWarningLimit` if warning is acceptable.

## 30. Known Environment Notes

- System `npm` is broken in the observed machine state because the global shim points to a missing `npm-cli.js`.
- `corepack pnpm` was used to install `@neo4j-nvl/react`.
- Vite/esbuild builds may need elevated filesystem access in the managed sandbox because esbuild reads config/dependency paths outside the default workspace sandbox.
- Existing dev server has responded at `http://127.0.0.1:5174/` when `5173` was occupied.

## 31. Known Product And Technical Caveats

Digital Twin:

- Cached data prevents backend fetches on repeated visits.
- The graph can still take a few seconds to render because NVL recomputes force-directed layout on remount.

Audit Shadow:

- Gauge uses investigation evidence confidence because no true audit readiness score currently exists in `lastReport.summary`.
- Dashboard readiness and Audit Shadow evidence confidence are intentionally labeled differently.

Traceability:

- Cache is invalidated after complaint investigation for the same device.
- It still uses device-level graph endpoints rather than reading rows directly from `lastReport`.

Browser automation:

- In-app browser automation previously stopped responding during final NVL visual reload.
- Production build verification is reliable; manual visual check may still be useful for graph behavior.

Unused/placeholder files:

- `src/LineSidebar.jsx` is empty and not imported.

Dependency caveat:

- `gsap` is installed but not currently used by source files.

## 32. Current Requirements Already Implemented

Implemented requirements from recent work:

- Do not hardcode visible operational values when backend data exists; Dashboard refreshes backend data and uses cache/initial values only to reduce waiting.
- Dashboard keeps initial/cached values visible while refreshing in background.
- Complaint Investigation only exposes complaint text input.
- Complaint textarea has example placeholder.
- Digital Twin shows a graph-like Neo4j Bloom experience using Neo4j NVL.
- Digital Twin removed heatmap and Risk Control Verification Matrix.
- Graph Explorer page removed.
- Traceability matrix fetch fixed for top-level array backend responses.
- Audit Shadow removed Run Mock Audit functionality.
- Audit Shadow reads from latest complaint investigation response.
- Cybersecurity removed standalone scan form and reads from latest complaint investigation response.
- Reports removed Document Service Capabilities and reads from latest complaint investigation response.
- Traceability caches data and avoids refetching on every tab visit.
- Traceability removed Firmware What-If / Ripple Propagation.
- Digital Twin cache-only behavior on repeat visits.
- No frontend API request timeout timers.
- Investigation running state persists across page navigation.
- Audit Shadow gauge relabeled and mismatch banner added.
- Dashboard gauge relabeled to avoid metric confusion.

## 33. Current Backend Contract Assumptions

Expected backend base:

```text
http://127.0.0.1:8000
```

Expected capabilities endpoint:

- `/agents/capabilities` returns device information under one of:
  - `devices`
  - `available_devices`
  - `data.devices`

Expected complaint report endpoint:

- `/documents/complaint-report` returns:
  - `summary`
  - `filename`
  - `download_url`
  - `document_id`
  - `project_name`
  - `generated_at`
  - possibly `live_sources`

Expected summary fields used:

- `device_id`
- `risk_level`
- `rpn`
- `capa_closure_tier`
- `capa_closure_status`
- `evidence_confidence_score`
- `evidence_confidence`
- `evidence_class_breakdown`
- `affected_component`
- `complaint_severity`
- `reportable`
- `regulatory_framework`
- `audit_findings`
- `audit_findings_detail`
- `cybersecurity_findings`
- `cybersecurity_findings_detail`
- `sbom_components`
- `sbom_components_detail`
- `current_firmware`

Expected graph endpoints:

- Device score endpoint should return one of:
  - `score`
  - `readiness_score`
  - nested requirement rows.
- KPI endpoint should return scalar KPI fields.
- Twin endpoint should return graph nodes and relationships through a supported shape.
- Matrix endpoint may return top-level array or object-wrapped rows.
- Evidence freshness endpoint may return top-level array or object with `stale`, `stale_links`, or `items`.
- CAPA context endpoint may return requirements with tests and risks.

## 34. File Responsibilities

### `src/App.jsx`

Responsibilities:

- Navigation model.
- Page rendering.
- Global app state.
- Local storage keys and helpers.
- Backend payload normalization.
- Page components.
- UI primitives.
- Error boundary.
- Graph rendering.
- Complaint investigation flow.
- Cache-first Digital Twin and Traceability behavior.

### `src/api.js`

Responsibilities:

- Backend base URL.
- URL joining.
- Fetch wrapper.
- JSON/text response handling.
- Backend error detail extraction.
- HTTP helper functions.

### `src/styles.css`

Responsibilities:

- Theme variables.
- Layout.
- Sidebar.
- Cards/panels.
- Tables.
- Forms.
- Gauges.
- Charts.
- Graph container.
- Empty/error/loading states.
- Responsive behavior.
- Reduced motion handling.

### `src/main.jsx`

Responsibilities:

- React root creation.
- App mount.
- CSS import.

### `index.html`

Responsibilities:

- Document shell.
- Font loading.
- React root element.
- Vite module script.

### `vite.config.js`

Responsibilities:

- Vite config.
- React plugin.

### `tailwind.config.js`

Responsibilities:

- Tailwind content paths.
- Dark mode config.
- Font/shadow/keyframe extensions.

### `postcss.config.js`

Responsibilities:

- Tailwind CSS plugin.
- Autoprefixer plugin.

### `pnpm-workspace.yaml`

Responsibilities:

- Workspace package selection.
- Allows `esbuild` build scripts under pnpm's newer build approval model.

## 35. Recommended Future Work

High value:

- Add code splitting for `DigitalTwin` / Neo4j NVL to reduce initial JS chunk size.
- Move page components out of monolithic `App.jsx` once behavior stabilizes.
- Add automated component tests for data extraction helpers.
- Add network-layer tests for endpoint failure states.
- Add a clear manual QA script for a full judge/demo flow.

Medium value:

- Keep pages mounted and toggle visibility to reduce graph remount delay.
- Add source labels/timestamps to cached Dashboard, Digital Twin, and Traceability data.
- Add a Clear Cache or Refresh All action for demos.
- Add stronger type definitions or runtime schemas for backend payloads.
- Add route URLs for direct navigation to pages.

Backend coordination:

- Add true `audit_readiness_score` to complaint report summary if Audit Shadow should show the same metric as Dashboard.
- Ensure complaint report response includes detailed audit findings, cybersecurity findings, and SBOM components.
- Ensure graph endpoints consistently include device IDs and shape metadata.

## 36. Demo Flow

Recommended demo path:

1. Start backend at `http://127.0.0.1:8000`.
2. Start frontend.
3. Open Dashboard.
4. Confirm backend online and selected device.
5. Open Complaint Investigation.
6. Enter complaint:

```text
screen is fully black, not giving any reading
```

7. Click Run Investigation.
8. Navigate to Dashboard or another page while request runs.
9. Confirm sidebar shows `Investigation running...`.
10. After completion, open Reports and download/view generated report.
11. Open Audit Shadow and confirm findings/evidence-confidence gauge.
12. Open Cybersecurity and confirm SBOM/CVE details.
13. Open Traceability and confirm matrix/coverage rows.
14. Open Digital Twin and refresh if no cache exists.

## 37. Final Current Status

Current frontend status:

- Builds successfully.
- Main pages are implemented.
- Complaint investigation flow is centralized.
- Report-dependent pages read from `lastReport`.
- Device-level pages use cache-first behavior where appropriate.
- Graph Explorer removed.
- Mock/standalone actions removed where requested.
- Metrics are relabeled to avoid conflating device readiness with investigation evidence confidence.
- Handoff and project documentation are current as of 2026-07-08.

