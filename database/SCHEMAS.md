# MongoDB Collections (SafeX)

MongoDB is schemaless; the backend enforces the following shapes via Mongoose.

## users

| Field | Type | Notes |
|--------|------|--------|
| email | string | unique, required |
| passwordHash | string | bcrypt |
| name | string | |
| phone | string | optional |
| role | enum | `user`, `admin`, `system` |
| emailVerified | boolean | default false |

## kyc_details

| Field | Type |
|--------|------|
| userId | ObjectId → users |
| documentType | `aadhar` \| `pan` \| `passport` |
| filePath | string |
| status | `pending` \| `approved` \| `rejected` |
| adminNote | string |
| reviewedBy | ObjectId |

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
| type | `deposit` \| `withdrawal` |
| amount | number |
| status | `pending` \| `approved` \| `rejected` \| `completed` |
| method | `manual` \| `gateway` |

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
