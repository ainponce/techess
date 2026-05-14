import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeLichessHandle, LICHESS_API } from '../lib/lichess'

const INITIAL = {
  nombre: '',
  email: '',
  phone: '',
  chessUsername: '',
  lichessUsername: '',
  twitterHandle: '',
  tiempo: 'rapid',
}

const TIEMPOS = [
  { value: 'rapid', label: 'Rápido', statsKey: 'chess_rapid', lichessKey: 'rapid' },
  { value: 'blitz', label: 'Blitz', statsKey: 'chess_blitz', lichessKey: 'blitz' },
  { value: 'bullet', label: 'Bullet', statsKey: 'chess_bullet', lichessKey: 'bullet' },
]

const CHESS_COM_API = 'https://api.chess.com/pub/player'

// Normalizes a chess.com handle or profile URL into the bare lowercase username
// that the PubAPI expects.
function normalizeHandle(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const noAt = trimmed.replace(/^@/, '')
  const fromUrl = noAt.match(/chess\.com\/member\/([^/?#]+)/i)
  return (fromUrl ? fromUrl[1] : noAt).toLowerCase()
}

function normalizeTwitter(raw) {
  const t = raw.trim().replace(/^@/, '')
  const fromUrl = t.match(/(?:x|twitter)\.com\/([^/?#]+)/i)
  return (fromUrl ? fromUrl[1] : t).replace(/^@/, '')
}

// Strip everything except digits and a single leading +. The DB CHECK
// expects '^\+?[0-9]{7,20}$', so we normalize before insert.
function normalizePhone(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D+/g, '')
  return (hasPlus ? '+' : '') + digits
}

export default function RegistrationForm({ onSubmitted }) {
  const [form, setForm] = useState(INITIAL)
  const [chessLookup, setChessLookup] = useState({ status: 'idle' })
  const [lichessLookup, setLichessLookup] = useState({ status: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  // Debounced chess.com profile + stats fetch. Aborts stale requests so the
  // latest keystroke always wins even if earlier ones are slow.
  useEffect(() => {
    const handle = normalizeHandle(form.chessUsername)
    if (!handle) {
      setChessLookup({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setChessLookup({ status: 'loading' })
      try {
        const profileRes = await fetch(`${CHESS_COM_API}/${encodeURIComponent(handle)}`, {
          signal: controller.signal,
        })
        if (profileRes.status === 404) {
          setChessLookup({ status: 'notfound' })
          return
        }
        if (!profileRes.ok) throw new Error(`HTTP ${profileRes.status}`)
        const profile = await profileRes.json()
        const statsRes = await fetch(`${CHESS_COM_API}/${encodeURIComponent(handle)}/stats`, {
          signal: controller.signal,
        })
        const stats = statsRes.ok ? await statsRes.json() : null
        setChessLookup({ status: 'found', profile, stats })
      } catch (err) {
        if (err.name === 'AbortError') return
        console.warn('chess.com lookup failed', err)
        setChessLookup({ status: 'error' })
      }
    }, 450)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [form.chessUsername])

  useEffect(() => {
    const handle = normalizeLichessHandle(form.lichessUsername)
    if (!handle) {
      setLichessLookup({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLichessLookup({ status: 'loading' })
      try {
        const res = await fetch(`${LICHESS_API}/${encodeURIComponent(handle)}`, {
          signal: controller.signal,
        })
        if (res.status === 404) {
          setLichessLookup({ status: 'notfound' })
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setLichessLookup({ status: 'found', user: data })
      } catch (err) {
        if (err.name === 'AbortError') return
        console.warn('lichess lookup failed', err)
        setLichessLookup({ status: 'error' })
      }
    }, 450)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [form.lichessUsername])

  const tiempoMeta = useMemo(
    () => TIEMPOS.find((t) => t.value === form.tiempo) ?? TIEMPOS[0],
    [form.tiempo],
  )

  const currentRating =
    chessLookup.status === 'found'
      ? chessLookup.stats?.[tiempoMeta.statsKey]?.last?.rating ?? null
      : null

  const currentLichessRating =
    lichessLookup.status === 'found'
      ? lichessLookup.user?.perfs?.[tiempoMeta.lichessKey]?.rating ?? null
      : null

  const onSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)

    const found = chessLookup.status === 'found' ? chessLookup.profile : null
    const stats = chessLookup.status === 'found' ? chessLookup.stats : null
    const lichessFound = lichessLookup.status === 'found' ? lichessLookup.user : null
    const normalizedPhone = normalizePhone(form.phone)
    if (!/^\+?[0-9]{7,20}$/.test(normalizedPhone)) {
      setSubmitError('Ingresá un teléfono válido (al menos 7 dígitos).')
      setSubmitting(false)
      return
    }
    // Column names match public.techess_registrations exactly (snake_case).
    const payload = {
      nombre: form.nombre.trim(),
      email: form.email.trim().toLowerCase(),
      phone: normalizedPhone,
      tiempo: form.tiempo,
      twitter_handle: normalizeTwitter(form.twitterHandle) || null,
      chess_username: found?.username ?? null,
      chess_name: found?.name ?? null,
      chess_country: found?.country ?? null,
      chess_avatar: found?.avatar ?? null,
      chess_url: found?.url ?? null,
      chess_rating_rapid: stats?.chess_rapid?.last?.rating ?? null,
      chess_rating_blitz: stats?.chess_blitz?.last?.rating ?? null,
      chess_rating_bullet: stats?.chess_bullet?.last?.rating ?? null,
      lichess_username: lichessFound?.username ?? lichessFound?.id ?? null,
      lichess_name: lichessFound?.profile?.realName ?? null,
      lichess_url: lichessFound?.url ?? (lichessFound ? `https://lichess.org/@/${lichessFound.username ?? lichessFound.id}` : null),
      lichess_rating_rapid: lichessFound?.perfs?.rapid?.rating ?? null,
      lichess_rating_blitz: lichessFound?.perfs?.blitz?.rating ?? null,
      lichess_rating_bullet: lichessFound?.perfs?.bullet?.rating ?? null,
    }

    const { error } = await supabase
      .from('techess_registrations')
      .insert(payload)

    if (error) {
      if (error.code === '23505') {
        const msg = (error.message ?? '').toLowerCase()
        if (msg.includes('chess_username')) {
          setSubmitError('Ese usuario de chess.com ya está anotado.')
        } else if (msg.includes('lichess_username')) {
          setSubmitError('Ese usuario de Lichess ya está anotado.')
        } else {
          setSubmitError('Ese email ya está anotado.')
        }
      } else {
        console.warn('supabase insert failed', error)
        setSubmitError('No pudimos guardar tu inscripción. Probá de nuevo.')
      }
      setSubmitting(false)
      return
    }

    onSubmitted?.(payload)
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <span className="form__eyebrow">COMUNIDAD DE AJEDREZ</span>
      <h1 className="form__title">Nos vemos en el tablero</h1>
      <p className="form__lede">
        Sumate a techess, y te avisamos de nuestros torneos.
      </p>

      <label>
        Nombre
        <input
          required
          placeholder="Tu nombre"
          value={form.nombre}
          onChange={update('nombre')}
        />
      </label>

      <label>
        Email
        <input
          required
          type="email"
          placeholder="vos@ejemplo.com"
          value={form.email}
          onChange={update('email')}
        />
      </label>

      <label>
        Teléfono (WhatsApp)
        <input
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+54 9 11 1234 5678"
          value={form.phone}
          onChange={update('phone')}
        />
      </label>

      <label>
        Usuario de chess.com <span className="form__optional">(opcional)</span>
        <input
          placeholder="magnuscarlsen"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={form.chessUsername}
          onChange={update('chessUsername')}
        />
        <ChessComHint lookup={chessLookup} tiempoLabel={tiempoMeta.label} rating={currentRating} />
      </label>

      <label>
        Usuario de Lichess <span className="form__optional">(opcional)</span>
        <input
          placeholder="DrNykterstein"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={form.lichessUsername}
          onChange={update('lichessUsername')}
        />
        <LichessHint
          lookup={lichessLookup}
          tiempoLabel={tiempoMeta.label}
          rating={currentLichessRating}
        />
      </label>

      <label>
        X / Twitter <span className="form__optional">(opcional)</span>
        <input
          placeholder="@tuusuario"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={form.twitterHandle}
          onChange={update('twitterHandle')}
        />
      </label>

      <label>
        Tiempo favorito
        <select value={form.tiempo} onChange={update('tiempo')}>
          {TIEMPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="form__submit"
        disabled={submitting}
      >
        {submitting ? 'ENVIANDO…' : 'ME ANOTO'}
      </button>
      {submitError && (
        <p className="form__hint form__hint--warn">{submitError}</p>
      )}
    </form>
  )
}

function LichessHint({ lookup, tiempoLabel, rating }) {
  if (lookup.status === 'idle') return null
  if (lookup.status === 'loading')
    return <div className="form__hint">BUSCANDO…</div>
  if (lookup.status === 'notfound')
    return (
      <div className="form__hint form__hint--warn">
        NO ENCONTRAMOS ESE USUARIO
      </div>
    )
  if (lookup.status === 'error')
    return (
      <div className="form__hint form__hint--warn">
        NO PUDIMOS CONSULTAR LICHESS
      </div>
    )
  const { user } = lookup
  const displayName =
    user.profile?.realName?.trim() || `@${user.username ?? user.id}`
  return (
    <div className="form__hint form__hint--found">
      <span className="form__hint-text">
        <span className="form__hint-name">{displayName}</span>
        {rating != null && (
          <span className="form__hint-rating">
            {tiempoLabel} {rating}
          </span>
        )}
      </span>
    </div>
  )
}

function ChessComHint({ lookup, tiempoLabel, rating }) {
  if (lookup.status === 'idle') return null
  if (lookup.status === 'loading')
    return <div className="form__hint">BUSCANDO…</div>
  if (lookup.status === 'notfound')
    return (
      <div className="form__hint form__hint--warn">
        NO ENCONTRAMOS ESE USUARIO
      </div>
    )
  if (lookup.status === 'error')
    return (
      <div className="form__hint form__hint--warn">
        NO PUDIMOS CONSULTAR CHESS.COM
      </div>
    )
  const { profile } = lookup
  const displayName = profile.name || `@${profile.username}`
  return (
    <div className="form__hint form__hint--found">
      {profile.avatar && (
        <img className="form__hint-avatar" src={profile.avatar} alt="" />
      )}
      <span className="form__hint-text">
        <span className="form__hint-name">{displayName}</span>
        {rating != null && (
          <span className="form__hint-rating">
            {tiempoLabel} {rating}
          </span>
        )}
      </span>
    </div>
  )
}
