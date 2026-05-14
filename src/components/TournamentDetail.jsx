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
import ConfirmModal from './ConfirmModal'

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
  const [warningMsg, setWarningMsg] = useState(null)
  const [matches, setMatches] = useState([])
  const [confirmState, setConfirmState] = useState(null)

  const closeConfirm = () => setConfirmState(null)
  const runConfirm = () => {
    const fn = confirmState?.onConfirm
    setConfirmState(null)
    fn?.()
  }

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

  const handleRemove = (participantId) => {
    setConfirmState({
      title: 'Sacar jugador',
      body: '¿Sacar a este jugador del torneo?',
      confirmLabel: 'Sacar',
      onConfirm: async () => {
        try {
          await removeParticipant(participantId)
          await load()
        } catch (err) {
          setErrorMsg('No pudimos sacar al jugador.')
        }
      },
    })
  }

  const handleWithdraw = (participantId) => {
    setConfirmState({
      title: 'Retirar jugador',
      body: '¿Retirar a este jugador? Sus partidos pasados quedan en standings.',
      confirmLabel: 'Retirar',
      onConfirm: async () => {
        try {
          await withdrawParticipant(participantId)
          await load()
        } catch (err) {
          setErrorMsg('No pudimos retirar al jugador.')
        }
      },
    })
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

  const handleDelete = () => {
    setConfirmState({
      title: 'Eliminar torneo',
      body: `¿Eliminar '${tournament.name}'? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tone: 'destructive',
      onConfirm: async () => {
        try {
          await deleteTournament(tournament.id)
          onBack()
        } catch (err) {
          setErrorMsg('No pudimos eliminar el torneo.')
        }
      },
    })
  }

  const handleFinish = () => {
    setConfirmState({
      title: 'Cerrar torneo',
      body: `¿Cerrar el torneo '${tournament.name}'?`,
      confirmLabel: 'Cerrar torneo',
      onConfirm: async () => {
        try {
          const next = await updateTournament(tournament.id, { status: 'finished' })
          setTournament(next)
        } catch (err) {
          setErrorMsg('No pudimos cerrar el torneo.')
        }
      },
    })
  }

  const handleStart = () => {
    const active = participants.filter((p) => !p.withdrawn)
    if (active.length < 2) {
      setErrorMsg('Necesitás al menos 2 jugadores.')
      return
    }
    setConfirmState({
      title: 'Empezar torneo',
      body: `¿Empezar el torneo con ${active.length} jugadores? Después no se pueden agregar/quitar (sí retirar).`,
      confirmLabel: 'Empezar',
      onConfirm: async () => {
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
          await load()
        } catch (err) {
          console.warn('start failed', err)
          setErrorMsg('No pudimos empezar el torneo.')
        }
      },
    })
  }

  const handleGenerateNext = async () => {
    const currentMatches = matches.filter((m) => m.round_number === tournament.current_round)
    const incomplete = currentMatches.filter((m) => m.result === null && m.white_id != null && m.black_id != null)
    if (incomplete.length > 0) {
      setErrorMsg('Falta cargar resultados de la ronda actual.')
      return
    }
    if (tournament.current_round >= tournament.total_rounds) {
      setErrorMsg('Esta era la última ronda. Cerrá el torneo cuando quieras.')
      return
    }

    const nextRound = tournament.current_round + 1
    const active = participants.filter((p) => !p.withdrawn)
    try {
      const { matches: newMatches, warnings } = generateRound(
        active.map((p) => ({ id: p.id, seed_rating: p.seed_rating, withdrawn: p.withdrawn })),
        matches,
        { roundNumber: nextRound },
      )
      await insertMatches(newMatches.map((m) => ({ ...m, tournament_id: tournament.id })))
      const next = await updateTournament(tournament.id, { current_round: nextRound })
      setTournament(next)
      await load()
      if (warnings.length > 0) {
        setWarningMsg(`Ronda generada: ${warnings.join('; ')}`)
      } else {
        setWarningMsg(null)
      }
    } catch (err) {
      console.warn('generate next failed', err)
      setErrorMsg('No pudimos generar la próxima ronda.')
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
      {warningMsg && <div className="dashboard__warning">{warningMsg}</div>}

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
          onGenerateNext={handleGenerateNext}
          canGenerate={
            tournament.status === 'ongoing' &&
            tournament.current_round < (tournament.total_rounds ?? 0) &&
            matches
              .filter((m) => m.round_number === tournament.current_round)
              .every((m) => m.result !== null)
          }
        />
      )}

      {tournament.status !== 'draft' && tournament.current_round > 1 && (
        <PastRounds
          tournament={tournament}
          participants={participants}
          matches={matches}
        />
      )}

      {showPicker && (
        <TournamentPlayerPicker
          tournament={tournament}
          alreadyAddedIds={participants.map((p) => p.registration_id)}
          onCancel={() => setShowPicker(false)}
          onConfirm={handleAddParticipants}
          onSessionExpired={onSessionExpired}
        />
      )}

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        body={confirmState?.body}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        tone={confirmState?.tone}
        onConfirm={runConfirm}
        onCancel={closeConfirm}
      />
    </div>
  )
}

function RoundSection({ tournament, participants, matches, onResult, onGenerateNext, canGenerate }) {
  if (matches.length === 0) return null
  const canEdit = tournament.status === 'ongoing'

  return (
    <section>
      <div className="dashboard__section-head">
        <h3 className="dashboard__section-title">
          Ronda {tournament.current_round}
          {tournament.total_rounds && ` de ${tournament.total_rounds}`}
        </h3>
        <button
          type="button"
          className="dashboard__btn"
          onClick={onGenerateNext}
          disabled={!canGenerate}
          title={!canGenerate ? 'Falta cargar resultados' : undefined}
        >
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

function PastRounds({ tournament, participants, matches }) {
  const [openRound, setOpenRound] = useState(null)
  const rounds = []
  for (let r = 1; r < tournament.current_round; r++) {
    rounds.push(r)
  }
  if (rounds.length === 0) return null

  return (
    <section className="dashboard__past-rounds">
      <h3 className="dashboard__section-title">Rondas pasadas</h3>
      {rounds.map((r) => {
        const roundMatches = matches.filter((m) => m.round_number === r)
        const isOpen = openRound === r
        return (
          <div key={r} className="dashboard__accordion">
            <button
              type="button"
              className="dashboard__accordion-head"
              onClick={() => setOpenRound(isOpen ? null : r)}
            >
              {isOpen ? '▼' : '▶'} Ronda {r} (completa)
            </button>
            {isOpen && (
              <div className="dashboard__pairings dashboard__pairings--past">
                {roundMatches.map((m, idx) => {
                  const white = findParticipant(participants, m.white_id)
                  const black = findParticipant(participants, m.black_id)
                  return (
                    <div key={m.id} className="dashboard__pairing">
                      <span className="dashboard__muted">{idx + 1}</span>
                      <span>{white ? participantName(white) : 'BYE'}</span>
                      <span>{black ? participantName(black) : 'BYE'}</span>
                      <span className="dashboard__muted">
                        {m.result === 'white' && '1-0'}
                        {m.result === 'black' && '0-1'}
                        {m.result === 'draw' && '½-½'}
                        {m.result === 'bye' && '1 punto'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
