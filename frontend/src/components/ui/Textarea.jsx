import cn from '../../lib/cn';

/** Area teks multi-baris. */
export default function Textarea({ className = '', rows = 3, invalid = false, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'w-full rounded-field border bg-surface-container-lowest text-sm text-on-surface px-3 py-2.5',
        'placeholder:text-on-surface-variant/60 transition-colors resize-y',
        'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
        'disabled:bg-surface-container disabled:text-on-surface-variant/60 disabled:cursor-not-allowed',
        invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-outline-variant',
        className
      )}
      {...rest}
    />
  );
}
