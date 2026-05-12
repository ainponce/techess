import { useState } from 'react'
import DashboardRegistrations from './DashboardRegistrations'
import DashboardTournaments from './DashboardTournaments'

export default function DashboardView({ session, onSignOut, onSessionExpired }) {
  const [tab, setTab] = useState('tournaments')

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">techess · dashboard</span>
        <div className="dashboard__tabs">
          <button
            type="button"
            className="dashboard__tab"
            data-active={tab === 'tournaments'}
            onClick={() => setTab('tournaments')}
          >
            Torneos
          </button>
          <button
            type="button"
            className="dashboard__tab"
            data-active={tab === 'registrations'}
            onClick={() => setTab('registrations')}
          >
            Inscriptos
          </button>
        </div>
        <div className="dashboard__user">
          <span>{session.user.email ?? '—'}</span>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onSignOut}>
            Salir
          </button>
        </div>
      </div>

      {tab === 'tournaments' ? (
        <DashboardTournaments session={session} onSessionExpired={onSessionExpired} />
      ) : (
        <DashboardRegistrations onSessionExpired={onSessionExpired} />
      )}
    </div>
  )
}
