import type { InputHTMLAttributes } from 'react';

interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Current amount in whole dollars, or null when empty. */
  value: number | null;
  /** Called with the parsed amount (null when the field is cleared). */
  onValueChange: (value: number | null) => void;
}

/**
 * Text input for a dollar amount. Always renders a `$` prefix in front of the
 * value and displays the number with thousands separators (e.g. $50,000).
 * The underlying value is a plain number so callers never deal with formatting.
 */
export function MoneyInput({ value, onValueChange, className = '', ...rest }: MoneyInputProps) {
  const display = value === null || Number.isNaN(value) ? '' : value.toLocaleString('en-US');

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mute">
        $
      </span>
      <input
        {...rest}
        inputMode="numeric"
        className="w-full rounded-xl border border-line bg-white py-3 pl-7 pr-3 text-sm outline-none ring-accent transition focus:border-accent focus:ring-1"
        value={display}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^0-9]/g, '');
          onValueChange(digits === '' ? null : Number(digits));
        }}
      />
    </div>
  );
}
