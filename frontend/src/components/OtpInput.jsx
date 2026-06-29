import { useRef } from 'react';
import './OtpInput.css';

export default function OtpInput({ value, onChange, disabled = false, idPrefix = 'otp' }) {
  const inputsRef = useRef([]);

  function handleChange(index, raw) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[index] = digit;
    onChange(next);
    if (digit && index < value.length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, value.length);
    if (!pasted) return;
    const next = [...value];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    onChange(next);
    const focusIndex = Math.min(pasted.length, value.length - 1);
    inputsRef.current[focusIndex]?.focus();
  }

  return (
    <div className="otp-input" onPaste={handlePaste}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          id={`${idPrefix}-${i}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

export function otpToString(digits) {
  return digits.join('');
}
