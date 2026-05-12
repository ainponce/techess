import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function TournamentPlayerPicker({ tournament, alreadyAddedIds, onCancel, onConfirm }) {
  const [registrations, setRegistrations] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('techess_registrations')
        .select('id, nombre, email, chess_username, chess_rating_rapid, chess_rating_blitz, chess_rating_bullet')
        .order('nombre', { ascending: true })
      if (!active) return
      if (!error) setRegistrations(data ?? [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  const ratingCol = `chess_rating_${tournament.tiempo}`
  const available = useMemo(() => {
    const blocked = new Set(alreadyAddedIds)
    return registrations.filter((r) => !blocked.has(r.id))
  }, [registrations, alreadyAddedIds])

  const filtered = useMemo(() => {
    const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const q = norm(query.trim())
    if (!q) return available
    return available.filter((r) => {
      const haystack = norm([r.nombre, r.email, r.chess_username].filter(Boolean).join(' '))
      return haystack.includes(q)
    })
  }, [available, query])

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    const items = [...selected].map((id) => {
      const reg = registrations.find((r) => r.id === id)
      const ratingFromChess = reg?.[ratingCol]
      const seed = typeof ratingFromChess === 'number' ? ratingFromChess : 1200
      return { registration_id: id, seed_rating: seed }
    })
    try {
      await onConfirm(items)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dashboard__modal-backdrop" onClick={onCancel}>
      <div className="dashboard__modal dashboard__modal--lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="dashboard__modal-title">Agregar inscriptos</h3>
        <input
          className="dashboard__input"
          type="search"
          placeholder="Buscar por nombre, email, chess.com…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="dashboard__picker-list">
          {loading && <div className="dashboard__state">Cargando…</div>}
          {!loading && filtered.length === 0 && (
            <div className="dashboard__state">No hay inscriptos disponibles.</div>
          )}
          {!loading &&
            filtered.map((r) => {
              const rating = r[ratingCol]
              return (
                <label key={r.id} className="dashboard__picker-row">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <span className="dashboard__picker-name">{r.nombre}</span>
                  <span className="dashboard__picker-chess">
                    {r.chess_username ? `@${r.chess_username}` : '—'}
                  </span>
                  <span className="dashboard__picker-rating">
                    {typeof rating === 'number' ? `${tournament.tiempo} ${rating}` : 'sin chess'}
                  </span>
                </label>
              )
            })}
        </div>
        <div className="dashboard__modal-actions">
          <button
            type="button"
            className="dashboard__btn dashboard__btn--ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="dashboard__btn"
            onClick={handleConfirm}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? 'Agregando…' : `Agregar ${selected.size || ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
