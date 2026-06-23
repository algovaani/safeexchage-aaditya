import Image from 'next/image';

const ICON_SIZES = { sm: 56, md: 72, lg: 88 } as const;
const LOGO_ASPECT = 1407 / 768;

type BrandLogoProps = {
  size?: keyof typeof ICON_SIZES;
  className?: string;
};

export default function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  const iconHeight = ICON_SIZES[size] ?? ICON_SIZES.md;
  const iconWidth = Math.round(iconHeight * LOGO_ASPECT);

  return (
    <span
      className={`brand-logo-wrap brand-logo-wrap--${size} ${className}`.trim()}
      aria-label="SafeXchange"
    >
      <Image
        src="/images/safexchange-logo-source.jpeg"
        alt="SafeXchange"
        width={iconWidth}
        height={iconHeight}
        className="brand-logo__icon"
        style={{ ['--brand-logo-h' as string]: `${iconHeight}px` }}
        priority
      />
    </span>
  );
}
