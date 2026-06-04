# HTTP API (REST)

Base URL: `http://localhost:5000/api` (dev)

## Auth

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/auth/register` | `{ email, password, name? }` | No |
| POST | `/auth/login` | `{ email, password }` | No |
| GET | `/auth/me` | — | Bearer JWT |

## KYC

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/kyc` | multipart: `file`, `documentType` | User |
| GET | `/kyc/me` | — | User |

## Wallet

| Method | Path | Body | Auth |
|--------|------|------|------|
| GET | `/wallet/balance` | — | User |
| POST | `/wallet/deposit` | `{ amount, reference? }` | User |
| POST | `/wallet/withdraw` | `{ amount }` | User |
| GET | `/wallet/transactions` | — | User |

## Orders & trades

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/orders` | `{ symbol, side, orderType, quantity, price?, stopLoss?, takeProfit? }` | User |
| GET | `/orders` | — | User |
| GET | `/orders/trades` | — | User |

## Market (merged chart data)

| Method | Path | Query | Auth |
|--------|------|--------|------|
| GET | `/market/klines` | `symbol`, `interval`, `limit`, `startTime?`, `endTime?` | No |

## Admin

All require `Authorization: Bearer <admin JWT>`.

| Method | Path | Body |
|--------|------|------|
| GET | `/admin/users` | — |
| GET | `/admin/kyc` | — |
| PATCH | `/admin/kyc/:id` | `{ status, adminNote? }` |
| GET | `/admin/transactions` | — (pending) |
| PATCH | `/admin/transactions/:id` | `{ decision: 'approve' \| 'reject' }` |
| POST | `/admin/manual-prices` | See Zod `manualPriceSchema` |
| GET | `/admin/manual-prices` | `?symbol=&interval=` |
| DELETE | `/admin/manual-prices/:id` | — |
| GET | `/admin/trades` | — |

## WebSocket (Socket.io)

Connect to `http://localhost:5000` (same origin in prod behind reverse proxy).

Client events:

- `market:subscribe` `{ symbol, interval }`
- `market:unsubscribe` `{ symbol, interval }`

Server events:

- `market:klines:merged` `{ symbol, interval, candle }`
- `market:manual:updated` `{ candles }` (after admin save)
