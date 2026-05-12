import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import DashboardLogin from './components/DashboardLogin'
import DashboardView from './components/DashboardView'
import './Dashboard.css'

export default function Dashboard() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSignIn = async ({ email, password }) => {
    setSessionExpired(false)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.code === 'invalid_credentials' || error.message?.toLowerCase().includes('invalid login')) {
        throw new Error('Email o password incorrectos.')
      }
      throw new Error('No pudimos entrar. Probá de nuevo.')
    }
  }

  const handleSignOut = async () => {
    setSessionExpired(false)
    await supabase.auth.signOut()
  }

  const handleSessionExpired = async () => {
    setSessionExpired(true)
    await supabase.auth.signOut()
  }

  if (!ready) {
    return <div className="dashboard-login" />
  }

  if (!session) {
    return (
      <DashboardLogin
        onSignIn={handleSignIn}
        hint={sessionExpired ? 'Tu sesión expiró, volvé a entrar.' : null}
      />
    )
  }

  return (
    <DashboardView
      session={session}
      onSignOut={handleSignOut}
      onSessionExpired={handleSessionExpired}
    />
  )
}
