import styles from '@/styles/shared.module.css';

// One labelled text or number box, used by the edit forms in the vendor and
// ustaad popups (decision 0058 Tasks 10 and 11).
export function FormField({
  id,
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  maxLength,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: 'text' | 'number';
  maxLength?: number;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type={type}
        step={type === 'number' ? 'any' : undefined}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
