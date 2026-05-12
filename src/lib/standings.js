// computeStandings(participants, matches) → array sorted with points + tiebreakers.

export function computeStandings(participants, matches) {
  const pointsBy = new Map()
  const opponentsBy = new Map()
  const winsBy = new Map()

  for (const p of participants) {
    pointsBy.set(p.id, 0)
    opponentsBy.set(p.id, [])
    winsBy.set(p.id, 0)
  }

  for (const m of matches) {
    if (m.result === 'bye') {
      const id = m.white_id ?? m.black_id
      if (pointsBy.has(id)) pointsBy.set(id, pointsBy.get(id) + 1)
      // bye no cuenta como oponente ni como win
      continue
    }
    if (m.result == null) continue // partidos no jugados se ignoran

    if (m.white_id != null) opponentsBy.get(m.white_id)?.push(m.black_id)
    if (m.black_id != null) opponentsBy.get(m.black_id)?.push(m.white_id)

    if (m.result === 'white') {
      if (pointsBy.has(m.white_id)) pointsBy.set(m.white_id, pointsBy.get(m.white_id) + 1)
      if (winsBy.has(m.white_id)) winsBy.set(m.white_id, winsBy.get(m.white_id) + 1)
    } else if (m.result === 'black') {
      if (pointsBy.has(m.black_id)) pointsBy.set(m.black_id, pointsBy.get(m.black_id) + 1)
      if (winsBy.has(m.black_id)) winsBy.set(m.black_id, winsBy.get(m.black_id) + 1)
    } else if (m.result === 'draw') {
      if (pointsBy.has(m.white_id)) pointsBy.set(m.white_id, pointsBy.get(m.white_id) + 0.5)
      if (pointsBy.has(m.black_id)) pointsBy.set(m.black_id, pointsBy.get(m.black_id) + 0.5)
    }
  }

  // Buchholz = suma de puntos de oponentes (sin byes)
  const buchholzBy = new Map()
  for (const p of participants) {
    const opps = opponentsBy.get(p.id) ?? []
    const sum = opps.reduce((acc, oid) => acc + (pointsBy.get(oid) ?? 0), 0)
    buchholzBy.set(p.id, sum)
  }

  const active = participants.filter((p) => !p.withdrawn)
  const withdrawn = participants.filter((p) => p.withdrawn)

  const buildRow = (p) => ({
    participantId: p.id,
    points: pointsBy.get(p.id) ?? 0,
    buchholz: buchholzBy.get(p.id) ?? 0,
    wins: winsBy.get(p.id) ?? 0,
    seedRating: p.seed_rating,
    withdrawn: p.withdrawn === true,
  })

  const sortFn = (a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.seedRating - a.seedRating
  }

  return [...active.map(buildRow).sort(sortFn), ...withdrawn.map(buildRow).sort(sortFn)]
}
