import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { averageRatingByTiempo, onlineRatio } from '../lib/registration-stats'

const TIEMPO_LABEL = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet' }

const COLUMNS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'tiempo', label: 'Tiempo' },
  { key: 'chess_username', label: 'Chess.com' },
  { key: 'rating', label: 'Rating' },
  { key: 'twitter_handle', label: 'Twitter' },
  { key: 'created_at', label: 'Fecha' },
]

function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D+/g, '')
  return digits ? `https://wa.me/${digits}` : null
}

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
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'es')
}

export default function DashboardRegistrations({ onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [rows, setRows] = useState([])

  const stats = useMemo(() => {
    const byTiempo = { rapid: 0, blitz: 0, bullet: 0 }
    for (const r of rows) {
      if (byTiempo[r.tiempo] != null) byTiempo[r.tiempo]++
    }
    return {
      total: rows.length,
      byTiempo,
      avgRapid: averageRatingByTiempo(rows, 'rapid'),
      avgBlitz: averageRatingByTiempo(rows, 'blitz'),
      avgBullet: averageRatingByTiempo(rows, 'bullet'),
      online: onlineRatio(rows),
    }
  }, [rows])

  const [tournamentStats, setTournamentStats] = useState({
    count: null,
    avgPlayers: null,
  })

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

  const [query, setQuery] = useState('')

  const filteredRows = useMemo(() => {
    const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const q = norm(query.trim())
    if (!q) return sortedRows
    return sortedRows.filter((r) => {
      const haystack = norm([r.nombre, r.email, r.phone, r.chess_username].filter(Boolean).join(' '))
      return haystack.includes(q)
    })
  }, [sortedRows, query])

  const load = useCallback(async () => {
    setStatus('loading')
    const { data, error } = await supabase
      .from('techess_registrations')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      if (error.code === 'PGRST301' || error.message?.toLowerCase().includes('jwt')) {
        await onSessionExpired()
        return
      }
      console.warn('registrations load failed', error)
      setStatus('error')
      return
    }
    setRows(data ?? [])
    setStatus('ready')
  }, [onSessionExpired])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    const fetchTournamentStats = async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, status, tournament_participants(count)')
        .neq('status', 'draft')
      if (cancelled) return
      if (error) {
        console.warn('tournament stats load failed', error)
        setTournamentStats({ count: null, avgPlayers: null })
        return
      }
      const count = data.length
      if (count === 0) {
        setTournamentStats({ count: 0, avgPlayers: null })
        return
      }
      const totalPlayers = data.reduce(
        (acc, t) => acc + (t.tournament_participants?.[0]?.count ?? 0),
        0,
      )
      setTournamentStats({
        count,
        avgPlayers: Math.round(totalPlayers / count),
      })
    }
    fetchTournamentStats()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
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

          <div className="dashboard__stats dashboard__stats--three">
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Rating prom · Rapid</span>
              <span className="dashboard__stat-value">{stats.avgRapid ?? '—'}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Rating prom · Blitz</span>
              <span className="dashboard__stat-value">{stats.avgBlitz ?? '—'}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Rating prom · Bullet</span>
              <span className="dashboard__stat-value">{stats.avgBullet ?? '—'}</span>
            </div>
          </div>

          <div className="dashboard__stats dashboard__stats--three">
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Ratio online</span>
              <span className="dashboard__stat-value">
                {stats.online.withAny} / {stats.online.total}
              </span>
              <span className="dashboard__stat-sub">
                {stats.online.pct != null ? `${stats.online.pct}%` : '—'}
              </span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Torneos organizados</span>
              <span className="dashboard__stat-value">
                {tournamentStats.count ?? '—'}
              </span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Prom jugadores/torneo</span>
              <span className="dashboard__stat-value">
                {tournamentStats.avgPlayers ?? '—'}
              </span>
            </div>
          </div>

          <input
            className="dashboard__search"
            type="search"
            placeholder="Buscar por nombre, email, teléfono, chess.com…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {filteredRows.length === 0 ? (
            <div className="dashboard__state">Nada coincide con esa búsqueda.</div>
          ) : (
            <>
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
                    {filteredRows.map((r) => {
                      const rating = ratingOf(r)
                      return (
                        <tr key={r.id ?? `${r.email}-${r.created_at}`}>
                          <td>{r.nombre}</td>
                          <td>{r.email}</td>
                          <td>
                            {r.phone ? (
                              <a
                                className="dashboard__link"
                                href={waLink(r.phone) ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {r.phone}
                              </a>
                            ) : (
                              <span className="dashboard__muted">—</span>
                            )}
                          </td>
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
                {filteredRows.length} registro{filteredRows.length === 1 ? '' : 's'} · ordenado por {COLUMNS.find((c) => c.key === sort.key)?.label}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
