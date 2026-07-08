# MedTrace AI Frontend

React + Tailwind CSS frontend for the MedTrace AI FastAPI backend.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Default backend URL:

```text
http://127.0.0.1:8000
```

Override it with:

```powershell
Copy-Item .env.example .env
```

Then edit `VITE_API_BASE_URL`.

## Backend Expected

Start the backend separately:

```powershell
cd "D:\vs code\medTraceAi"
.\.venv\Scripts\Activate.ps1
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```
