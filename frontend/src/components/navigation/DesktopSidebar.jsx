import { NavLink } from 'react-router-dom';
import { NAV_SECTIONS } from '../../navigation/navConfig';

/**
 * Sidebar desktop.
 *
 * Semua menu diturunkan dari `navConfig`, jadi menambah halaman cukup di
 * satu tempat. Rute aktif ditandai dengan bar aksen di kiri, bukan hanya
 * perubahan warna latar — perbedaan warna saja mudah terlewat.
 */
export default function DesktopSidebar({ user }) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="no-print desktop-sidebar fixed left-0 top-0 bottom-0 w-[17rem] z-45 bg-nav text-on-nav flex flex-col border-r border-nav-border"
    >
      <div className="h-16 flex items-center gap-3 px-5 border-b border-nav-border shrink-0">
        <img src="/bj.png" alt="" className="w-9 h-9 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="font-nota-display text-lg leading-none tracking-wide text-on-nav-strong">
            BALARAJA
          </p>
          <p className="text-[11px] text-on-nav/70 mt-0.5">Sistem Manajemen</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `nav-item relative flex items-center gap-3 px-3 h-10 rounded-field text-sm font-medium transition-colors ${
              isActive ? 'nav-item-active text-on-nav-strong' : 'text-on-nav hover:bg-nav-hover'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className="material-symbols-outlined text-[22px]"
                aria-hidden="true"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                home
              </span>
              <span>Beranda</span>
            </>
          )}
        </NavLink>

        {NAV_SECTIONS.map((section) => (
          <div key={section.id} className="mt-5">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-nav/55">
              {section.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `nav-item relative flex items-center gap-3 px-3 h-10 rounded-field text-sm font-medium transition-colors ${
                        isActive ? 'nav-item-active text-on-nav-strong' : 'text-on-nav hover:bg-nav-hover'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className="material-symbols-outlined text-[22px]"
                          aria-hidden="true"
                          style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-nav-border flex items-center gap-3">
        <div className="w-9 h-9 shrink-0 rounded-full bg-accent flex items-center justify-center text-white font-semibold text-sm">
          {user?.name?.charAt(0)?.toUpperCase() || 'A'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-on-nav-strong truncate">{user?.name || 'Admin'}</p>
          <p className="text-[11px] text-on-nav/70 truncate">{user?.role || 'Administrator'}</p>
        </div>
      </div>
    </nav>
  );
}
