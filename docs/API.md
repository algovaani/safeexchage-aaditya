# HTTP API (REST)

Base URL: `http://localhost:5001/api` (dev)

## Auth

All auth responses: `{ success: boolean, message: string, data: object | null }`

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/auth/otp/send` | `{ mobile, purpose: "login" \| "register" }` | No |
| POST | `/auth/otp/resend` | `{ mobile, purpose: "login" \| "register" }` | No |
| POST | `/auth/register` | `{ mobile, otp, name?, email?, referralCode? }` | No |
| POST | `/auth/login` | `{ mobile, otp }` | No |
| POST | `/auth/admin/login` | `{ email, password }` | No |
| POST | `/auth/forgot-password` | `{ identifier }` | No |
| POST | `/auth/reset-password` | `{ identifier, otp, newPassword }` | No |
| POST | `/auth/logout` | — | Bearer JWT |
| GET | `/auth/me` | — | Bearer JWT |

**Notes**
- Passwords hashed with bcrypt (12 rounds).
- JWT expires in `7d` (see `JWT_EXPIRES_IN` in `.env`).
- Forgot-password OTP is sent via NinzaSMS for mobile users (logged to console for email in dev).
- User login and registration use mobile OTP only; admin login uses email + password at `/auth/admin/login`.
- Blocked users receive `403` on login and protected routes.

## KYC

Responses use `{ success, message, data }`. Files are served at `/uploads/kyc/...` (full URLs in JSON).

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/kyc/submit` | multipart: `doc_type`, `doc_front`, `doc_back?`, `selfie`, `address_proof` | User |
| GET | `/kyc/status` | — | User |

**`doc_type`:** `passport` \| `driving_license` \| `national_id`  
**Files:** JPG, JPEG, PNG, PDF — max **5MB** each. Naming: `userId_timestamp_field.ext`

### Admin KYC

| Method | Path | Body |
|--------|------|------|
| GET | `/admin/kyc` | `?status=pending\|approved\|rejected` |
| GET | `/admin/kyc/:id` | — |
| PATCH | `/admin/kyc/:id/review` | `{ action: "approve" \| "reject", note?: string }` — `note` required on reject |

## Wallet

| Method | Path | Body | Auth |
|--------|------|------|------|
| GET | `/wallet/balance` | — | User |
| POST | `/wallet/deposit` | `{ amount, reference? }` | User (legacy) |
| POST | `/wallet/withdraw` | `{ amount }` | User |
| GET | `/wallet/transactions` | — | User |

## Deposits (crypto + fiat)

Responses: `{ success, message, data }`. On admin **approve**, `wallets.balance` is credited and a `transactions` row is created.

| Method | Path | Body | Auth |
|--------|------|------|------|
| GET | `/deposit/crypto/address` | — | User |
| POST | `/deposit/crypto/submit` | `{ amount, txn_hash, network }` — `TRC20` \| `ERC20` | User |
| POST | `/deposit/fiat/submit` | multipart: `amount`, `payment_proof`, `utr_number?` | User |
| GET | `/deposits/history` | `?status=&type=` | User |

**txn_hash format:** TRC20 = 64 hex chars; ERC20 = `0x` + 64 hex chars.

### Admin deposits

| Method | Path | Body |
|--------|------|------|
| GET | `/admin/deposits` | `?type=crypto\|fiat&status=pending&from=ISO&to=ISO` |
| GET | `/admin/deposits/:id` | — |
| PATCH | `/admin/deposits/:id/verify` | `{ action: "approve" \| "reject", note? }` — `note` required on reject |

## Orders & trades (spot)

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/orders` | `{ symbol, side, orderType, quantity, price?, stopLoss?, takeProfit? }` | User |
| GET | `/orders` | — | User |
| GET | `/orders/trades` | — | User |

## Admin trade positions (copy/signal engine)

Requires approved KYC. Responses: `{ success, message, data }`.

| Method | Path | Body / Query | Auth |
|--------|------|----------------|------|
| POST | `/trades/join` | `{ trade_id, margin_amount }` — min 10 USDT | User |
| GET | `/trades/positions/open` | — | User |
| GET | `/trades/positions/history` | `?page=1&limit=20` | User |

TP/SL auto-settlement runs every **30s** via `tpslMonitor` when price hits admin trade levels.

## Market

| Method | Path | Query | Auth |
|--------|------|--------|------|
| GET | `/market/prices` | — | No |
| GET | `/market/prices/live` | — (force refresh; poll every ~3s) | No |
| GET | `/market/prices/:symbol` | e.g. `BTCUSDT` or `BTC/USDT` | No |
| GET | `/market/ticker` | `symbol` (legacy) | No |
| GET | `/market/klines` | `symbol`, `interval`, `limit`, `startTime?`, `endTime?` | No |

**`/market/prices` response** (5s in-memory cache; `stale: true` if Binance fails):

```json
{
  "pairs": [
    {
      "symbol": "BTCUSDT",
      "pair": "BTC/USDT",
      "price": 67234.5,
      "change_24h": 1.24,
      "high_24h": 68000,
      "low_24h": 66000,
      "volume": 12345.67
    }
  ],
  "stale": false,
  "updatedAt": "2026-06-01T12:00:00.000Z"
}
```

Pairs: BTC, ETH, BNB, SOL, XRP, DOGE, ADA, TRX, AVAX, LINK (all USDT).

Seed DB pairs: `npm run seed:pairs`

## Admin

All require `Authorization: Bearer <admin JWT>`.  
Responses: `{ success, message, data }`.

### Admin trade setup

| Method | Path | Body / Query |
|--------|------|----------------|
| POST | `/admin/trades` | `{ pair_id, entry_price, take_profit, stop_loss, leverage, description? }` |
| GET | `/admin/trades` | `?status=open\|closed\|cancelled\|all&pair_id=&page=1&limit=20` |
| GET | `/admin/trades/:id` | — |
| PATCH | `/admin/trades/:id/status` | `{ action: "close" \| "cancel", close_price? }` |
| GET | `/admin/trades/:id/orders` | — |

**Close:** settles all open `user_orders` at `close_price`, credits wallet (`balance` + PnL).  
**Cancel:** releases locked margins, marks orders `cancelled`.

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
| GET | `/admin/exchange-trades` | — (spot fill history) |

## WebSocket (Socket.io)

Connect to `http://localhost:5001` (same origin in prod behind reverse proxy).

Client events:

- `market:subscribe` `{ symbol, interval }`
- `market:unsubscribe` `{ symbol, interval }`

Server events:

- `market:klines:merged` `{ symbol, interval, candle }`
- `market:manual:updated` `{ candles }` (after admin save)
