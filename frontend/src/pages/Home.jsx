import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './Home.css';

const TICKER = [
  { pair: 'BTC/USDT', price: '67,234.50', chg: '+1.24%', up: true },
  { pair: 'ETH/USDT', price: '3,542.18', chg: '+0.87%', up: true },
  { pair: 'BNB/USDT', price: '612.40', chg: '-0.32%', up: false },
  { pair: 'SOL/USDT', price: '178.92', chg: '+2.15%', up: true },
  { pair: 'XRP/USDT', price: '0.6241', chg: '-0.11%', up: false },
];

const STATS = [
  { value: '10K+', label: 'DEMO USDT ON SIGNUP' },
  { value: '1s', label: 'CHART INTERVAL' },
  { value: '24/7', label: 'MARKET SYNC' },
  { value: '99.9%', label: 'UPTIME TARGET' },
];

const FEATURES = [
  {
    icon: '⚡',
    title: 'SUB-SECOND UPDATES',
    desc: 'Trade stream aur chart candles seconds-level refresh — smooth terminal experience.',
  },
  {
    icon: '📊',
    title: 'HYBRID PRICE ENGINE',
    desc: 'Live feed + admin manual overlay — flexible training aur production dono ke liye.',
  },
  {
    icon: '🔒',
    title: 'SECURE BY DESIGN',
    desc: 'JWT auth, bcrypt, KYC workflow, admin-approved wallet — compliance-friendly stack.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'REGISTER & VERIFY',
    desc: 'Free account banayein, email verify karein — minutes mein ready.',
  },
  {
    num: '02',
    title: 'FUND YOUR WALLET',
    desc: 'Deposit request bhejein; admin approval ke baad balance active.',
  },
  {
    num: '03',
    title: 'OPEN TERMINAL',
    desc: 'Spot trading UI — charts, order book, buy/sell ek dashboard par.',
  },
  {
    num: '04',
    title: 'TRADE WITH CONFIDENCE',
    desc: 'Demo balance se practice karein, phir real flow explore karein.',
  },
];

const RATES = [
  { code: 'BTC', name: 'Bitcoin', buy: '67,210', sell: '67,248', chg: '+1.24%', up: true },
  { code: 'ETH', name: 'Ethereum', buy: '3,538', sell: '3,546', chg: '+0.87%', up: true },
  { code: 'BNB', name: 'BNB', buy: '611.2', sell: '613.6', chg: '-0.32%', up: false },
  { code: 'SOL', name: 'Solana', buy: '178.4', sell: '179.4', chg: '+2.15%', up: true },
];

const TESTIMONIALS = [
  {
    initials: 'AK',
    name: 'Arjun K.',
    role: 'Retail Trader',
    text: 'SafeX ka UI clean hai — signup se trading terminal tak sab smooth laga. Demo USDT se practice bhi easy thi.',
  },
  {
    initials: 'SM',
    name: 'Sana M.',
    role: 'Crypto Learner',
    text: 'KYC aur wallet flow clear hai. Admin panel se control ka idea achha hai training projects ke liye.',
  },
  {
    initials: 'RD',
    name: 'Rohan D.',
    role: 'Developer',
    text: 'Hybrid chart engine interesting hai — live data + manual candles same platform par test kar sakte ho.',
  },
];

const PLANS = [
  {
    name: 'STARTER',
    price: '₹0',
    period: '/month',
    desc: 'Individuals aur learners ke liye perfect.',
    features: ['Free signup', '10K demo USDT', 'Spot terminal access', 'Basic KYC flow'],
    popular: false,
  },
  {
    name: 'PRO',
    price: 'Custom',
    period: '',
    desc: 'Active traders jo full features chahte hain.',
    features: ['Priority support', 'Full wallet ops', 'Advanced charts', 'Unlimited practice'],
    popular: true,
  },
  {
    name: 'ENTERPRISE',
    price: 'Custom',
    period: '',
    desc: 'Teams aur institutions ke liye.',
    features: ['Admin panel', 'Manual price engine', 'User management', 'API-ready stack'],
    popular: false,
  },
];

const FAQ_ITEMS = [
  { q: 'SafeX kya hai?', a: 'Ek full-stack crypto exchange platform — wallet, KYC, trading, admin.' },
  { q: 'Kya registration free hai?', a: 'Haan, account free hai aur demo balance milta hai.' },
  { q: 'Trading kaise shuru karein?', a: 'Signup → verify → wallet → /trade terminal open karein.' },
];

const HERO_VIDEO_LOCAL = '/videos/hero-3d.mp4';
const HERO_VIDEO_CDN =
  'https://cdn.free-stock.video/1942022/futuristic-connect-science-network-geometric-shape-internet-abstract-153155-full.mp4';

/** 3D particle network — plays when video is missing or behind video */
function NetworkCanvasFallback({ dim = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let angleY = 0;
    let angleX = 0.35;
    const nodes = [];
    const gridLines = [];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const init = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      cx = w / 2;
      cy = h / 2;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      nodes.length = 0;
      const count = dim ? 70 : 120;
      for (let i = 0; i < count; i += 1) {
        nodes.push({
          x: (Math.random() - 0.5) * 900,
          y: (Math.random() - 0.5) * 520,
          z: (Math.random() - 0.5) * 900,
          pulse: Math.random() * Math.PI * 2,
        });
      }

      gridLines.length = 0;
      for (let i = -6; i <= 6; i += 1) {
        gridLines.push({ axis: 'x', pos: i * 80 });
        gridLines.push({ axis: 'z', pos: i * 80 });
      }
    };

    const project = (x, y, z) => {
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      let rx = x * cosY - z * sinY;
      let rz = x * sinY + z * cosY;
      let ry = y * cosX - rz * sinX;
      rz = y * sinX + rz * cosX;

      const fov = 680;
      const scale = fov / (fov + rz);
      return {
        sx: cx + rx * scale,
        sy: cy + ry * scale * 0.88,
        scale,
        z: rz,
      };
    };

    const draw = () => {
      if (!reduced) {
        angleY += dim ? 0.0012 : 0.0022;
        angleX = 0.28 + Math.sin(angleY * 0.4) * 0.08;
      }

      ctx.fillStyle = dim ? 'rgba(3, 3, 4, 0.2)' : 'rgba(3, 3, 4, 0.45)';
      ctx.fillRect(0, 0, w, h);

      const projected = nodes.map((n) => {
        const p = project(n.x, n.y, n.z);
        return { ...n, ...p };
      });

      projected.sort((a, b) => a.z - b.z);

      gridLines.forEach((line) => {
        const pts = [];
        if (line.axis === 'x') {
          for (let z = -480; z <= 480; z += 40) {
            pts.push(project(line.pos, 220, z));
          }
        } else {
          for (let x = -480; x <= 480; x += 40) {
            pts.push(project(x, 220, line.pos));
          }
        }
        ctx.strokeStyle = dim ? 'rgba(212, 175, 55, 0.04)' : 'rgba(212, 175, 55, 0.09)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        pts.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        });
        ctx.stroke();
      });

      for (let i = 0; i < projected.length; i += 1) {
        for (let j = i + 1; j < projected.length; j += 1) {
          const a = projected[i];
          const b = projected[j];
          const dx = a.sx - b.sx;
          const dy = a.sy - b.sy;
          const dist = Math.hypot(dx, dy);
          if (dist < (dim ? 90 : 130)) {
            const alpha = (1 - dist / 130) * (dim ? 0.08 : 0.2) * Math.min(a.scale, b.scale);
            const g = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
            g.addColorStop(0, `rgba(240, 193, 75, ${alpha})`);
            g.addColorStop(1, `rgba(56, 189, 248, ${alpha * 0.5})`);
            ctx.strokeStyle = g;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      projected.forEach((n) => {
        n.pulse += 0.04;
        const size = (dim ? 1.2 : 2) * n.scale * (1 + Math.sin(n.pulse) * 0.15);
        const glow = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, size * 6);
        glow.addColorStop(0, `rgba(240, 193, 75, ${0.35 * n.scale})`);
        glow.addColorStop(0.5, `rgba(212, 175, 55, ${0.12 * n.scale})`);
        glow.addColorStop(1, 'rgba(240, 193, 75, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, size * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 235, 180, ${0.5 + n.scale * 0.5})`;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, size, 0, Math.PI * 2);
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    init();
    if (!reduced) draw();
    else {
      ctx.fillStyle = '#030304';
      ctx.fillRect(0, 0, w, h);
    }

    window.addEventListener('resize', init);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', init);
    };
  }, [dim]);

  return <canvas ref={ref} className="lux-bg-canvas" aria-hidden />;
}

/** Full-page 3D-style video background */
function LuxVideoBackground() {
  const videoRef = useRef(null);
  const [videoOk, setVideoOk] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;

    const onReady = () => {
      if (!v.videoWidth || v.duration < 0.5) {
        setVideoOk(false);
        return;
      }
      v.play()
        .then(() => setVideoOk(true))
        .catch(() => setVideoOk(false));
    };

    v.addEventListener('loadeddata', onReady);
    v.addEventListener('canplay', onReady);
    v.addEventListener('error', () => setVideoOk(false));

    if (v.readyState >= 2) onReady();

    return () => {
      v.removeEventListener('loadeddata', onReady);
      v.removeEventListener('error', () => setVideoOk(false));
    };
  }, []);

  return (
    <div className="lux-video-bg" aria-hidden>
      <NetworkCanvasFallback dim={videoOk} />
      <video
        ref={videoRef}
        className={`lux-video-bg__video${videoOk ? ' is-playing' : ''}`}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster=""
      >
        <source src={HERO_VIDEO_CDN} type="video/mp4" />
        <source src={HERO_VIDEO_LOCAL} type="video/mp4" />
      </video>
      <div className="lux-video-bg__overlay" />
      <div className="lux-video-bg__vignette" />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="lux-label">
      <span className="lux-label__line" />
      <span>{children}</span>
    </div>
  );
}

function FaqAccordion() {
  const [open, setOpen] = useState(0);
  return (
    <div className="lux-faq">
      {FAQ_ITEMS.map((item, i) => (
        <div key={item.q} className={`lux-faq__item${open === i ? ' is-open' : ''}`}>
          <button type="button" onClick={() => setOpen(open === i ? -1 : i)}>
            {item.q}
            <span>{open === i ? '−' : '+'}</span>
          </button>
          {open === i && <p>{item.a}</p>}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();

  if (user) {
    return (
      <div className="lux">
        <LuxVideoBackground />
        <div className="lux-wrap lux-hero lux-hero--solo">
          <SectionLabel>WELCOME BACK</SectionLabel>
          <h1 className="lux-hero__title">
            <span>YOUR</span>
            <span className="lux-outline">SAFEX</span>
            <span className="lux-gold">DASHBOARD</span>
          </h1>
          <p className="lux-hero__sub">Trading terminal ya account — jahan chaho jao.</p>
          <div className="lux-hero__btns">
            <Link to="/trade" className="lux-btn lux-btn--gold">
              LAUNCH APP →
            </Link>
            <Link to="/account" className="lux-btn lux-btn--ghost">
              MY ACCOUNT
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lux lux--fixed-header">
      <LuxVideoBackground />

      <header className="lux-header">
        <div className="lux-header__inner lux-wrap">
          <Link to="/" className="lux-logo">
            <span className="lux-logo__white">Safe</span>
            <span className="lux-logo__gold">X</span>
          </Link>
          <nav className="lux-nav">
            <a href="#features">PLATFORM</a>
            <a href="#process">PROCESS</a>
            <a href="#rates">RATES</a>
            <a href="#pricing">PRICING</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lux-header__right">
            <span className="lux-tag">SECURE STACK</span>
            <Link to="/signup" className="lux-btn lux-btn--gold lux-btn--sm">
              LAUNCH APP
            </Link>
          </div>
        </div>
      </header>

      <div className="lux-ticker" aria-hidden>
        <div className="lux-ticker__track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={`${t.pair}-${i}`} className="lux-ticker__item">
              {t.pair} <strong>{t.price}</strong>
              <em className={t.up ? 'up' : 'down'}>{t.chg}</em>
            </span>
          ))}
        </div>
      </div>

      <section className="lux-hero lux-wrap" id="home">
        <div className="lux-hero__copy lux-hero__copy--on-video">
          <SectionLabel>PREMIUM EXCHANGE PLATFORM</SectionLabel>
          <h1 className="lux-hero__title">
            <span>EXCHANGE</span>
            <span className="lux-outline">WITHOUT</span>
            <span className="lux-gold">LIMITS</span>
          </h1>
          <p className="lux-hero__sub">
            Institutional-grade crypto trading for everyone. Real-time charts, secure wallet,
            zero confusion — signup se trade tak ek hi SafeX experience.
          </p>
          <div className="lux-hero__btns">
            <Link to="/signup" className="lux-btn lux-btn--gold">
              START TRADING →
            </Link>
            <Link to="/login" className="lux-btn lux-btn--ghost">
              VIEW DEMO
            </Link>
          </div>
        </div>
      </section>

      <section className="lux-stats lux-wrap">
        {STATS.map((s) => (
          <div key={s.label} className="lux-stat">
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </section>

      <section className="lux-section lux-wrap" id="features">
        <SectionLabel>PLATFORM FEATURES</SectionLabel>
        <h2 className="lux-h2">BUILT FOR THE SERIOUS TRADER</h2>
        <p className="lux-lead">
          Pro infrastructure. Simple onboarding. Everything you need to trade on SafeX.
        </p>
        <div className="lux-features">
          {FEATURES.map((f) => (
            <article key={f.title} className="lux-feature lux-tilt-card">
              <div className="lux-feature__icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lux-section lux-wrap" id="process">
        <SectionLabel>PROCESS</SectionLabel>
        <h2 className="lux-h2">GO LIVE IN 4 STEPS</h2>
        <div className="lux-steps">
          {STEPS.map((s, i) => (
            <article key={s.num} className="lux-step">
              <span className="lux-step__bg">{s.num}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              {i < STEPS.length - 1 && <span className="lux-step__arrow" aria-hidden>→</span>}
            </article>
          ))}
        </div>
      </section>

      <section className="lux-section lux-wrap" id="rates">
        <SectionLabel>LIVE MARKET RATES</SectionLabel>
        <h2 className="lux-h2">TODAY&apos;S SPOT PAIRS</h2>
        <p className="lux-lead">Illustrative rates for landing preview — trade on app for live data.</p>
        <div className="lux-table-wrap">
          <table className="lux-table">
            <thead>
              <tr>
                <th>ASSET</th>
                <th>BUY</th>
                <th>SELL</th>
                <th>24H</th>
                <th>TREND</th>
              </tr>
            </thead>
            <tbody>
              {RATES.map((r) => (
                <tr key={r.code}>
                  <td>
                    <span className="lux-table__coin">{r.code.slice(0, 2)}</span>
                    <span>
                      <strong>{r.code}</strong>
                      <small>{r.name}</small>
                    </span>
                  </td>
                  <td>{r.buy}</td>
                  <td>{r.sell}</td>
                  <td className={r.up ? 'up' : 'down'}>{r.chg}</td>
                  <td>
                    <span className={`lux-bars${r.up ? ' up' : ' down'}`}>
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lux-section lux-wrap">
        <SectionLabel>CLIENT VOICES</SectionLabel>
        <h2 className="lux-h2">TRUSTED BY TRADERS</h2>
        <span className="lux-dot-deco" aria-hidden />
        <div className="lux-testimonials">
          {TESTIMONIALS.map((t) => (
            <blockquote key={t.name} className="lux-quote">
              <p>&ldquo;{t.text}&rdquo;</p>
              <footer>
                <span className="lux-quote__av">{t.initials}</span>
                <span>
                  <strong>{t.name}</strong>
                  <small>{t.role}</small>
                </span>
                <span className="lux-stars" aria-hidden>
                  ★★★★★
                </span>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="lux-section lux-wrap" id="pricing">
        <SectionLabel>PRICING</SectionLabel>
        <h2 className="lux-h2">SIMPLE, TRANSPARENT PRICING</h2>
        <p className="lux-lead">No hidden charges. Start free, scale when you need.</p>
        <div className="lux-pricing">
          {PLANS.map((p) => (
            <article key={p.name} className={`lux-plan${p.popular ? ' lux-plan--pop' : ''}`}>
              {p.popular && <span className="lux-plan__badge">MOST POPULAR</span>}
              <span className="lux-plan__tier">{p.name}</span>
              <div className="lux-plan__price">
                {p.price}
                <small>{p.period}</small>
              </div>
              <p>{p.desc}</p>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="lux-cta">
        <div className="lux-wrap lux-cta__inner">
          <SectionLabel>GET STARTED TODAY</SectionLabel>
          <h2 className="lux-h2 lux-h2--center">START EXCHANGING SMARTER</h2>
          <p className="lux-lead lux-lead--center">
            Join SafeX — setup minutes mein. Demo balance ke sath turant explore karein.
          </p>
          <div className="lux-hero__btns lux-hero__btns--center">
            <Link to="/signup" className="lux-btn lux-btn--gold">
              CREATE FREE ACCOUNT →
            </Link>
            <Link to="/admin/login" className="lux-btn lux-btn--ghost">
              STAFF LOGIN
            </Link>
          </div>
        </div>
      </section>

      <section className="lux-section lux-wrap lux-section--faq" id="faq">
        <SectionLabel>FAQ</SectionLabel>
        <h2 className="lux-h2">QUICK ANSWERS</h2>
        <FaqAccordion />
      </section>

      <footer className="lux-footer">
        <div className="lux-wrap lux-footer__row">
          <Link to="/" className="lux-logo">
            <span className="lux-logo__white">Safe</span>
            <span className="lux-logo__gold">X/</span>
          </Link>
          <nav className="lux-footer__nav">
            <a href="#features">PLATFORM</a>
            <a href="#process">PROCESS</a>
            <a href="#rates">RATES</a>
            <a href="#pricing">PRICING</a>
            <Link to="/login">LOGIN</Link>
          </nav>
          <span className="lux-footer__badge">SECURE PLATFORM</span>
        </div>
        <p className="lux-footer__copy lux-wrap">
          © {new Date().getFullYear()} SafeX Exchange. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
