import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { ALL_NAV_ITEMS } from '../../navigation/navConfig';
import { formatCurrency } from '../../lib/format';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href]';

/**
 * Palet pencarian global (Ctrl/Cmd + K).
 *
 * Mencari produk, pelanggan, supplier, dan halaman sekaligus. Ini
 * sickness pertama di aplikasi ini: dulu "Toko" disebut "Pelanggan" di
 * sebagian tempat dan "Store" di tempat lain, jadi orang tidak tahu
 * harus mengetik apa di kotak pencarian.
 */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return undefined;
    }

    const raf = requestAnimationFrame(() => inputRef.current?.focus());

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      // Fokus tidak boleh keluar dari palet saat dialog ini terbuka.
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Master data kecil, jadi diambil sekali saat palet dibuka.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      api.get('/customers').then((res) => res.data).catch(() => []),
      api.get('/suppliers').then((res) => res.data).catch(() => []),
    ]).then(([customerList, supplierList]) => {
      if (cancelled) return;
      setCustomers(Array.isArray(customerList) ? customerList : []);
      setSuppliers(Array.isArray(supplierList) ? supplierList : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Produk pakai pencarian di server supaya tidak menarik seluruh katalog.
  useEffect(() => {
    if (!open) return undefined;
    const term = query.trim();
    if (term.length < 2) {
      setProducts([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get('/products', { params: { search: term }, signal: controller.signal })
        .then((res) => setProducts(Array.isArray(res.data) ? res.data.slice(0, 8) : []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const groups = [];

    const pages = ALL_NAV_ITEMS.filter((item) =>
      term ? item.label.toLowerCase().includes(term) : false
    );
    if (pages.length) {
      groups.push({
        title: 'Halaman',
        items: pages.map((item) => ({
          id: `page-${item.id}`,
          label: item.label,
          icon: item.icon,
          hint: 'Halaman',
          run: () => navigate(item.to),
        })),
      });
    }

    if (products.length) {
      groups.push({
        title: 'Produk',
        items: products.map((product) => ({
          id: `produk-${product.id}`,
          label: product.name,
          icon: 'inventory_2',
          hint: product.code ? `Kode ${product.code}` : 'Produk',
          run: () => navigate(`/produk/${product.id}`),
        })),
      });
    }

    const matchedCustomers = customers
      .filter((customer) =>
        term
          ? `${customer.name} ${customer.code ?? ''}`.toLowerCase().includes(term)
          : false
      )
      .slice(0, 6);
    if (matchedCustomers.length) {
      groups.push({
        title: 'Pelanggan',
        items: matchedCustomers.map((customer) => ({
          id: `pelanggan-${customer.id}`,
          label: customer.name,
          icon: 'store',
          hint: customer.code ? `Kode ${customer.code}` : 'Pelanggan',
          run: () => navigate(`/toko?search=${encodeURIComponent(customer.name)}`),
        })),
      });
    }

    const matchedSuppliers = suppliers
      .filter((supplier) =>
        term ? `${supplier.name}`.toLowerCase().includes(term) : false
      )
      .slice(0, 6);
    if (matchedSuppliers.length) {
      groups.push({
        title: 'Supplier',
        items: matchedSuppliers.map((supplier) => ({
          id: `supplier-${supplier.id}`,
          label: supplier.name,
          icon: 'local_shipping',
          hint: Number(supplier.total_payable) > 0
            ? `Utang ${formatCurrency(supplier.total_payable)}`
            : 'Supplier',
          run: () => navigate(`/supplier?search=${encodeURIComponent(supplier.name)}`),
        })),
      });
    }

    return groups;
  }, [query, products, customers, suppliers, navigate]);

  const flat = useMemo(() => results.flatMap((group) => group.items), [results]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const item = listRef.current?.querySelector('[data-active="true"]');
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (flat.length ? (index + 1) % flat.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (flat.length ? (index - 1 + flat.length) % flat.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = flat[activeIndex];
      if (target) {
        onClose();
        target.run();
      }
    }
  };

  let cursor = -1;

  return (
    <div
      className="no-print fixed inset-0 z-[90] bg-black/45 backdrop-blur-[2px] flex items-start justify-center pt-[10vh] px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian global"
        className="w-full max-w-xl rounded-modal bg-surface-container-lowest border border-outline-variant shadow-overlay overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 h-14 border-b border-outline-variant/60">
          <span className="material-symbols-outlined text-xl text-on-surface-variant" aria-hidden="true">
            search
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cari produk, pelanggan, supplier, atau halaman…"
            aria-label="Kata kunci pencarian"
            className="flex-1 bg-transparent outline-none text-sm text-on-surface placeholder:text-on-surface-variant/70"
          />
          <kbd className="hidden sm:block text-[10px] text-on-surface-variant border border-outline-variant rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {loading && (
            <p className="px-3 py-3 text-xs text-on-surface-variant">Mencari…</p>
          )}

          {!loading && flat.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-on-surface-variant">
              {query.trim().length < 2
                ? 'Ketik minimal 2 huruf untuk mencari.'
                : 'Tidak ada hasil yang cocok.'}
            </p>
          )}

          {results.map((group) => (
            <div key={group.title} className="mb-1.5">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant/75">
                {group.title}
              </p>
              {group.items.map((item) => {
                cursor += 1;
                const index = cursor;
                const active = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-active={active ? 'true' : 'false'}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onClose();
                      item.run();
                    }}
                    className={`w-full flex items-center gap-3 px-3 h-11 rounded-field text-left text-sm transition-colors ${
                      active
                        ? 'bg-surface-container-high text-on-surface'
                        : 'text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="text-[11px] text-on-surface-variant truncate max-w-[40%]">{item.hint}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
