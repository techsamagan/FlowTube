import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from './api/client'

interface AuthState {
  token: string | null
  userId: string | null
  email: string | null
}

interface AuthContextType extends AuthState {
  login: (token: string, userId: string, email: string) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => {
    const token = localStorage.getItem('token')
    // Set header synchronously so the very first API call is authenticated
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    return {
      token,
      userId: localStorage.getItem('userId'),
      email: localStorage.getItem('email'),
    }
  })

  useEffect(() => {
    if (auth.token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${auth.token}`
    } else {
      delete api.defaults.headers.common['Authorization']
    }
  }, [auth.token])

  const login = (token: string, userId: string, email: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('userId', userId)
    localStorage.setItem('email', email)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setAuth({ token, userId, email })
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userId')
    localStorage.removeItem('email')
    delete api.defaults.headers.common['Authorization']
    setAuth({ token: null, userId: null, email: null })
  }

  return (
    <AuthContext.Provider value={{ ...auth, login, logout, isAuthenticated: !!auth.token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
