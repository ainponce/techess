// Pure Swiss pairing for techess.
// generateRound(participants, previousMatches, { roundNumber }) → { matches, warnings }

function sortBySeed(arr) {
  return [...arr].sort((a, b) => {
    if (b.seed_rating !== a.seed_rating) return b.seed_rating - a.seed_rating
    return String(a.id).localeCompare(String(b.id))
  })
}

function pickBye(pool, hadBye) {
  const eligible = pool.filter((p) => !hadBye.has(p.id))
  const target = eligible.length > 0 ? eligible : pool
  return target[target.length - 1] // last after sort = lowest seed
}

function computePoints(matches) {
  const pts = new Map()
  for (const m of matches) {
    if (m.result === 'bye') {
      const id = m.white_id ?? m.black_id
      pts.set(id, (pts.get(id) ?? 0) + 1)
      continue
    }
    if (m.result === 'white') {
      pts.set(m.white_id, (pts.get(m.white_id) ?? 0) + 1)
      pts.set(m.black_id, pts.get(m.black_id) ?? 0)
    } else if (m.result === 'black') {
      pts.set(m.black_id, (pts.get(m.black_id) ?? 0) + 1)
      pts.set(m.white_id, pts.get(m.white_id) ?? 0)
    } else if (m.result === 'draw') {
      pts.set(m.white_id, (pts.get(m.white_id) ?? 0) + 0.5)
      pts.set(m.black_id, (pts.get(m.black_id) ?? 0) + 0.5)
    }
  }
  return pts
}

function computeOpponents(matches) {
  const opps = new Map()
  for (const m of matches) {
    if (m.result === 'bye') continue
    if (!opps.has(m.white_id)) opps.set(m.white_id, new Set())
    if (!opps.has(m.black_id)) opps.set(m.black_id, new Set())
    opps.get(m.white_id).add(m.black_id)
    opps.get(m.black_id).add(m.white_id)
  }
  return opps
}

function computeColorHistory(matches) {
  // Returns map id → array of 'W' / 'B' in chronological order
  const hist = new Map()
  const sorted = [...matches].sort((a, b) => a.round_number - b.round_number)
  for (const m of sorted) {
    if (m.result === 'bye') continue
    if (!hist.has(m.white_id)) hist.set(m.white_id, [])
    if (!hist.has(m.black_id)) hist.set(m.black_id, [])
    hist.get(m.white_id).push('W')
    hist.get(m.black_id).push('B')
  }
  return hist
}

function colorDiff(history) {
  if (!history) return 0
  let w = 0
  let b = 0
  for (const c of history) c === 'W' ? w++ : b++
  return w - b
}

function tryPermutations(s1, s2, previousOpponents) {
  // Try the default pairing (s1[i] vs s2[i]); if any pair already met, swap
  // within s2 to find a valid arrangement. Returns null if impossible.
  const tryIt = (perm) => {
    for (let i = 0; i < s1.length; i++) {
      const aId = s1[i].id
      const bId = s2[perm[i]].id
      if (previousOpponents.get(aId)?.has(bId)) return null
    }
    return perm.map((j, i) => [s1[i], s2[j]])
  }

  // For large groups the factorial blowup is too costly (s2=8 → 40k permutations;
  // s2=10 → 3.6M). Above 8 we just check the default order and let the caller
  // fall back to greedy + warning if it has repeats.
  if (s2.length > 8) {
    return tryIt(s2.map((_, i) => i))
  }

  // Generate all permutations of s2 indices and try each in order.
  const permute = (arr) => {
    if (arr.length <= 1) return [arr]
    const out = []
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
      for (const p of permute(rest)) out.push([arr[i], ...p])
    }
    return out
  }

  for (const perm of permute(s2.map((_, i) => i))) {
    const pairs = tryIt(perm)
    if (pairs) return pairs
  }
  return null
}

function assignColors(pair, colorHistory) {
  const [a, b] = pair
  const diffA = colorDiff(colorHistory.get(a.id))
  const diffB = colorDiff(colorHistory.get(b.id))
  // Preferred color: negative diff (more blacks) → prefers W; positive → prefers B
  const prefA = diffA > 0 ? 'B' : diffA < 0 ? 'W' : null
  const prefB = diffB > 0 ? 'B' : diffB < 0 ? 'W' : null

  let whiteId
  if (prefA && prefB && prefA !== prefB) {
    whiteId = prefA === 'W' ? a.id : b.id
  } else if (prefA && !prefB) {
    whiteId = prefA === 'W' ? a.id : b.id
  } else if (!prefA && prefB) {
    whiteId = prefB === 'B' ? a.id : b.id
  } else if (prefA && prefB && prefA === prefB) {
    // Clash: give the preferred to whoever has larger |diff|
    const absA = Math.abs(diffA)
    const absB = Math.abs(diffB)
    if (absA > absB) {
      whiteId = prefA === 'W' ? a.id : b.id
    } else if (absB > absA) {
      whiteId = prefB === 'W' ? b.id : a.id
    } else {
      // Equal tension: deterministic by id
      whiteId = String(a.id).localeCompare(String(b.id)) < 0 ? a.id : b.id
    }
  } else {
    // Neither has preference (both even) — default a → white
    whiteId = a.id
  }

  // Cap check: ensure neither player exceeds |colorDiff| >= 3 after assignment.
  // If both options violate (e.g., both at +2 with same preference), per spec the
  // senior (lex-larger id) takes the imposed (cap-breaking) assignment.
  const checkCap = (wId) => {
    const aw = wId === a.id
    const newA = diffA + (aw ? 1 : -1)
    const newB = diffB + (aw ? -1 : 1)
    return { aViolates: Math.abs(newA) >= 3, bViolates: Math.abs(newB) >= 3 }
  }
  const initialCheck = checkCap(whiteId)
  if (initialCheck.aViolates || initialCheck.bViolates) {
    const other = whiteId === a.id ? b.id : a.id
    const otherCheck = checkCap(other)
    if (!otherCheck.aViolates && !otherCheck.bViolates) {
      whiteId = other
    } else {
      // Both options violate. Senior (lex-larger id) gets the cap-break.
      const senior = String(a.id).localeCompare(String(b.id)) > 0 ? a.id : b.id
      const seniorViolatesInitial =
        (senior === a.id && initialCheck.aViolates) ||
        (senior === b.id && initialCheck.bViolates)
      whiteId = seniorViolatesInitial ? whiteId : other
    }
  }

  return { white_id: whiteId, black_id: whiteId === a.id ? b.id : a.id }
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
  return pairLaterRound(active, previousMatches, hadBye, roundNumber)
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
    const white = i % 2 === 0 ? a : b
    const black = i % 2 === 0 ? b : a
    matches.push({ round_number: 1, white_id: white.id, black_id: black.id, result: null })
  }

  return { matches, warnings: [] }
}

function pairLaterRound(active, previousMatches, hadBye, roundNumber) {
  const points = computePoints(previousMatches)
  const previousOpponents = computeOpponents(previousMatches)
  const colorHistory = computeColorHistory(previousMatches)

  let pool = sortBySeed(active)
  const warnings = []
  const matches = []

  // Asignar bye si N impar (al de menor puntaje + menor rating sin bye previo)
  if (pool.length % 2 === 1) {
    const byCandidates = sortBySeed(pool).reverse() // ascending rating
    // sort ascending by points first, then by rating asc (lowest first)
    byCandidates.sort((a, b) => {
      const pa = points.get(a.id) ?? 0
      const pb = points.get(b.id) ?? 0
      if (pa !== pb) return pa - pb
      return a.seed_rating - b.seed_rating
    })
    const eligible = byCandidates.find((p) => !hadBye.has(p.id)) ?? byCandidates[0]
    matches.push({ round_number: roundNumber, white_id: eligible.id, black_id: null, result: 'bye' })
    pool = pool.filter((p) => p.id !== eligible.id)
  }

  // Agrupar por puntaje
  const groups = new Map()
  for (const p of pool) {
    const pts = points.get(p.id) ?? 0
    if (!groups.has(pts)) groups.set(pts, [])
    groups.get(pts).push(p)
  }
  const sortedPts = [...groups.keys()].sort((a, b) => b - a)
  for (const k of sortedPts) groups.set(k, sortBySeed(groups.get(k)))

  // Procesar grupos de mayor a menor; floatear si tamaño impar
  let floated = []
  const orderedGroups = sortedPts.map((k) => [...groups.get(k)])

  for (let g = 0; g < orderedGroups.length; g++) {
    let group = [...floated, ...orderedGroups[g]]
    floated = []
    if (group.length % 2 === 1 && g < orderedGroups.length - 1) {
      // Float al de menor rating al siguiente grupo
      floated = [group[group.length - 1]]
      group = group.slice(0, -1)
    }
    if (group.length === 0) continue
    if (group.length === 1) {
      // Resto suelto que no puede emparejarse — emparejar con el primero de floated previo / siguiente
      // En el peor caso queda un repeat: se acepta y warning.
      floated = [...floated, ...group]
      continue
    }

    const half = group.length / 2
    const s1 = group.slice(0, half)
    const s2 = group.slice(half)
    const pairs = tryPermutations(s1, s2, previousOpponents)

    let resolved
    if (pairs) {
      resolved = pairs
    } else {
      // Fallback: emparejar tal cual (puede haber repeat)
      resolved = s1.map((p, i) => [p, s2[i]])
      warnings.push(`Ronda ${roundNumber}: emparejamiento con repeat en grupo de ${group[0]?.id ? `pts=${points.get(group[0].id) ?? 0}` : 'desconocido'}`)
    }

    for (const pair of resolved) {
      const { white_id, black_id } = assignColors(pair, colorHistory)
      matches.push({ round_number: roundNumber, white_id, black_id, result: null })
    }
  }

  // Si quedó algún floated suelto sin pareja, hacer ronda con el último previo
  if (floated.length === 1) {
    // Edge: solo si no había nadie con quien emparejar. Marcamos warning.
    warnings.push(`Ronda ${roundNumber}: jugador sin par (${floated[0].id})`)
  }

  return { matches, warnings }
}
