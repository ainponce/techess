import { useCallback, useEffect, useState } from 'react'
import { createTournament, listTournaments } from '../lib/tournaments'
import TournamentDetail from './TournamentDetail'

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

export default function DashboardTournaments({ session, onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournaments, setTournaments] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)

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

  if (selectedId) {
    return (
      <TournamentDetail
        tournamentId={selectedId}
        session={session}
        onBack={() => {
          setSelectedId(null)
          load()
        }}
        onSessionExpired={onSessionExpired}
      />
    )
  }

  return (
    <>
      <div className="dashboard__section-head">
        <h2 className="dashboard__section-title">Torneos</h2>
        <button
          type="button"
          className="dashboard__btn"
          onClick={() => setShowNewModal(true)}
        >
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
              onClick={() => setSelectedId(t.id)}
            >
              <div className="dashboard__tournament-card-head">
                <span className="dashboard__tournament-name">{t.name}</span>
                <span className="dashboard__tournament-status" data-status={t.status}>
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

      {showNewModal && (
        <NewTournamentModal
          onClose={() => setShowNewModal(false)}
          onCreated={(t) => {
            setShowNewModal(false)
            setSelectedId(t.id)
            load()
          }}
          createdBy={session.user.id}
        />
      )}
    </>
  )
}

function NewTournamentModal({ onClose, onCreated, createdBy }) {
  const [name, setName] = useState('')
  const [tiempo, setTiempo] = useState('rapid')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const t = await createTournament({ name, tiempo, createdBy })
      onCreated(t)
    } catch (err) {
      setError('No pudimos crear el torneo. Probá de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <div className="dashboard__modal-backdrop" onClick={onClose}>
      <form
        className="dashboard__modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 className="dashboard__modal-title">Nuevo torneo</h3>
        <label className="dashboard__modal-label">
          Nombre
          <input
            required
            className="dashboard__input"
            placeholder="Rapid de Mayo 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="dashboard__modal-label">
          Tiempo
          <select
            className="dashboard__input"
            value={tiempo}
            onChange={(e) => setTiempo(e.target.value)}
          >
            <option value="rapid">Rapid</option>
            <option value="blitz">Blitz</option>
            <option value="bullet">Bullet</option>
          </select>
        </label>
        {error && <span className="dashboard__error">{error}</span>}
        <div className="dashboard__modal-actions">
          <button
            type="button"
            className="dashboard__btn dashboard__btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button type="submit" className="dashboard__btn" disabled={submitting || !name.trim()}>
            {submitting ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}
