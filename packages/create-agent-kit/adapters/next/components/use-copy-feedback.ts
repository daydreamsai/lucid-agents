'use client';

import { useCallback, useState } from 'react';

export function useCopyFeedback() {
  const [copied, setCopied] = useState(false);

  const copyValue = useCallback(async (value?: string) => {
    if (!value) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Silently ignore copy failures; manual copy is still possible.
    }
  }, []);

  return { copied, copyValue };
}
