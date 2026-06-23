# SafeXchange — Production (safexchange.io)

| URL | Role |
|-----|------|
| `https://safexchange.io` | Frontend (Vite build from `frontend/`) |
| `https://api.safexchange.io` | Backend API + WebSocket |

## Frontend `.env.production`

```env
VITE_API_URL=https://api.safexchange.io/api
VITE_SOCKET_URL=https://api.safexchange.io
```

If you set `VITE_API_URL=https://api.safexchange.io` (without `/api`), the app auto-appends `/api` on build.

```bash
cd frontend && npm run build
# Upload dist/ to safexchange.io document root
```

## Backend `.env` (on API server)

```env
NODE_ENV=production
PORT=5001
MONGODB_URI=mongodb+srv://...
JWT_SECRET=long-random-string
CORS_ORIGIN=https://safexchange.io,https://www.safexchange.io
FRONTEND_URL=https://safexchange.io
```

Restart backend after changing `CORS_ORIGIN`.

```bash
cd backend && npm install && npm start
# Or: pm2 start src/server.js --name safex-api
```

## Nginx / Apache proxy (api.safexchange.io)

Proxy **all** paths to Node (not only `/api`):

```nginx
server {
  listen 443 ssl;
  server_name api.safexchange.io;

  location / {
    proxy_pass http://127.0.0.1:5001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Verify deployment

```bash
curl https://api.safexchange.io/api/health
curl "https://api.safexchange.io/api/market/ticker?symbol=BTCUSDT"
```

Expected: JSON with `"success": true`. If you see **50X / 503 HTML**, Node is not running or proxy port is wrong.

## CORS errors in browser

1. `CORS_ORIGIN` must include exact site origin: `https://safexchange.io` (not the API URL).
2. Frontend must use `https://api.safexchange.io/api` (HTTPS, with `/api`).
3. Rebuild frontend after changing `.env.production`.

---

# SafeXchange — Production domain layout

One **frontend** serves the public site and app UI on the main domain. The **API** runs on a separate subdomain.

## Domains

| URL | What runs there |
|-----|-----------------|
| `https://safex.com` | Landing `/`, Login `/login`, Signup `/signup`, app `/dashboard`, … |
| `https://api.safex.com` | Express backend only (`/api/*`, Socket.io) |

## Folder structure (repo)

```
vancrypto/
  frontend/     ← Build & deploy to main domain (landing + login + signup + app)
  backend/      ← Deploy to api subdomain
  landing/      ← Deprecated — merged into frontend/src/pages/Landing.jsx
  safex/        ← Optional new stack — not required for live
```

## Frontend build

```bash
cd frontend
cp .env.example .env.production
# Edit .env.production:
#   VITE_API_URL=https://api.safex.com/api
#   VITE_SOCKET_URL=https://api.safex.com

npm run build
# Deploy dist/ to safex.com (Nginx, Vercel, Cloudflare Pages, etc.)
```

**SPA routing:** Nginx (or host) must serve `index.html` for all non-file routes:

```nginx
server {
  listen 443 ssl;
  server_name safex.com www.safex.com;
  root /var/www/safex-frontend/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

## Backend (API subdomain)

```bash
cd backend
# .env: CORS_ORIGIN=https://safex.com,https://www.safex.com
#       FRONTEND_URL=https://safex.com
npm start
```

```nginx
server {
  listen 443 ssl;
  server_name api.safex.com;

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## Routes on main domain

| Path | Page |
|------|------|
| `/` | Marketing landing |
| `/login` | User login |
| `/signup` | Registration |
| `/admin/login` | Admin login |
| `/dashboard` | App (after login) |

All auth and landing share one Vite app — no cross-domain redirects for signup/login.
