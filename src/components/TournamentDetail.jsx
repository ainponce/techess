import { useCallback, useEffect, useState } from 'react'
import {
  addParticipants,
  deleteTournament,
  getTournament,
  listParticipants,
  removeParticipant,
  updateParticipantRating,
  updateTournament,
  withdrawParticipant,
} from '../lib/tournaments'
import TournamentPlayerPicker from './TournamentPlayerPicker'

const STATUS_LABEL = {
  draft: 'draft',
  ongoing: 'en curso',
  finished: 'terminado',
}

export default function TournamentDetail({ tournamentId, session, onBack, onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournament, setTournament] = useState(null)
  const [participants, setParticipants] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [editingRating, setEditingRating] = useState(null) // participant id
  const [editingValue, setEditingValue] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const [t, parts] = await Promise.all([
        getTournament(tournamentId),
        listParticipants(tournamentId),
      ])
      setTournament(t)
      setParticipants(parts)
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

  const handleAddParticipants = async (items) => {
    try {
      await addParticipants(tournament.id, items)
      setShowPicker(false)
      await load()
    } catch (err) {
      setErrorMsg('No pudimos agregar a esos jugadores.')
    }
  }

  const handleRemove = async (participantId) => {
    if (!confirm('¿Sacar a este jugador del torneo?')) return
    try {
      await removeParticipant(participantId)
      await load()
    } catch (err) {
      setErrorMsg('No pudimos sacar al jugador.')
    }
  }

  const handleWithdraw = async (participantId) => {
    if (!confirm('¿Retirar a este jugador? Sus partidos pasados quedan en standings.')) return
    try {
      await withdrawParticipant(participantId)
      await load()
    } catch (err) {
      setErrorMsg('No pudimos retirar al jugador.')
    }
  }

  const handleSaveRating = async (participantId) => {
    const value = parseInt(editingValue, 10)
    if (Number.isNaN(value) || value < 0 || value > 4000) {
      setErrorMsg('Rating tiene que estar entre 0 y 4000.')
      return
    }
    try {
      await updateParticipantRating(participantId, value)
      setEditingRating(null)
      setEditingValue('')
      await load()
    } catch (err) {
      setErrorMsg('No pudimos guardar el rating.')
    }
  }

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

  const sortedParticipants = [...participants].sort(
    (a, b) => b.seed_rating - a.seed_rating,
  )

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
            <span>{participants.filter((p) => !p.withdrawn).length} jugadores</span>
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

      <section>
        <div className="dashboard__section-head">
          <h3 className="dashboard__section-title">Jugadores ({participants.length})</h3>
          {tournament.status === 'draft' && (
            <button
              type="button"
              className="dashboard__btn"
              onClick={() => setShowPicker(true)}
            >
              + Agregar inscriptos
            </button>
          )}
        </div>

        {sortedParticipants.length === 0 && (
          <div className="dashboard__state">Sin jugadores. Agregá algunos para empezar.</div>
        )}

        {sortedParticipants.length > 0 && (
          <div className="dashboard__participants">
            {sortedParticipants.map((p) => {
              const reg = p.registration
              const hasChessRating = typeof reg?.[`chess_rating_${tournament.tiempo}`] === 'number'
              return (
                <div key={p.id} className="dashboard__participant" data-withdrawn={p.withdrawn}>
                  <span className="dashboard__participant-name">{reg?.nombre ?? '—'}</span>
                  <span className="dashboard__participant-chess">
                    {reg?.chess_username ? `@${reg.chess_username}` : '—'}
                  </span>
                  <span className="dashboard__participant-rating">
                    {editingRating === p.id ? (
                      <>
                        <input
                          className="dashboard__input dashboard__input--inline"
                          type="number"
                          min="0"
                          max="4000"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                        />
                        <button
                          type="button"
                          className="dashboard__btn dashboard__btn--xs"
                          onClick={() => handleSaveRating(p.id)}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          className="dashboard__btn dashboard__btn--ghost dashboard__btn--xs"
                          onClick={() => {
                            setEditingRating(null)
                            setEditingValue('')
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        {hasChessRating
                          ? `${tournament.tiempo} ${p.seed_rating}`
                          : `sin chess · ${p.seed_rating}`}
                        {tournament.status === 'draft' && !hasChessRating && (
                          <button
                            type="button"
                            className="dashboard__btn dashboard__btn--ghost dashboard__btn--xs"
                            onClick={() => {
                              setEditingRating(p.id)
                              setEditingValue(String(p.seed_rating))
                            }}
                          >
                            Editar
                          </button>
                        )}
                      </>
                    )}
                  </span>
                  <span className="dashboard__participant-actions">
                    {tournament.status === 'draft' && (
                      <button
                        type="button"
                        className="dashboard__btn dashboard__btn--ghost dashboard__btn--xs"
                        onClick={() => handleRemove(p.id)}
                      >
                        Quitar
                      </button>
                    )}
                    {tournament.status === 'ongoing' && !p.withdrawn && (
                      <button
                        type="button"
                        className="dashboard__btn dashboard__btn--ghost dashboard__btn--xs"
                        onClick={() => handleWithdraw(p.id)}
                      >
                        Retirar
                      </button>
                    )}
                    {p.withdrawn && <span className="dashboard__muted">retirado</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Standings y rondas en tasks siguientes */}

      {showPicker && (
        <TournamentPlayerPicker
          tournament={tournament}
          alreadyAddedIds={participants.map((p) => p.registration_id)}
          onCancel={() => setShowPicker(false)}
          onConfirm={handleAddParticipants}
        />
      )}
    </div>
  )
}
