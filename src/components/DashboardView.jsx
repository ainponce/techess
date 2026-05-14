import { useLayoutEffect, useRef, useState } from 'react'
import DashboardRegistrations from './DashboardRegistrations'
import DashboardTournaments from './DashboardTournaments'

const TABS = [
  { id: 'tournaments', label: 'Torneos' },
  { id: 'registrations', label: 'Inscriptos' },
]

export default function DashboardView({ session, onSignOut, onSessionExpired }) {
  const [tab, setTab] = useState('tournaments')
  const tabsRef = useRef(null)
  const buttonsRef = useRef({})
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })

  useLayoutEffect(() => {
    const container = tabsRef.current
    const btn = buttonsRef.current[tab]
    if (!container || !btn) return
    const cRect = container.getBoundingClientRect()
    const bRect = btn.getBoundingClientRect()
    setIndicator({
      left: bRect.left - cRect.left,
      width: bRect.width,
      ready: true,
    })
  }, [tab])

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">
          <img className="dashboard__brand-logo" src="/logo.svg" alt="techess" />
          dashboard
        </span>
        <div className="dashboard__tabs" ref={tabsRef}>
          <span
            className="dashboard__tabs-indicator"
            data-ready={indicator.ready}
            style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
            aria-hidden="true"
          />
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                if (el) buttonsRef.current[t.id] = el
              }}
              type="button"
              className="dashboard__tab"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="dashboard__user">
          <span>{session.user.email ?? '—'}</span>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onSignOut}>
            Salir
          </button>
        </div>
      </div>

      <div className="dashboard__panel" key={tab}>
        {tab === 'tournaments' ? (
          <DashboardTournaments session={session} onSessionExpired={onSessionExpired} />
        ) : (
          <DashboardRegistrations onSessionExpired={onSessionExpired} />
        )}
      </div>
    </div>
  )
}
