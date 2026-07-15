import { useState } from 'react';
import { coinIconFallbackLabel, resolveCoinIconUrl } from '../utils/coinIcon.js';
import './CoinIcon.css';

/**
 * Shared coin / commodity icon used across Markets, Trade, Admin, etc.
 * Pass either a trading-pair-like object or discrete fields.
 */
export default function CoinIcon({
  symbol,
  imageUrl,
  coingeckoId,
  type,
  name,
  size = 28,
  className = '',
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const row = { symbol, imageUrl, coingeckoId, type, name };
  const iconUrl = imgFailed ? null : resolveCoinIconUrl(row);
  const fallback = coinIconFallbackLabel(row);
  const isCommodity = type === 'commodity' || String(symbol || '').endsWith('INR');

  return (
    <span
      className={`coin-icon${isCommodity ? ' coin-icon--commodity' : ''}${iconUrl ? ' coin-icon--img' : ''} ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      title={name || symbol || ''}
    >
      {iconUrl ? (
        <img src={iconUrl} alt="" loading="lazy" onError={() => setImgFailed(true)} />
      ) : (
        fallback
      )}
    </span>
  );
}

/** Icon + primary label (and optional secondary line). */
export function CoinLabel({
  symbol,
  imageUrl,
  coingeckoId,
  type,
  name,
  label,
  sub,
  size = 28,
  className = '',
}) {
  return (
    <span className={`coin-label ${className}`.trim()}>
      <CoinIcon
        symbol={symbol}
        imageUrl={imageUrl}
        coingeckoId={coingeckoId}
        type={type}
        name={name}
        size={size}
      />
      <span className="coin-label__text">
        <span className="coin-label__primary">{label || name || symbol}</span>
        {sub != null && sub !== '' ? <span className="coin-label__sub">{sub}</span> : null}
      </span>
    </span>
  );
}
