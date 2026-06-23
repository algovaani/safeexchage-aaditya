# SafeXchange — Local Setup & Run

## Prerequisites

- **Node.js** 18+
- **MongoDB** 6+ (local or Atlas URI)

## 1. MongoDB

Start local MongoDB, or create a cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and copy the connection string.

## 2. Backend

```bash
cd backend
# Windows: copy .env.example .env
cp .env.example .env
# Edit .env: set MONGODB_URI, JWT_SECRET, optionally ADMIN_EMAIL / ADMIN_PASSWORD for seed
npm install
npm run seed   # optional: creates admin user
npm run dev
```

API: `http://localhost:5001` (default port avoids macOS AirPlay on **5000**)  
Health: `GET http://localhost:5001/api/health`

## 3. Frontend (trading app)

```bash
cd frontend
# Windows: copy .env.example .env
cp .env.example .env
# VITE_API_URL defaults to http://localhost:5001/api (or use Vite proxy via `/api`)
npm install
npm run dev
```

App: `http://localhost:5173` — login, signup, trade, account (no marketing landing here)

## 4. Landing site (separate domain)

Marketing landing page lives in **`landing/`** — deploy on its own domain (e.g. `safex.com`), while the app runs on another (e.g. `app.safex.com`).

```bash
cd landing
cp .env.example .env
# VITE_APP_URL = main app URL (signup/login links point here)
npm install
npm run dev
```

Landing: `http://localhost:5174`

Production `.env` example:

| Project | Variable | Example |
|---------|----------|---------|
| `landing/.env` | `VITE_APP_URL` | `https://app.safex.com` |
| `backend/.env` | `CORS_ORIGIN` | `https://app.safex.com` |

## 5. First login

After `npm run seed` in backend, sign in at **http://localhost:5173/admin/login** with:

- Email: `admin@safex.local` (from `ADMIN_EMAIL` in `backend/.env`)
- Password: `ChangeMeAdmin123!` (from `ADMIN_PASSWORD`)

Admin panel: **http://localhost:5173/admin/panel**

Or register a new user via **Sign up** at http://localhost:5173/signup

## 6. Hybrid chart notes

- **Binance** public REST/WebSocket are used for market data (no API key required for klines).
- **Manual candles** are stored in `manual_price_data` and merged server-side before WebSocket broadcast.
- Ensure backend is running before opening the **Trading** page so the chart receives merged streams.

## Troubleshooting

| Issue | Fix |
|--------|-----|
| Mongo connection error | In [Atlas](https://cloud.mongodb.com) → **Network Access** → add your current IP (or `0.0.0.0/0` for dev only). Verify `MONGODB_URI` user/password. |
| `403` on `/api/*` with backend “down” | macOS **AirPlay Receiver** often binds port **5000**. Use `PORT=5001` in `backend/.env` and restart; or disable AirPlay in System Settings → General → AirDrop & Handoff. |
| `500` on `/api/*` from Vite (`ECONNREFUSED` in frontend terminal) | Backend not listening — usually MongoDB failed on startup. Fix Atlas IP whitelist, run `npm run dev` in `backend` (no `sudo`), then check `GET http://localhost:5001/api/health`. |
| CORS errors | Set `CORS_ORIGIN` in backend `.env` to your Vite URL |
| Chart empty | Pick a liquid pair (e.g. `BTCUSDT`), check browser console & network |
