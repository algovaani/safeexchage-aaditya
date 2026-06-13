# SafeX Landing

Standalone marketing site — **separate from** `frontend/` (trading app).

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:5174**

Set `VITE_APP_URL=http://localhost:5173` so CTA buttons open the main app.

## Production

Deploy this folder to your landing domain. Set:

```
VITE_APP_URL=https://app.yourdomain.com
```

Build: `npm run build` → serve `dist/` (Netlify, Vercel, S3, etc.)

## Structure

| Path | Purpose |
|------|---------|
| `src/Landing.jsx` | Full landing page |
| `src/Landing.css` | Styles + video background |
| `public/videos/` | Optional local `hero-3d.mp4` |
