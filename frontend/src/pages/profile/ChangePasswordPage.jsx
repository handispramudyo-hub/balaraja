import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { toast } from 'sonner';

export default function ChangePasswordPage() {
  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    new_password_confirmation: '',
  });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/change-password', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Kata sandi berhasil diubah');
      setForm({ current_password: '', new_password: '', new_password_confirmation: '' });
    },
    onError: (err) => {
      const msg = err.response?.data?.message;
      const errs = err.response?.data?.errors;
      if (errs) {
        const first = Object.values(errs)[0];
        toast.error(Array.isArray(first) ? first[0] : first);
      } else {
        toast.error(msg || 'Gagal mengubah kata sandi');
      }
    },
  });

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggle = (key) => () => setShow((s) => ({ ...s, [key]: !s[key] }));

  const onsubmit = (e) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';

  const field = (label, key, showKey, toggleKey) => (
    <div>
      <label className="block text-sm font-medium text-on-surface mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show[showKey] ? 'text' : 'password'}
          value={form[key]}
          onChange={update(key)}
          className={`${inputClass} pr-12`}
          autoComplete={key === 'current_password' ? 'current-password' : 'new-password'}
        />
        <button
          type="button"
          onClick={toggle(toggleKey)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
          tabIndex={-1}
        >
          <span className="material-symbols-outlined">{show[showKey] ? 'visibility_off' : 'visibility'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined">lock</span>
        </div>
        <div>
          <h1 className="text-lg font-bold text-on-surface">Ubah Kata Sandi</h1>
          <p className="text-sm text-on-surface-variant">Perbarui kata sandi akun • kamu tidak perlu login ulang</p>
        </div>
      </div>

      <form onSubmit={onsubmit} className="bg-surface rounded-2xl border border-outline-variant/30 shadow-sm p-5 space-y-4">
        {field('Kata Sandi Saat Ini', 'current_password', 'current', 'current')}
        {field('Kata Sandi Baru', 'new_password', 'next', 'next')}
        {field('Konfirmasi Kata Sandi Baru', 'new_password_confirmation', 'confirm', 'confirm')}

        <div className="text-xs text-on-surface-variant flex items-start gap-1.5 mt-1">
          <span className="material-symbols-outlined text-[16px]">info</span>
          <span>Minimal 8 karakter. Setelah diubah, gunakan kata sandi baru saat login berikutnya.</span>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full px-4 py-3 rounded-xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {mutation.isPending ? (
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined">save</span>
          )}
          Simpan Kata Sandi
        </button>
      </form>
    </div>
  );
}
