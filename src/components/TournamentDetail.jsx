export default function TournamentDetail({ tournamentId, onBack }) {
  return (
    <div>
      <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
        ← Volver
      </button>
      <div className="dashboard__state">Detalle del torneo {tournamentId} — pronto.</div>
    </div>
  )
}
