# SafeXchange Admin Android App

Admin-only app: login → Deposits / Withdrawals → Accept / Reject (with remark) → open web admin in browser. FCM push for new requests (foreground + background).

## Setup

### 1) Backend FCM

1. Firebase Console → Project **safexchange-f6fe9** → Project settings → Service accounts  
2. Generate new private key → save JSON as e.g. `backend/secrets/firebase-adminsdk.json`  
3. In `backend/.env` add:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-adminsdk.json
```

(or `FIREBASE_SERVICE_ACCOUNT_JSON='{...entire json...}'`)

4. Restart backend (`nodemon`). Without this, in-app lists still work; only **push** is skipped.

### 2) API URL in the app

`app/build.gradle` → `defaultConfig`:

| Environment | API_BASE_URL | ADMIN_WEB_BASE |
|-------------|--------------|----------------|
| Emulator | `http://10.0.2.2:5001/api/` | `http://10.0.2.2:5173` |
| Real phone (same Wi‑Fi) | `http://YOUR_PC_IP:5001/api/` | `http://YOUR_PC_IP:5173` |
| Production | `https://api.safexchange.io/api/` | `https://safexchange.io` |

### 3) Run

Open `SafeXchangeApp` in Android Studio → Sync Gradle → Run on device/emulator.  
Login with admin email/password (same as web admin).

## Features

- Admin login (`POST /api/auth/admin/login`)
- Home: Deposits + Withdrawals pending counts
- Full pending (or All) lists
- Accept / Reject; reject requires remark
- Tap title or “Open in admin browser” → Chrome/WebView to `/admin/panel?section=…`
- FCM: registers token at `POST /api/admin/notifications/device`
- New deposit/withdraw → FCM push (needs Firebase service account)

## Push notifications (required)

Without a Firebase **service account**, the backend cannot send FCM.

1. Open: https://console.firebase.google.com/project/safexchange-f6fe9/settings/serviceaccounts/adminsdk  
2. **Generate new private key** → download JSON  
3. Save as: `backend/secrets/firebase-adminsdk.json`  
4. Restart backend — look for `[fcm] Firebase Admin messaging ready`  
5. Run the app → **login** (registers device token)  
6. Home → **Send test Firebase notification**  
7. New deposit/withdraw requests will also push automatically  

Check status: `GET /api/admin/notifications/fcm-status`  
