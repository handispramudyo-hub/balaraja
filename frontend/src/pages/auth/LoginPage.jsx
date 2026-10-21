import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import api from '../../services/api'
import useAuthStore from '../../stores/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/login', { email, password })
      setAuth(data.user, data.token)
      toast.success('Selamat datang!')
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Email atau kata sandi salah')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 antialiased bg-gradient-to-br from-primary-container to-surface-tint">
      <div className="bg-surface w-full max-w-md rounded-[24px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex flex-col items-center">
        <div className="mb-6 w-24 h-24 rounded-2xl overflow-hidden shadow-sm flex items-center justify-center bg-surface-container-lowest">
          <img alt="BALARAJA Logo" className="w-full h-full object-cover" src="/bj.png" />
        </div>

        <div className="text-center mb-8 w-full">
          <h1 className="text-3xl font-bold text-primary mb-2">BALARAJA</h1>
          <p className="text-sm text-on-surface-variant">Sistem Manajemen Toko</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-5">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined">mail</span>
            </div>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full pl-11 pr-4 py-3.5 bg-surface-container-low border border-outline-variant rounded-xl text-on-surface text-base placeholder-outline focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="Email Address"
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined">lock</span>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full pl-11 pr-12 py-3.5 bg-surface-container-low border border-outline-variant rounded-xl text-on-surface text-base placeholder-outline focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="Password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-outline hover:text-on-surface transition-colors"
              tabIndex={-1}
            >
              <span className="material-symbols-outlined" id="visibility-icon">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>

          <div className="flex justify-end pt-1">
            <a className="text-xs font-medium text-primary hover:underline" href="#">
              Lupa Password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-semibold text-lg py-4 rounded-xl shadow-md hover:shadow-lg hover:bg-primary-container focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all active:scale-[0.98] mt-2 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-on-surface-variant">
            Butuh bantuan?{' '}
            <a className="text-primary font-medium hover:underline" href="#">
              Hubungi Admin
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
