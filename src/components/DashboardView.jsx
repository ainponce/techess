import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const TIEMPO_LABEL = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet' }

const COLUMNS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'tiempo', label: 'Tiempo' },
  { key: 'chess_username', label: 'Chess.com' },
  { key: 'rating', label: 'Rating' },
  { key: 'twitter_handle', label: 'Twitter' },
  { key: 'created_at', label: 'Fecha' },
]

function ratingOf(row) {
  return row[`chess_rating_${row.tiempo}`] ?? null
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function compareRows(a, b, key) {
  const va = key === 'rating' ? ratingOf(a) : a[key]
  const vb = key === 'rating' ? ratingOf(b) : b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1 // null al final
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'es')
}

export default function DashboardView({ session, onSignOut }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [rows, setRows] = useState([])

  const stats = useMemo(() => {
    if (rows.length === 0) {
      return { total: 0, byTiempo: { rapid: 0, blitz: 0, bullet: 0 }, topTiempo: 'rapid', avgRating: null, withChess: 0 }
    }
    const byTiempo = { rapid: 0, blitz: 0, bullet: 0 }
    for (const r of rows) {
      if (byTiempo[r.tiempo] != null) byTiempo[r.tiempo]++
    }
    const topTiempo = ['rapid', 'blitz', 'bullet'].reduce((top, t) => (byTiempo[t] > byTiempo[top] ? t : top), 'rapid')
    const ratingCol = `chess_rating_${topTiempo}`
    const ratings = rows.map((r) => r[ratingCol]).filter((v) => typeof v === 'number')
    const avgRating = ratings.length > 0 ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
    const withChess = rows.filter((r) => r.chess_username).length
    return { total: rows.length, byTiempo, topTiempo, avgRating, withChess }
  }, [rows])

  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const cmp = compareRows(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sort])

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const load = useCallback(async () => {
    setStatus('loading')
    const { data, error } = await supabase
      .from('techess_registrations')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      // JWT expirado / inválido → sesión expirada, mandar al login
      if (error.code === 'PGRST301' || error.message?.toLowerCase().includes('jwt')) {
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
        <>
          <div className="dashboard__stats">
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Total</span>
              <span className="dashboard__stat-value">{stats.total}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Rapid</span>
              <span className="dashboard__stat-value">{stats.byTiempo.rapid}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Blitz</span>
              <span className="dashboard__stat-value">{stats.byTiempo.blitz}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Bullet</span>
              <span className="dashboard__stat-value">{stats.byTiempo.bullet}</span>
            </div>
          </div>

          <div className="dashboard__stats-row">
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Rating prom · {stats.topTiempo}</span>
              <span className="dashboard__stat-value">{stats.avgRating ?? '—'}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Con chess.com</span>
              <span className="dashboard__stat-value">
                {stats.withChess} / {stats.total}
              </span>
              <span className="dashboard__stat-sub">
                {stats.total > 0 ? `${Math.round((stats.withChess / stats.total) * 100)}%` : '—'}
              </span>
            </div>
          </div>

          <div className="dashboard__table-wrap">
            <table className="dashboard__table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}>
                      {col.label}
                      {sort.key === col.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const rating = ratingOf(r)
                  return (
                    <tr key={r.id ?? `${r.email}-${r.created_at}`}>
                      <td>{r.nombre}</td>
                      <td>{r.email}</td>
                      <td>{TIEMPO_LABEL[r.tiempo] ?? r.tiempo}</td>
                      <td>
                        {r.chess_username ? (
                          <a
                            className="dashboard__chess"
                            href={r.chess_url ?? `https://www.chess.com/member/${r.chess_username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {r.chess_avatar && (
                              <img className="dashboard__chess-avatar" src={r.chess_avatar} alt="" />
                            )}
                            @{r.chess_username}
                          </a>
                        ) : (
                          <span className="dashboard__muted">—</span>
                        )}
                      </td>
                      <td>{rating ?? <span className="dashboard__muted">—</span>}</td>
                      <td>
                        {r.twitter_handle ? (
                          <a
                            className="dashboard__link"
                            href={`https://x.com/${r.twitter_handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            @{r.twitter_handle}
                          </a>
                        ) : (
                          <span className="dashboard__muted">—</span>
                        )}
                      </td>
                      <td>{formatDate(r.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="dashboard__footer">
            {sortedRows.length} registro{sortedRows.length === 1 ? '' : 's'} · ordenado por {COLUMNS.find((c) => c.key === sort.key)?.label}
          </div>
        </>
      )}
    </div>
  )
}
