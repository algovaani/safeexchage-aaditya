# MongoDB Collections (SafeXchange)

MongoDB is schemaless; the backend enforces the following shapes via Mongoose.

## users

| Field | Type | Notes |
|--------|------|--------|
| email | string | unique sparse; email **or** mobile required |
| mobile | string | unique sparse |
| passwordHash | string | bcrypt (12 rounds) |
| name | string | |
| status | string | `active` \| `blocked` |
| role | enum | `user`, `admin`, `system` |
| emailVerified | boolean | default false |
| mobileVerified | boolean | default false |

## password_otps

| Field | Type | Notes |
|--------|------|--------|
| identifier | string | normalized email or mobile |
| otpHash | string | bcrypt-hashed 6-digit OTP |
| expiresAt | date | TTL index (10 min) |
| used | boolean | |

## token_blacklists

| Field | Type | Notes |
|--------|------|--------|
| tokenHash | string | SHA-256 of JWT |
| expiresAt | date | TTL = token expiry |

## kyc_submissions

| Field | Type |
|--------|------|
| userId | ObjectId → users |
| docType | `passport` \| `driving_license` \| `national_id` |
| files.docFront | `{ path, originalName }` |
| files.docBack | optional |
| files.selfie | `{ path, originalName }` |
| files.addressProof | `{ path, originalName }` |
| status | `pending` \| `approved` \| `rejected` |
| adminNote | string |
| reviewedBy | ObjectId |
| reviewedAt | date |

## deposits

| Field | Type |
|--------|------|
| userId | ObjectId → users |
| type | `crypto` \| `fiat` |
| amount | number (USDT) |
| currency | string (default `USDT`) |
| status | `pending` \| `approved` \| `rejected` |
| txnHash | string (crypto) |
| network | `TRC20` \| `ERC20` |
| utrNumber | string (fiat, optional) |
| paymentProof | `{ path, originalName }` (fiat) |
| transactionId | ObjectId → transactions (set on approve) |
| adminNote | string |
| reviewedBy | ObjectId |
| reviewedAt | date |

## admin_trades

| Field | Type |
|--------|------|
| pairId | ObjectId → trading_pairs |
| entryPrice | number |
| takeProfit | number |
| stopLoss | number |
| leverage | number (1–100) |
| description | string |
| status | `open` \| `closed` \| `cancelled` |
| closePrice | number |
| closedAt | date |
| createdBy | ObjectId → users |

## user_orders

| Field | Type |
|--------|------|
| userId | ObjectId → users |
| tradeId | ObjectId → admin_trades |
| marginAmount | number |
| entryPrice | number |
| status | `open` \| `closed` \| `cancelled` |
| pnl | number |
| closedAt | date |

## trading_pairs

| Field | Type |
|--------|------|
| symbol | string (unique) e.g. `BTCUSDT` |
| baseAsset | string e.g. `BTC` |
| quoteAsset | string default `USDT` |
| displayPair | string e.g. `BTC/USDT` |
| isActive | boolean |
| sortOrder | number |

## wallets

| Field | Type |
|--------|------|
| userId | ObjectId (unique) |
| currency | string (default `USDT`) |
| balance | number |
| lockedBalance | number |

## transactions

| Field | Type |
|--------|------|
| userId | ObjectId |
| type | `deposit` \| `withdrawal` \| `trade_margin_locked` \| `trade_profit` \| `trade_loss` \| `trade_margin_returned` |
| balanceAfter | number (optional) |
| orderId | ObjectId → user_orders |
| tradeId | ObjectId → admin_trades |
| depositId | ObjectId → deposits (optional) |
| amount | number |
| status | `pending` \| `approved` \| `rejected` \| `completed` |
| method | `manual` \| `gateway` \| `crypto` \| `fiat` |

## orders

| Field | Type |
|--------|------|
| userId | ObjectId |
| symbol | string |
| side | `buy` \| `sell` |
| orderType | `market` \| `limit` |
| quantity | number |
| price | number \| null |
| stopLoss | number \| null |
| takeProfit | number \| null |
| status | `open` \| `partially_filled` \| `filled` \| `cancelled` \| `rejected` |

## trades

| Field | Type |
|--------|------|
| symbol | string |
| price | number |
| quantity | number |
| buyerUserId | ObjectId |
| sellerUserId | ObjectId |
| buyOrderId | ObjectId |
| sellOrderId | ObjectId |
| fee | number |

## market_data (Binance cache)

| Field | Type |
|--------|------|
| symbol | string |
| interval | string |
| openTime | number (ms) |
| open, high, low, close | number |
| volume | number |
| isFinal | boolean |
| source | string (`binance`) |

Unique index: `(symbol, interval, openTime)`.

## manual_price_data

| Field | Type |
|--------|------|
| symbol | string |
| interval | string |
| openTime | number (bucket start, ms) |
| mode | `candle` \| `tick` |
| open, high, low, close | numbers (candle mode) |
| tickTime, price | numbers (tick mode) |
| revision | number (monotonic per bucket) |
| createdBy | ObjectId (admin) |
