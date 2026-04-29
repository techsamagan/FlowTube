import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Channels from './pages/Channels'
import ChannelDetail from './pages/ChannelDetail'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import Landing from './pages/Landing'

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function HomeRoute() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated
    ? <Layout><Dashboard /></Layout>
    : <Landing />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/" element={<HomeRoute />} />
      <Route path="/channels" element={
        <ProtectedRoute>
          <Layout><Channels /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/channels/:id" element={
        <ProtectedRoute>
          <Layout><ChannelDetail /></Layout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
