import { useCallback, useEffect, useState } from 'react'
import { listTournaments } from '../lib/tournaments'

const STATUS_LABEL = {
  draft: 'draft',
  ongoing: 'en curso',
  finished: 'terminado',
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function DashboardTournaments({ onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournaments, setTournaments] = useState([])

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await listTournaments()
      setTournaments(data)
      setStatus('ready')
    } catch (err) {
      if (err.code === 'PGRST301' || err.message?.toLowerCase().includes('jwt')) {
        await onSessionExpired()
        return
      }
      console.warn('tournaments load failed', err)
      setStatus('error')
    }
  }, [onSessionExpired])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div className="dashboard__section-head">
        <h2 className="dashboard__section-title">Torneos</h2>
        <button type="button" className="dashboard__btn" disabled>
          + Nuevo torneo
        </button>
      </div>

      {status === 'loading' && (
        <div>
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
        </div>
      )}

      {status === 'error' && (
        <div className="dashboard__state">
          <p>No pudimos cargar los torneos.</p>
          <button type="button" className="dashboard__btn" onClick={load}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' && tournaments.length === 0 && (
        <div className="dashboard__state">Todavía no hay torneos. Creá el primero.</div>
      )}

      {status === 'ready' && tournaments.length > 0 && (
        <div className="dashboard__tournaments-grid">
          {tournaments.map((t) => (
            <button
              key={t.id}
              type="button"
              className="dashboard__tournament-card"
              onClick={() => {
                // se cablea en Task 10 cuando agregamos selected state
              }}
            >
              <div className="dashboard__tournament-card-head">
                <span className="dashboard__tournament-name">{t.name}</span>
                <span
                  className="dashboard__tournament-status"
                  data-status={t.status}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
              <div className="dashboard__tournament-meta">
                tiempo {t.tiempo}
                {t.status === 'ongoing' && t.total_rounds && (
                  <> · R {t.current_round}/{t.total_rounds}</>
                )}
                {t.status === 'finished' && t.total_rounds && (
                  <> · {t.total_rounds} rondas</>
                )}
                {' · creado '}{formatDate(t.created_at)}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
