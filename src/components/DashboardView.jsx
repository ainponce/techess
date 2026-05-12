export default function DashboardView({ session, onSignOut }) {
  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">techess · dashboard</span>
        <div className="dashboard__user">
          <span>{session.user.email ?? '—'}</span>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onSignOut}>
            Salir
          </button>
        </div>
      </div>
      <div className="dashboard__state">Vista autenticada — datos pendientes.</div>
    </div>
  )
}
