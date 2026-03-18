import { useState, FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth'

export default function VerifyEmail() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const email = (location.state as any)?.email || ''

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/users/verify', { email, code })
      login(res.data.access_token, res.data.user_id, res.data.email)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResent(false)
    setError('')
    try {
      await api.post('/api/users/resend-code', { email, password: '' })
      setResent(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to resend')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Check your email</h1>
        <p className="text-gray-400 text-sm text-center mb-6">
          We sent a 6-digit code to <span className="text-white">{email}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 text-white text-center text-2xl tracking-widest focus:outline-none focus:border-red-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {resent && <p className="text-green-400 text-sm">New code sent!</p>}
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
        <p className="text-gray-500 text-sm text-center mt-4">
          Didn't receive it?{' '}
          <button onClick={handleResend} className="text-red-400 hover:text-red-300">
            Resend code
          </button>
        </p>
      </div>
    </div>
  )
}
