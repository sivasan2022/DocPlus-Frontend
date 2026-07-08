# MedTrace AI Frontend Handoff

Date: 2026-07-08

## Current Frontend State

The frontend is a Vite + React app in `C:\Users\harih\Downloads\fron\fron`.

Primary files:

- `src/App.jsx` - page components, routing, backend response normalization, shared report state, abort guards, and graph rendering.
- `src/api.js` - shared API helpers for `GET`, `POST`, `DELETE`, URL joining, and backend error details.
- `src/styles.css` - layout, cards, forms, tables, report views, and Neo4j NVL graph container styling.
- `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` - frontend dependencies, including `@neo4j-nvl/react`.

## State And Data Flow

- Dashboard and Digital Twin are independent of the complaint workflow.
- Dashboard renders immediately from initial/cached values, then refreshes backend endpoints in the background.
- Complaint Investigation owns the only user-entered workflow input: `complaint_text`.
- The Complaint Investigation response is stored once as `lastReport` and persisted to `localStorage` under `medtrace-last-report`.
- Investigation in-flight/error state lives in `App`, so navigation no longer hides an active complaint run.
- `Shell` shows a persistent `Investigation running...` sidebar badge while the complaint request is in flight.
- Audit Shadow, Cybersecurity, and Reports do not call their own mock/scan/report endpoints. They render from `lastReport`.
- Complaint draft text is persisted under `medtrace-complaint-draft`.
- Digital Twin backend payloads are cached per device under `medtrace-twin-cache`.
- Traceability backend payloads are cached per device under `medtrace-traceability-cache`.
- A new complaint investigation invalidates that device's Traceability cache so the next Traceability visit refreshes once.

## Page Details

### Dashboard

- Keeps initial dashboard values visible immediately to reduce waiting.
- Background refresh merges successful backend payloads over cached/initial data.
- Shows whether the dashboard is using live, partial, cached, or initial values.
- Uses direct backend requests without frontend API timeouts.
- Endpoints used when available:
  - `GET /health`
  - `GET /documents/health`
  - `GET /agents/capabilities`
  - `GET /agents/debug/status`
  - `GET /graph/backend-status`
  - `GET /graph/device/{device_id}/score`
  - `GET /graph/device/{device_id}/kpis`
  - `GET /graph/device/{device_id}/evidence-freshness`

### Complaint Investigation

- Only visible user input is the complaint textarea.
- Placeholder example: `Example: screen is fully black, not giving any reading`.
- Removed device, firmware, serial, lot, framework, changed components, and checkbox inputs.
- Calls `POST /documents/complaint-report`.
- Stores the response as the single shared investigation/report object.
- Updates the selected device from `response.summary.device_id` when present.
- Uses `App.runInvestigation`, `investigationRunning`, and `investigationError` instead of local request state, so switching pages does not make a running investigation look lost.

### Digital Twin

- Graph Explorer page is removed from navigation and routing.
- Removed Risk Control Verification Matrix.
- Removed Twin Risk Surface heatmap.
- Uses `@neo4j-nvl/react` `InteractiveNvlWrapper` for a Neo4j Bloom-style interactive graph.
- Translates backend graph nodes/relationships into NVL `nodes` and `rels`.
- Supports click selection, drag, pan, and zoom.
- Caps rendered graph payload for usability while preserving backend node/relationship counts in the overlay.
- Uses cached graph data on page visit/device change when available.
- Calls the Digital Twin backend only on first view for an uncached device or when the user clicks Refresh.
- Fetches `/twin`, `/score`, and `/kpis` separately during a forced/live refresh so each backend payload can settle independently.
- Endpoints:
  - `GET /graph/device/{device_id}/twin`
  - `GET /graph/device/{device_id}/score`
  - `GET /graph/device/{device_id}/kpis`

### Traceability

- Fixed the data-fetch issue.
- Root cause: the backend can return a top-level array from `GET /graph/requirements/matrix/{device_id}`, while the old frontend only looked for object keys such as `matrix`, `requirements`, `rows`, or `data`.
- Uses cached traceability data on page visit/device change when available.
- Calls the four Traceability endpoints only on first view for an uncached device, after complaint cache invalidation, or when the user clicks Refresh.
- Removed the Firmware What-If / Ripple Propagation card and its backend action.
- Shows Live, Partially refreshed, Cached, or Waiting status next to Refresh.
- Now supports top-level arrays and object-wrapped matrix rows.
- Fallback row order:
  - requirements matrix
  - CAPA context
  - evidence freshness
- Surfaces per-endpoint failures instead of swallowing them into a generic empty state.
- Warns if the selected `device_id` is not present in `/agents/capabilities`.
- Endpoints:
  - `GET /graph/requirements/matrix/{device_id}`
  - `GET /graph/device/{device_id}/evidence-freshness`
  - `GET /graph/traceability/orphans`
  - `GET /graph/device/{device_id}/capa-context`

### Audit Shadow

- Removed Run Mock Audit.
- Removed framework selector.
- Reads from the latest Complaint Investigation response only.
- Gauge uses `summary.evidence_confidence_score` as the current available audit proxy metric.
- Shows a clear empty state if no investigation has been run.
- Shows detailed AuditShadow findings when the response includes rows, otherwise shows the available summary/count state.

### Cybersecurity

- Removed standalone SBOM scan form and Run Scan.
- Removed device, SBOM path, max component, CVE limit, and force-refresh inputs.
- Reads SBOM/CVE summary and rows from the latest Complaint Investigation response only.
- Shows a clear empty state until Complaint Investigation has produced a response.

### Reports

- Removed Document Service Capabilities.
- Removed document endpoint contract panels from the primary UI.
- Reads from the latest Complaint Investigation response only.
- Shows PDF filename/download URL, report metadata, executive summary, live source provenance, evidence class breakdown, and raw latest response.

## Hardening Added

- `AbortController` and request-id guards on dashboard, digital twin, and traceability refreshes.
- Cache-first Digital Twin and Traceability page visits to avoid repeated backend calls.
- Traceability cache invalidation when a new complaint report arrives for the same device.
- App-level investigation request state with a persistent Shell status badge.
- Direct GET requests without frontend API timeout timers.
- Page-level error boundary so an unexpected backend payload cannot blank the whole app.
- Shared `lastReport` persisted once, avoiding duplicated local result state across pages.
- API helper methods now accept fetch options such as `signal`.

## Verification Performed

Production build command:

```powershell
& "C:\Users\harih\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" node_modules\vite\bin\vite.js build
```

Result: build succeeded after the final changes.

Build note: Vite reports a large chunk warning because Neo4j NVL adds layout workers and graph rendering code. This is a warning, not a build failure.

Browser/runtime checks performed during the work:

- Confirmed Dashboard renders and Graph Explorer is absent from navigation.
- Confirmed Complaint page has only the complaint textarea and Run Investigation button.
- Confirmed removed texts/buttons are absent in the edited UI paths checked earlier: Run Mock Audit, Run Scan, Document Service Capabilities, Risk Control Verification Matrix, and Twin Risk Surface.
- During final NVL runtime re-check, the in-app browser automation bridge stopped responding while the dev server/browser tab was reloading the larger NVL bundle. The production build is verified; final visual browser confirmation should be done manually at `http://127.0.0.1:5174/` if the dev server is still running.

## Environment Notes

- System `npm` is broken on this machine because its global shim points to a missing `npm-cli.js`.
- `@neo4j-nvl/react` was installed through `corepack pnpm`, so `pnpm-lock.yaml` is now the active lockfile for the new dependency.
- `pnpm-workspace.yaml` allows the required `esbuild` build script.
- Existing dev server responded on `http://127.0.0.1:5174/`.
- Vite builds required elevated filesystem access because esbuild needed to read dependency/config paths outside the managed sandbox.
