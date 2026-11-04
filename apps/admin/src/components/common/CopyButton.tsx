import { useState } from 'react';

import styles from '@/styles/shared.module.css';

// Copies an id (Razorpay ids, order ids) so the admin can paste it into the
// Razorpay dashboard or a support thread. `label` names what is copied, for
// screen readers and tests: "Copy Razorpay payment".
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. no HTTPS): the id is still on screen to select.
    }
  };

  return (
    <button
      type="button"
      className={styles.copyButton}
      aria-label={`Copy ${label}`}
      onClick={() => void copy()}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// An id shown in full, with a copy button next to it.
export function CopyableId({ value, label }: { value: string | null; label: string }) {
  if (!value) return <>—</>;
  return (
    <>
      <span className={styles.mono}>{value}</span> <CopyButton value={value} label={label} />
    </>
  );
}
