export default function Input({
  label,
  error,
  className = '',
  id,
  hint,
  ...props
}) {
  const inputId = id || props.name;

  return (
    <div className={`w-full ${className}`}>
      {label && <label htmlFor={inputId} className="ui-label">{label}</label>}
      <input id={inputId} className={`ui-input ${error ? 'border-loss' : ''}`} {...props} />
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
      {error && <p className="text-xs text-loss mt-1">{error}</p>}
    </div>
  );
}
