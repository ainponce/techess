import { useCallback, useEffect, useState } from 'react'
import { generateRound } from '../lib/pairing'
import { computeStandings } from '../lib/standings'
import {
  addParticipants,
  deleteTournament,
  getTournament,
  insertMatches,
  listMatches,
  listParticipants,
  removeParticipant,
  updateMatchResult,
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

function participantName(p) {
  return p?.registration?.nombre ?? '—'
}

function findParticipant(participants, id) {
  return participants.find((p) => p.id === id)
}

export default function TournamentDetail({ tournamentId, session, onBack, onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournament, setTournament] = useState(null)
  const [participants, setParticipants] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [editingRating, setEditingRating] = useState(null) // participant id
  const [editingValue, setEditingValue] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)
  const [matches, setMatches] = useState([])

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const [t, parts, ms] = await Promise.all([
        getTournament(tournamentId),
        listParticipants(tournamentId),
        listMatches(tournamentId),
      ])
      setTournament(t)
      setParticipants(parts)
      setMatches(ms)
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

  const handleStart = async () => {
    const active = participants.filter((p) => !p.withdrawn)
    if (active.length < 2) {
      setErrorMsg('Necesitás al menos 2 jugadores.')
      return
    }
    if (!confirm(`¿Empezar el torneo con ${active.length} jugadores? Después no se pueden agregar/quitar (sí retirar).`)) return
    try {
      const totalRounds = Math.max(1, Math.ceil(Math.log2(active.length)))
      const { matches } = generateRound(
        active.map((p) => ({ id: p.id, seed_rating: p.seed_rating, withdrawn: p.withdrawn })),
        [],
        { roundNumber: 1 },
      )
      await insertMatches(matches.map((m) => ({ ...m, tournament_id: tournament.id })))
      const next = await updateTournament(tournament.id, {
        status: 'ongoing',
        total_rounds: totalRounds,
        current_round: 1,
      })
      setTournament(next)
    } catch (err) {
      console.warn('start failed', err)
      setErrorMsg('No pudimos empezar el torneo.')
    }
  }

  const handleResult = async (matchId, result) => {
    const prev = matches
    setMatches((ms) => ms.map((m) => (m.id === matchId ? { ...m, result } : m)))
    try {
      await updateMatchResult(matchId, result)
    } catch (err) {
      setMatches(prev)
      setErrorMsg('No pudimos guardar el resultado.')
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

  const standings = participants.length > 0
    ? computeStandings(
        participants.map((p) => ({ id: p.id, seed_rating: p.seed_rating, withdrawn: p.withdrawn })),
        matches,
      )
    : []

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
              <button
                type="button"
                className="dashboard__btn"
                onClick={handleStart}
                disabled={participants.filter((p) => !p.withdrawn).length < 2}
                title={
                  participants.filter((p) => !p.withdrawn).length < 2
                    ? 'Necesitás al menos 2 jugadores'
                    : undefined
                }
              >
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

      {tournament.status !== 'draft' && standings.length > 0 && (
        <section>
          <div className="dashboard__section-head">
            <h3 className="dashboard__section-title">
              Standings · ronda {tournament.current_round} de {tournament.total_rounds ?? '?'}
            </h3>
          </div>
          <div className="dashboard__standings-wrap">
            <table className="dashboard__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jugador</th>
                  <th>Pts</th>
                  <th>Buchholz</th>
                  <th>Wins</th>
                  <th>Elo</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, idx) => {
                  const p = findParticipant(participants, row.participantId)
                  return (
                    <tr key={row.participantId} data-withdrawn={row.withdrawn}>
                      <td className="dashboard__muted">{idx + 1}</td>
                      <td>
                        {participantName(p)}
                        {row.withdrawn && (
                          <span className="dashboard__muted"> · retirado</span>
                        )}
                      </td>
                      <td>{row.points}</td>
                      <td>{row.buchholz}</td>
                      <td>{row.wins}</td>
                      <td>{row.seedRating}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tournament.status !== 'draft' && (
        <RoundSection
          tournament={tournament}
          participants={participants}
          matches={matches.filter((m) => m.round_number === tournament.current_round)}
          onResult={handleResult}
        />
      )}

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

function RoundSection({ tournament, participants, matches, onResult }) {
  if (matches.length === 0) return null
  const canEdit = tournament.status === 'ongoing'

  return (
    <section>
      <div className="dashboard__section-head">
        <h3 className="dashboard__section-title">
          Ronda {tournament.current_round}
          {tournament.total_rounds && ` de ${tournament.total_rounds}`}
        </h3>
        <button type="button" className="dashboard__btn" disabled>
          Generar ronda {tournament.current_round + 1}
        </button>
      </div>

      <div className="dashboard__pairings">
        <div className="dashboard__pairing dashboard__pairing--head">
          <span>#</span>
          <span>Blancas</span>
          <span>Negras</span>
          <span>Resultado</span>
        </div>
        {matches.map((m, idx) => {
          const white = findParticipant(participants, m.white_id)
          const black = findParticipant(participants, m.black_id)
          const isBye = m.result === 'bye'
          return (
            <div key={m.id} className="dashboard__pairing">
              <span className="dashboard__muted">{idx + 1}</span>
              <span>{white ? participantName(white) : <span className="dashboard__muted">BYE</span>}</span>
              <span>{black ? participantName(black) : <span className="dashboard__muted">BYE</span>}</span>
              <span className="dashboard__pairing-actions">
                {isBye ? (
                  <span className="dashboard__muted">1 punto (bye)</span>
                ) : (
                  <>
                    <ResultBtn current={m.result} mine="white" disabled={!canEdit} onClick={() => onResult(m.id, 'white')}>
                      1-0
                    </ResultBtn>
                    <ResultBtn current={m.result} mine="draw" disabled={!canEdit} onClick={() => onResult(m.id, 'draw')}>
                      ½
                    </ResultBtn>
                    <ResultBtn current={m.result} mine="black" disabled={!canEdit} onClick={() => onResult(m.id, 'black')}>
                      0-1
                    </ResultBtn>
                    {m.result && <span className="dashboard__pairing-check">✓</span>}
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ResultBtn({ current, mine, disabled, onClick, children }) {
  const isActive = current === mine
  return (
    <button
      type="button"
      className={`dashboard__btn dashboard__btn--xs ${isActive ? '' : 'dashboard__btn--ghost'}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
