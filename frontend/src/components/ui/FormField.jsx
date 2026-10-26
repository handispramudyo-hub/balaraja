import { useId } from 'react';
import cn from '../../lib/cn';

/**
 * Pembungkus satu field form: label, kontrol, petunjuk, dan pesan error.
 *
 * `htmlFor` disambungkan otomatis lewat `useId`, jadi kontrol yang dirender
 * sebagai children tetap terhubung dengan labelnya untuk screen reader.
 */
export default function FormField({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  className = '',
  children,
  action,
}) {
  const generatedId = useId();
  const fieldId = htmlFor || generatedId;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || action) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label
              htmlFor={fieldId}
              className="text-xs font-medium text-on-surface-variant tracking-wide"
            >
              {label}
              {required && <span className="text-danger ml-0.5">*</span>}
            </label>
          )}
          {action}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-2xs text-danger flex items-start gap-1">
          <span className="material-symbols-outlined text-sm mt-px" aria-hidden="true">
            error
          </span>
          <span>{error}</span>
        </p>
      ) : (
        hint && <p className="text-2xs text-on-surface-variant/80">{hint}</p>
      )}
    </div>
  );
}
