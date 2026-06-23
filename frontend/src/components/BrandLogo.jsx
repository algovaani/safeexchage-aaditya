const ICON_SIZES = { sm: 56, md: 72, lg: 88 };

export default function BrandLogo({ size = 'md', className = '' }) {
  const iconHeight = ICON_SIZES[size] ?? ICON_SIZES.md;

  return (
    <span
      className={`brand-logo-wrap brand-logo-wrap--${size} ${className}`.trim()}
      aria-label="SafeXchange"
    >
      <img
        src="/images/safexchange-logo-source.jpeg"
        alt="SafeXchange"
        className="brand-logo__icon"
        style={{ ['--brand-logo-h']: `${iconHeight}px` }}
      />
    </span>
  );
}
