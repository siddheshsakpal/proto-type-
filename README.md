# Visent AI Coverage Assistant + AI Underwriter (prototype)
Run: `node server.js` (Node 18+, no npm install) -> http://localhost:3000
Login: see `.env` (APP_USER / APP_PASS). Groq key: `GROQ_API_KEY` in `.env` (server-side only).
Knowledge base: `data/claims.csv` + policy chunks (section/page) in `server.js`; source PDF in `data/policy.pdf`.
Logs: `data/log.jsonl` | Latency p50/p95: GET /api/metrics
