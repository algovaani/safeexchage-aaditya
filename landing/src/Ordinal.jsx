/** Renders ordinals like 1ˢᵗ with the suffix as superscript. */
export function Ordinal({ n, suffix = 'st', className = '' }) {
  return (
    <span className={`ordinal ${className}`.trim()}>
      {n}
      <sup className="ordinal-sup">{suffix}</sup>
    </span>
  );
}

const ORDINAL_RE = /(\d+)(st|nd|rd|th)/gi;

/** Parses plain text and superscripts ordinals (e.g. "India's 1st exchange"). */
export function OrdText({ children, className = '' }) {
  if (typeof children !== 'string') return children;

  const parts = children.split(ORDINAL_RE);
  if (parts.length === 1) return children;

  return (
    <span className={className || undefined}>
      {parts.map((part, i) => {
        if (i % 3 === 1) {
          return <Ordinal key={i} n={part} suffix={parts[i + 1]} />;
        }
        if (i % 3 === 2) return null;
        return part;
      })}
    </span>
  );
}

/** Stat / hero size ordinal */
export function OrdinalLg({ n, suffix = 'st' }) {
  return <Ordinal n={n} suffix={suffix} className="ordinal--lg" />;
}
