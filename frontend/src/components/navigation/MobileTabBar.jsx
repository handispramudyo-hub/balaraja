import { NavLink } from 'react-router-dom';
import { MOBILE_TABS, findActiveTab } from '../../navigation/navConfig';

/**
 * Tab bar bawah mobile.
 *
 * Lima titik masuk utama, target sentuh minimum 44px, dan penanda aktif
 * memakai ikon terisi + warna aksen (bukan hanya latar) supaya tetap
 * terbaca di layar kecil.
 */
export default function MobileTabBar({ pathname }) {
  const activeTab = findActiveTab(pathname);

  return (
    <nav
      aria-label="Navigasi utama"
      className="no-print mobile-bottom-nav fixed bottom-0 inset-x-0 z-50 bg-surface border-t border-outline-variant flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {MOBILE_TABS.map((tab) => {
        const active = activeTab?.id === tab.id;
        return (
          <NavLink
            key={tab.id}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            className="flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 transition-colors active:bg-surface-container"
          >
            <span
              className={`material-symbols-outlined text-[24px] leading-none ${
                active ? 'text-accent' : 'text-on-surface-variant'
              }`}
              aria-hidden="true"
              style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {tab.icon}
            </span>
            <span
              className={`text-[10px] leading-tight ${
                active ? 'text-accent font-semibold' : 'text-on-surface-variant'
              }`}
            >
              {tab.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
