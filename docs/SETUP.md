# VenCrypto — Local Setup & Run

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

API: `http://localhost:5000`  
Health: `GET http://localhost:5000/api/health`

## 3. Frontend

```bash
cd frontend
# Windows: copy .env.example .env
cp .env.example .env
# VITE_API_URL defaults to http://localhost:5000/api
npm install
npm run dev
```

App: `http://localhost:5173`

## 4. First login

After `npm run seed` in backend, sign in with the admin credentials from `.env` (defaults in `.env.example`), or register a new user via **Sign up**.

## 5. Hybrid chart notes

- **Binance** public REST/WebSocket are used for market data (no API key required for klines).
- **Manual candles** are stored in `manual_price_data` and merged server-side before WebSocket broadcast.
- Ensure backend is running before opening the **Trading** page so the chart receives merged streams.

## Troubleshooting

| Issue | Fix |
|--------|-----|
| Mongo connection error | Check `MONGODB_URI`, firewall, Atlas IP whitelist |
| CORS errors | Set `CORS_ORIGIN` in backend `.env` to your Vite URL |
| Chart empty | Pick a liquid pair (e.g. `BTCUSDT`), check browser console & network |
