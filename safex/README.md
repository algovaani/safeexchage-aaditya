# SafeXchange — Full-Stack Crypto Exchange

Monorepo for the next-generation SafeXchange platform (PostgreSQL + Prisma + Next.js 14 + Express TypeScript).

## Structure

```
safex/
  prisma/          # Schema, migrations, seed
  backend/         # Express REST API (TypeScript)
  frontend/        # Next.js 14 App Router
  docker-compose.yml
  .env.example
```

## Quick start

### 1. Infrastructure

```bash
cd safex
docker compose up -d
cp .env.example .env
cp .env.example backend/.env
```

### 2. Database

```bash
cd backend
npm install
npm run db:push
npm run db:seed
```

### 3. Backend API (port 5000)

```bash
cd backend
npm run dev
```

### 4. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000/login

**Admin (after seed):** `admin@safex.local` / `ChangeMeAdmin123!`

## Implementation status

| # | Module | Status |
|---|--------|--------|
| 1 | Prisma schema + seed | Done |
| 2 | Auth (register, login, refresh, OTP, sessions, admin OTP login) | Done |
| 3 | Wallet service + transaction logging | Done |
| 4 | KYC (user + admin APIs & pages) | Done |
| 5 | Deposits (crypto/fiat + admin approve) | Done |
| 6 | Binance WebSocket + Redis prices + Socket.io | Done |
| 7 | Admin trade setup + order engine cron | Done |
| 8 | Staking (plans, daily cron, user/admin pages) | Done |
| 9 | User dashboard + history | Done (charts placeholder) |
| 10 | Admin panel (dashboard, users, KYC, deposits, trades, staking) | Done |
| 11 | Admin login (amber + OTP) | Done |
| 12 | Docker + README | Done |

> **Note:** Docker was not detected on this machine. Install PostgreSQL 16 + Redis locally, or install Docker Desktop, then update `DATABASE_URL` in `backend/.env`.

## API (implemented)

- Auth: `/api/auth/*` + `/api/admin/auth/login`
- Wallet: `GET /api/wallet/balance`
- KYC: `POST /api/kyc/submit`, `GET /api/kyc/status`
- Deposits: `POST /api/deposits/crypto|fiat`, `GET /api/deposits/my`
- Market: `GET /api/market/prices`, Socket.io `price_update`
- Orders: `POST /api/orders/place`, `GET /api/orders/my|open`
- Staking: `GET /api/staking/plans`, `POST /api/staking/stake`, etc.
- Admin: `/api/admin/*` (dashboard, users, KYC, deposits, trades, staking, settings)

## Legacy app

The existing MongoDB + Vite app remains in `/frontend` and `/backend` at the repo root. The new stack lives entirely under `/safex`.
