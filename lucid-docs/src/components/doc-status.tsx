type DocumentationStatus =
  | 'stable'
  | 'next'
  | 'experimental'
  | 'deprecated'
  | 'hosted';

type DocumentationProduct = 'sdk' | 'router' | 'hosted-platform' | 'provider';

const statusCopy: Record<
  DocumentationStatus,
  { label: string; description: string; className: string }
> = {
  stable: {
    label: 'Stable',
    description: 'Publicly installable and verified against the npm release.',
    className:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  },
  next: {
    label: 'Next',
    description:
      'Available from this repository and not guaranteed in the current npm release.',
    className:
      'border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-200',
  },
  experimental: {
    label: 'Experimental',
    description: 'The API may change and requires explicit production review.',
    className:
      'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  },
  deprecated: {
    label: 'Deprecated',
    description: 'Kept for migration context; do not use for new projects.',
    className: 'border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200',
  },
  hosted: {
    label: 'Hosted product',
    description:
      'Operated separately from the open-source SDK with its own availability.',
    className:
      'border-violet-500/30 bg-violet-500/10 text-violet-900 dark:text-violet-200',
  },
};

const productLabels: Record<DocumentationProduct, string> = {
  sdk: 'Open-source SDK',
  router: 'x402 Router',
  'hosted-platform': 'Hosted Lucid Platform',
  provider: 'External provider',
};

export function DocStatus({
  status,
  verifiedVersion,
  verifiedAt,
  product,
}: {
  status: DocumentationStatus;
  verifiedVersion: string;
  verifiedAt: string;
  product: DocumentationProduct;
}) {
  const copy = statusCopy[status];
  return (
    <aside
      className={`mb-8 rounded-lg border px-4 py-3 text-sm ${copy.className}`}
      aria-label="Documentation status"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
        <span>{copy.label}</span>
        <span aria-hidden="true">·</span>
        <span>{productLabels[product]}</span>
        <span aria-hidden="true">·</span>
        <span>Verified {verifiedVersion}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={verifiedAt}>{verifiedAt}</time>
      </div>
      <p className="mt-1 opacity-80">{copy.description}</p>
    </aside>
  );
}
