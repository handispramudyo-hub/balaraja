import { useNavigate } from 'react-router-dom';
import Sheet from '../ui/Sheet';
import { QUICK_ACTIONS } from '../../navigation/navConfig';

/**
 * Action sheet aksi cepat.
 *
 * Dipakai oleh tombol mengambang di mobile dan tombol "Aksi Cepat" di
 * desktop, jadi daftar aksi hanya ada di satu tempat.
 */
export default function QuickAddSheet({ open, onClose }) {
  const navigate = useNavigate();

  const go = (to) => {
    onClose();
    navigate(to);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Aksi Cepat"
      description="Buat transaksi baru tanpa perlu mencari menunya."
      icon="bolt"
    >
      <ul className="grid grid-cols-2 gap-2.5">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              onClick={() => go(action.to)}
              className="w-full min-h-[84px] flex flex-col items-center justify-center gap-1.5 rounded-card border border-outline-variant/70 bg-surface-container-lowest active:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[26px] text-accent" aria-hidden="true">
                {action.icon}
              </span>
              <span className="text-xs font-medium text-on-surface">{action.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
