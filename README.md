# DocPlus Frontend

React dashboard for DocPlus, an agentic AI compliance intelligence platform for MedTech complaint investigation, device traceability, audit readiness, cybersecurity review, and CAPA report generation.

The frontend connects to the DocPlus FastAPI backend, runs complaint investigations, renders a device digital twin graph, surfaces audit and cybersecurity findings from the latest investigation, and lets users download generated complaint/CAPA PDFs.

## What This App Does

- Provides a single compliance workspace for dashboard KPIs, complaint investigation, digital twin graph review, audit shadow findings, cybersecurity findings, performance metrics, reports, and team information.
- Sends complaint text to the backend document workflow at `POST /documents/complaint-report`.
- Persists the latest investigation report in browser storage so Audit Shadow, Cybersecurity, and Reports can reuse the same live result.
- Visualizes the device evidence graph through `@neo4j-nvl/react`.
- Extracts root-cause content from the generated PDF using `pdfjs-dist`.
- Supports light and dark themes, backend URL switching, cached dashboard data, cached digital twin payloads, and in-flight investigation status.

## Tech Stack

- React 19
- Vite 6
- Tailwind CSS 3
- Neo4j NVL React graph visualization
- PDF.js for client-side PDF text extraction
- GSAP for animation support

## Project Structure

```text
DocPlus-Frontend-main/
  index.html
  package.json
  vite.config.js
  tailwind.config.js
  postcss.config.js
  src/
    App.jsx                 # Main app, page components, state, routing, graph rendering
    api.js                  # Fetch helpers and API URL utilities
    main.jsx                # React entry point
    styles.css              # Global app styling
    root-cause.css          # Root-cause report styling
    pdfRootCause.js         # PDF root-cause extraction helper
    LineSidebar.jsx         # Sidebar-related component
    assets/
      docplus-logo-dark.png
      docplus-logo-light.png
```

## Prerequisites

- Node.js 18 or newer
- npm, or pnpm if you prefer using the existing `pnpm-lock.yaml`
- Running DocPlus backend, usually at `http://127.0.0.1:8000`

## Quick Start

Install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://127.0.0.1:5173
```

If Vite chooses another port because `5173` is busy, use the printed URL.

## Backend Setup

Start the backend from the backend folder in a separate terminal:

```powershell
cd "C:\Users\DELL\OneDrive\Attachments\DocPlus\DocPlus-Backend-main"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Then confirm the backend is reachable:

```text
http://127.0.0.1:8000/health
```

## Environment Configuration

The frontend defaults to:

```text
http://127.0.0.1:8000
```

To override it, create a `.env` file in `DocPlus-Frontend-main/`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

You can also change the backend URL inside the app. The selected value is saved to browser `localStorage` under:

```text
medtrace-api-base
```

## Available Scripts

```powershell
npm run dev
```

Runs Vite locally with `--host 127.0.0.1`.

```powershell
npm run build
```

Creates the production bundle in `dist/`.

```powershell
npm run preview
```

Serves the production bundle locally for verification.

## Main Pages

### Dashboard

Shows backend health, document service status, graph backend status, readiness score, graph KPIs, and stale evidence information.

Backend calls:

- `GET /health`
- `GET /documents/health`
- `GET /agents/capabilities`
- `GET /agents/debug/status`
- `GET /graph/backend-status`
- `GET /graph/device/{device_id}/score`
- `GET /graph/device/{device_id}/kpis`
- `GET /graph/device/{device_id}/evidence-freshness`

### Complaint Investigation

Accepts complaint text and runs the full live backend report workflow.

Backend call:

- `POST /documents/complaint-report`

The response is saved as the latest report and reused by the Audit Shadow, Cybersecurity, and Reports pages.

### Digital Twin

Renders the device knowledge graph with interactive pan, zoom, drag, and node selection.

Backend calls:

- `GET /graph/device/{device_id}/twin`
- `GET /graph/device/{device_id}/score`
- `GET /graph/device/{device_id}/kpis`

### Audit Shadow

Displays audit findings and readiness signals from the latest complaint investigation report. It does not run a separate mock audit from the UI.

### Cybersecurity

Displays SBOM/CVE findings from the latest complaint investigation report. It does not run a separate SBOM scan from the UI.

### Performance

Shows static prototype telemetry and business-impact metrics for presentation and demo storytelling.

### Reports

Shows generated report metadata, PDF download link, live source provenance, extracted root-cause details, and raw latest response.

## Browser Storage

The app uses `localStorage` for convenient demo continuity:

- `medtrace-theme` - selected light/dark theme
- `medtrace-api-base` - selected backend URL
- `medtrace-dashboard-cache` - dashboard fallback data
- `medtrace-complaint-draft` - complaint text draft
- `medtrace-last-report` - latest complaint/report response
- `medtrace-twin-cache` - cached digital twin payloads by device

To reset the frontend state, clear site data for the local Vite URL or remove these keys from browser storage.

## API Helper Behavior

`src/api.js` exposes:

- `DEFAULT_API_BASE`
- `joinUrl(baseUrl, path)`
- `apiRequest(baseUrl, path, options)`
- `getJson(baseUrl, path, options)`
- `postJson(baseUrl, path, body, options)`
- `deleteJson(baseUrl, path, options)`

Requests default to JSON bodies and parse JSON responses automatically. `FormData` bodies are sent without a JSON content type. Non-OK responses try to surface backend `detail` or `message` fields.

## Build And Preview

Create a production build:

```powershell
npm run build
```

Preview it:

```powershell
npm run preview
```

The Neo4j NVL graph package can make the final JavaScript chunk large. A Vite chunk-size warning is expected and does not necessarily indicate a broken build.

## Troubleshooting

### Backend offline or red status

Confirm the backend is running:

```text
http://127.0.0.1:8000/health
```

Then confirm the frontend backend URL points to the same origin.

### Complaint workflow takes a while

The complaint report endpoint can run multiple backend agents, PDF generation, optional OpenAI reasoning, optional cybersecurity scan, and graph/vector retrieval. The UI keeps a persistent running state while the request is active.

### PDF root-cause extraction is empty

Check that the backend response includes `download_url`, and confirm that URL works in the browser. The frontend downloads the generated PDF and extracts the root-cause section with PDF.js.

### Graph page is empty

Confirm the selected device exists in backend capabilities and that the backend returns nodes for:

```text
GET /graph/device/{device_id}/twin
```

### CORS errors

The backend currently allows all origins through FastAPI CORS middleware. If CORS fails, verify you are hitting the expected backend server and not another process on port `8000`.

## Deployment Notes

- Build output is generated under `dist/`.
- Configure `VITE_API_BASE_URL` for the deployed backend before building.
- The backend must expose the same API routes used above.
- If frontend and backend are served from different domains, make sure the backend CORS policy allows the frontend origin.

## Current Backend Contract

The frontend expects the backend to expose:

- `GET /health`
- `GET /documents/health`
- `GET /agents/capabilities`
- `GET /agents/debug/status`
- `GET /graph/backend-status`
- `GET /graph/device/{device_id}/twin`
- `GET /graph/device/{device_id}/score`
- `GET /graph/device/{device_id}/kpis`
- `GET /graph/device/{device_id}/evidence-freshness`
- `POST /documents/complaint-report`
- `GET /documents/download/{filename}`

The most important end-to-end path is:

```text
Complaint text -> POST /documents/complaint-report -> generated PDF metadata -> GET /documents/download/{filename}
```
