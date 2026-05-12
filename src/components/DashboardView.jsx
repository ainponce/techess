import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function DashboardView({ session, onSignOut }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [rows, setRows] = useState([])

  const load = useCallback(async () => {
    setStatus('loading')
    const { data, error } = await supabase
      .from('techess_registrations')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      // 401/403 → sesión expirada
      if (error.code === '401' || error.code === '403' || error.status === 401 || error.status === 403) {
        await supabase.auth.signOut()
        return
      }
      console.warn('dashboard load failed', error)
      setStatus('error')
      return
    }
    setRows(data ?? [])
    setStatus('ready')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">techess · dashboard</span>
        <div className="dashboard__user">
          <span>{session.user.email ?? '—'}</span>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={load}>
            Recargar
          </button>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onSignOut}>
            Salir
          </button>
        </div>
      </div>

      {status === 'loading' && (
        <div>
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
        </div>
      )}

      {status === 'error' && (
        <div className="dashboard__state">
          <p>No pudimos cargar los registros.</p>
          <button type="button" className="dashboard__btn" onClick={load}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="dashboard__state">Todavía no se anotó nadie.</div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <pre style={{ color: 'var(--muted)', fontSize: 12, overflow: 'auto' }}>
          {JSON.stringify(rows, null, 2)}
        </pre>
      )}
    </div>
  )
}
