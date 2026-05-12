// Pure Swiss pairing for techess.
// generateRound(participants, previousMatches, { roundNumber }) → { matches, warnings }
// participants: [{ id, seed_rating, withdrawn }]
// previousMatches: [{ round_number, white_id, black_id, result }]
// Round 1 uses split-half by rating; subsequent rounds group by score.

function sortBySeed(arr) {
  return [...arr].sort((a, b) => {
    if (b.seed_rating !== a.seed_rating) return b.seed_rating - a.seed_rating
    return String(a.id).localeCompare(String(b.id))
  })
}

function pickBye(pool, hadBye) {
  // Lowest rating without prior bye. If all already had bye, pick lowest rating.
  const eligible = pool.filter((p) => !hadBye.has(p.id))
  const target = eligible.length > 0 ? eligible : pool
  return target[target.length - 1] // last after sort = lowest seed
}

export function generateRound(participants, previousMatches, options) {
  const { roundNumber } = options
  const active = participants.filter((p) => !p.withdrawn)
  const hadBye = new Set(
    previousMatches
      .filter((m) => m.result === 'bye')
      .map((m) => m.white_id ?? m.black_id),
  )

  if (roundNumber === 1) {
    return pairRound1(active, hadBye)
  }
  // Subsequent rounds — implementation in next task
  throw new Error('Rondas posteriores aún no implementadas')
}

function pairRound1(active, hadBye) {
  const sorted = sortBySeed(active)
  let pool = sorted
  const matches = []

  if (pool.length % 2 === 1) {
    const byeP = pickBye(pool, hadBye)
    matches.push({ round_number: 1, white_id: byeP.id, black_id: null, result: 'bye' })
    pool = pool.filter((p) => p.id !== byeP.id)
  }

  const half = pool.length / 2
  const s1 = pool.slice(0, half)
  const s2 = pool.slice(half)

  for (let i = 0; i < half; i++) {
    const a = s1[i]
    const b = s2[i]
    // Alternate colors by row index: even → s1 white, odd → s2 white
    const white = i % 2 === 0 ? a : b
    const black = i % 2 === 0 ? b : a
    matches.push({ round_number: 1, white_id: white.id, black_id: black.id, result: null })
  }

  return { matches, warnings: [] }
}
