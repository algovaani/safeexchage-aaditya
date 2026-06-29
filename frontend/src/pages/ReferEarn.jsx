import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Gift, Loader2, MessageCircle, Send, Share2, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api, parseApiResponse } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  buildInviteUrl,
  normalizeReferralCode,
  telegramShareUrl,
  whatsAppShareUrl,
} from '../utils/referral.js';
import './ReferEarn.css';

function CopyButton({ label, text, variant = 'primary', onCopied }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className={`refer-copy-btn${variant === 'ghost' ? ' refer-copy-btn--ghost' : ''}`}
      onClick={copy}
      disabled={!text}
    >
      <Copy size={14} aria-hidden />
      {copied ? 'Copied' : label}
    </button>
  );
}

export default function ReferEarn({ embedded = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState({ invitedCount: 0 });
  const [loading, setLoading] = useState(true);

  const code = normalizeReferralCode(user?.referralCode || '');
  const inviteUrl = useMemo(() => (code ? buildInviteUrl(code) : ''), [code]);
  const shareText = `Join me on SafeXchange — sign up with my referral code ${code}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/auth/referral')
      .then((r) => {
        if (cancelled) return;
        setStats(parseApiResponse(r.data) || { invitedCount: 0 });
      })
      .catch(() => {
        if (!cancelled) setStats({ invitedCount: 0 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!code) {
    return (
      <div className="refer-page">
        <div className="refer-card refer-empty">
          <p>Your referral code is not available yet. Try signing out and back in.</p>
          <Link to="/account/profile" className="text-accent text-sm mt-3 inline-block">
            Back to profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="refer-page">
      {!embedded && (
        <div className="mb-2">
          <h1 className="text-xl font-medium text-text-primary mb-1">Refer &amp; Earn</h1>
          <p className="text-sm text-text-secondary">Share your code and invite friends to SafeXchange</p>
        </div>
      )}

      <section className="refer-hero">
        <p className="refer-hero__eyebrow">
          <Gift size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
          Refer &amp; Earn
        </p>
        <h2 className="refer-hero__title">Invite friends, grow together</h2>
        <p className="refer-hero__sub">
          Share your personal link or code. When someone registers using it, they are linked to your
          account automatically
          {stats.referralRewardUsdt > 0 ? (
            <> and you earn <strong>{stats.referralRewardUsdt} USDT</strong> per signup</>
          ) : (
            '.'
          )}
        </p>
      </section>

      <div className="refer-grid">
        <div className="refer-card">
          <h3>Your referral code</h3>
          <div className="refer-code-box">
            <span className="refer-code-box__value">{code}</span>
            <CopyButton label="Copy code" text={code} onCopied={() => toast.success('Referral code copied to clipboard.')} />
          </div>

          <h3>Share registration link</h3>
          <div className="refer-link-row">
            <input className="refer-link-input" readOnly value={inviteUrl} aria-label="Referral link" />
            <CopyButton label="Copy link" text={inviteUrl} onCopied={() => toast.success('Invite link copied to clipboard.')} />
          </div>

          <div className="refer-share-row">
            <a
              className="refer-copy-btn refer-copy-btn--ghost no-underline"
              href={whatsAppShareUrl(shareText, inviteUrl)}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={14} aria-hidden />
              WhatsApp
            </a>
            <a
              className="refer-copy-btn refer-copy-btn--ghost no-underline"
              href={telegramShareUrl(inviteUrl, shareText)}
              target="_blank"
              rel="noreferrer"
            >
              <Send size={14} aria-hidden />
              Telegram
            </a>
            <CopyButton
              label="Share text"
              text={`${shareText}\n${inviteUrl}`}
              variant="ghost"
              onCopied={() => toast.success('Share message copied to clipboard.')}
            />
            {typeof navigator !== 'undefined' && navigator.share && (
              <button
                type="button"
                className="refer-copy-btn refer-copy-btn--ghost"
                onClick={() =>
                  navigator.share({ title: 'SafeXchange Invite', text: shareText, url: inviteUrl }).catch(() => {})
                }
              >
                <Share2 size={14} aria-hidden />
                Share…
              </button>
            )}
          </div>

          <p className="text-xs text-text-muted mt-4 mb-0">
            Friends can also open{' '}
            <span className="text-accent font-mono">/invite/{code}</span> — signup opens with your code filled in.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="refer-card">
            <h3>Scan to register</h3>
            <div className="refer-qr-wrap">
              <QRCodeSVG value={inviteUrl} size={160} level="M" includeMargin />
              <p>Friend scans → opens signup with code <strong>{code}</strong></p>
            </div>
          </div>

          <div className="refer-card">
            <div className="refer-stat">
              {loading ? (
                <Loader2 size={22} className="animate-spin mx-auto text-text-muted" />
              ) : (
                <>
                  <div className="refer-stat__value">{stats.invitedCount ?? 0}</div>
                  <div className="refer-stat__label">
                    <Users size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                    Friends invited
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="refer-card">
        <h3>How it works</h3>
        <ol className="refer-steps">
          <li>
            <span className="refer-steps__num">1</span>
            <span>Copy your link or code and send it to friends via WhatsApp, Telegram, or social media.</span>
          </li>
          <li>
            <span className="refer-steps__num">2</span>
            <span>They open the link — the signup page opens with your referral code already filled in.</span>
          </li>
          <li>
            <span className="refer-steps__num">3</span>
            <span>
              After they complete registration, they appear in your invited friends count
              {stats.referralRewardUsdt > 0
                ? ` and you receive ${stats.referralRewardUsdt} USDT in your wallet (shown in Reports).`
                : '.'}
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
