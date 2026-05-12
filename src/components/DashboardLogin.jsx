import { useState } from 'react'

export default function DashboardLogin({ onSignIn, hint }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onSignIn({ email: email.trim().toLowerCase(), password })
    } catch (err) {
      setError(err.message ?? 'No pudimos entrar. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dashboard-login">
      <form className="dashboard-login__card" onSubmit={handleSubmit}>
        <span className="dashboard-login__eyebrow">techess · dashboard</span>
        <h1 className="dashboard-login__title">Entrar</h1>

        {hint && <span className="dashboard-login__hint">{hint}</span>}

        <label>
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          Password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button
          type="submit"
          className="dashboard__btn"
          disabled={submitting}
        >
          {submitting ? 'ENTRANDO…' : 'ENTRAR'}
        </button>

        {error && <span className="dashboard-login__error">{error}</span>}
      </form>
    </div>
  )
}
