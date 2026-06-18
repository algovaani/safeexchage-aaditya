const ICON_SIZES = { sm: 34, md: 42, lg: 50 };
const TEXT_SIZES = { sm: '0.95rem', md: '1.1rem', lg: '1.25rem' };

export default function BrandLogo({ size = 'md', className = '', showText = true }) {
  const iconHeight = ICON_SIZES[size] ?? ICON_SIZES.md;
  const textSize = TEXT_SIZES[size] ?? TEXT_SIZES.md;

  return (
    <span
      className={`brand-logo-wrap brand-logo-wrap--${size} ${className}`.trim()}
      aria-label="SafeXchange"
    >
      <img
        src="/images/safexchange-logo.png"
        alt=""
        aria-hidden
        className="brand-logo__icon"
        style={{ height: iconHeight }}
      />
      {showText && (
        <span className="brand-logo__text" style={{ fontSize: textSize }}>
          <span className="brand-logo__safe">Safe</span>
          <span className="brand-logo__x">X</span>
          <span className="brand-logo__change">change</span>
        </span>
      )}
    </span>
  );
}
