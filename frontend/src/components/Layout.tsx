import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/channels', label: 'Channels' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { email, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-8">
        <span className="text-lg font-bold text-white">📹 YT Agent</span>
        <div className="flex gap-4 flex-1">
          {NAV.map(n => (
            <Link
              key={n.href}
              to={n.href}
              className={`text-sm font-medium transition-colors ${
                pathname === n.href
                  ? 'text-red-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded px-2 py-1 transition"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">{children}</main>
    </div>
  )
}
