'use client';
/**
 * A long value (reference, NEAR account, run ID) on one line: truncated with an ellipsis when
 * it does not fit, full value in the tooltip, and a copy button. Copy feedback is announced.
 */
import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from './icons';

export function CopyValue({ value, label, size = 'md' }: { value: string; label: string; size?: 'sm' | 'md' | 'lg' | 'fit' }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard unavailable (permissions): the full value stays visible in the tooltip.
    }
  };
  return (
    <span className={`copy-value cv-${size}`}>
      <span className="cv-text mono" title={value}>{value}</span>
      <button type="button" className="cv-btn" onClick={copy} aria-label={`Copy ${label} ${value}`} title={`Copy ${label}`}>
        {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? `${label} copied` : ''}</span>
    </span>
  );
}
