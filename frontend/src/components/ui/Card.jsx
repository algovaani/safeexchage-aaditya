export default function Card({ children, className = '', padding = '' }) {
  return (
    <div className={`ui-card ${padding} ${className}`.trim()}>
      {children}
    </div>
  );
}
