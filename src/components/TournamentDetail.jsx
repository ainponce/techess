import { useCallback, useEffect, useState } from 'react'
import { deleteTournament, getTournament, updateTournament } from '../lib/tournaments'

const STATUS_LABEL = {
  draft: 'draft',
  ongoing: 'en curso',
  finished: 'terminado',
}

export default function TournamentDetail({ tournamentId, session, onBack, onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournament, setTournament] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const t = await getTournament(tournamentId)
      setTournament(t)
      setStatus('ready')
    } catch (err) {
      if (err.code === 'PGRST301' || err.message?.toLowerCase().includes('jwt')) {
        await onSessionExpired()
        return
      }
      console.warn('tournament load failed', err)
      setStatus('error')
    }
  }, [tournamentId, onSessionExpired])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar '${tournament.name}'? Esta acción no se puede deshacer.`)) return
    try {
      await deleteTournament(tournament.id)
      onBack()
    } catch (err) {
      setErrorMsg('No pudimos eliminar el torneo.')
    }
  }

  const handleFinish = async () => {
    if (!confirm(`¿Cerrar el torneo '${tournament.name}'?`)) return
    try {
      const next = await updateTournament(tournament.id, { status: 'finished' })
      setTournament(next)
    } catch (err) {
      setErrorMsg('No pudimos cerrar el torneo.')
    }
  }

  if (status === 'loading') {
    return (
      <div>
        <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
          ← Volver
        </button>
        <div className="dashboard__skeleton-row" />
        <div className="dashboard__skeleton-row" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
          ← Volver
        </button>
        <div className="dashboard__state">
          <p>No pudimos cargar el torneo.</p>
          <button type="button" className="dashboard__btn" onClick={load}>Reintentar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard__tournament-detail">
      <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
        ← Volver
      </button>

      <header className="dashboard__detail-head">
        <div>
          <h2 className="dashboard__detail-title">{tournament.name}</h2>
          <div className="dashboard__detail-meta">
            <span className="dashboard__tournament-status" data-status={tournament.status}>
              {STATUS_LABEL[tournament.status] ?? tournament.status}
            </span>
            <span>tiempo {tournament.tiempo}</span>
            {tournament.status === 'ongoing' && tournament.total_rounds && (
              <span>ronda {tournament.current_round}/{tournament.total_rounds}</span>
            )}
            {tournament.status === 'finished' && tournament.total_rounds && (
              <span>{tournament.total_rounds} rondas</span>
            )}
          </div>
        </div>
        <div className="dashboard__detail-actions">
          {tournament.status === 'draft' && (
            <>
              <button type="button" className="dashboard__btn" disabled>
                Empezar torneo
              </button>
              <button
                type="button"
                className="dashboard__btn dashboard__btn--ghost"
                onClick={handleDelete}
              >
                Eliminar
              </button>
            </>
          )}
          {tournament.status === 'ongoing' && (
            <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={handleFinish}>
              Cerrar torneo
            </button>
          )}
        </div>
      </header>

      {errorMsg && <div className="dashboard__error">{errorMsg}</div>}

      {/* Secciones siguientes se agregan en tasks posteriores */}
      <div className="dashboard__state">Jugadores, rondas y standings — pronto.</div>
    </div>
  )
}
