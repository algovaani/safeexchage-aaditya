# Hero background video

Landing page (`Home.jsx`) uses a full-screen looping **3D network** video behind all content.

## Default (online)

The app loads a free stock clip from CDN automatically. No setup required if you have internet.

## Optional local file

For offline or faster loads, save your own MP4 here:

```
frontend/public/videos/hero-3d.mp4
```

Recommended: 1920×1080, H.264, 15–30s loop, dark + gold/cyan tech aesthetic, under ~20MB.

Free sources: [free-stock.video](https://free-stock.video), [Mixkit](https://mixkit.co/free-stock-video/), [Coverr](https://coverr.co).

## Fallback

If the video cannot play, a **3D particle network** canvas animation runs instead (same gold theme).
