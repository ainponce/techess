import { describe, it, expect } from 'vitest'
import { generateRound } from './pairing'

describe('generateRound — ronda 1 (split-half)', () => {
  it('empareja 4 jugadores: top con bottom alternando colores', () => {
    const participants = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
      { id: 'd', seed_rating: 1400, withdrawn: false },
    ]
    const result = generateRound(participants, [], { roundNumber: 1 })
    expect(result.matches).toEqual([
      { round_number: 1, white_id: 'a', black_id: 'c', result: null },
      { round_number: 1, white_id: 'd', black_id: 'b', result: null },
    ])
    expect(result.warnings).toEqual([])
  })

  it('con N impar asigna bye al menor rating', () => {
    const participants = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
      { id: 'd', seed_rating: 1400, withdrawn: false },
      { id: 'e', seed_rating: 1200, withdrawn: false },
    ]
    const result = generateRound(participants, [], { roundNumber: 1 })
    const bye = result.matches.find((m) => m.result === 'bye')
    expect(bye).toBeDefined()
    expect(bye.white_id).toBe('e') // menor rating
    expect(bye.black_id).toBeNull()
    expect(result.matches.filter((m) => m.result === null)).toHaveLength(2)
  })

  it('excluye participantes withdrawn', () => {
    const participants = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: true },
      { id: 'c', seed_rating: 1600, withdrawn: false },
    ]
    const result = generateRound(participants, [], { roundNumber: 1 })
    // Quedan 2 activos: 1 match, sin bye
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].result).toBeNull()
  })

  it('desempata por seed_rating idéntico usando id alfabético', () => {
    const participants = [
      { id: 'zeta', seed_rating: 1500, withdrawn: false },
      { id: 'alpha', seed_rating: 1500, withdrawn: false },
      { id: 'mike', seed_rating: 1500, withdrawn: false },
      { id: 'bravo', seed_rating: 1500, withdrawn: false },
    ]
    const result = generateRound(participants, [], { roundNumber: 1 })
    // Ordenados por rating desc, desempate id asc: alpha, bravo, mike, zeta
    // S1 = [alpha, bravo], S2 = [mike, zeta]
    expect(result.matches[0].white_id).toBe('alpha')
    expect(result.matches[0].black_id).toBe('mike')
    expect(result.matches[1].white_id).toBe('zeta')
    expect(result.matches[1].black_id).toBe('bravo')
  })
})

describe('generateRound — rondas 2+', () => {
  const fourPlayers = [
    { id: 'a', seed_rating: 2000, withdrawn: false },
    { id: 'b', seed_rating: 1800, withdrawn: false },
    { id: 'c', seed_rating: 1600, withdrawn: false },
    { id: 'd', seed_rating: 1400, withdrawn: false },
  ]

  it('ronda 2 agrupa por puntaje: 1 pt vs 1 pt, 0 pt vs 0 pt', () => {
    // Ronda 1 ganaron a y c (white). Quedan: a=1, b=0, c=1, d=0
    const round1 = [
      { round_number: 1, white_id: 'a', black_id: 'c', result: 'white' }, // a gana
      { round_number: 1, white_id: 'd', black_id: 'b', result: 'black' }, // b gana
    ]
    // Wait — after r1 with that result: a=1 (won), b=1 (won), c=0, d=0
    // So group 1pt: [a,b], group 0pt: [c,d]
    const result = generateRound(fourPlayers, round1, { roundNumber: 2 })
    // Group 1pt is a vs b; group 0pt is c vs d
    const pairs = result.matches
      .filter((m) => m.result === null)
      .map((m) => [m.white_id, m.black_id].sort())
    expect(pairs).toContainEqual(['a', 'b'])
    expect(pairs).toContainEqual(['c', 'd'])
  })

  it('evita rematch permutando dentro del grupo', () => {
    // Ronda 1: a vs b, c vs d. Ahora a=1, b=0, c=1, d=0.
    // Para ronda 2, split del 1pt group [a,c] daría a vs c — pero ya jugaron.
    // El algoritmo debe permutar y emparejar diferente.
    const players = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
      { id: 'd', seed_rating: 1400, withdrawn: false },
    ]
    const round1 = [
      { round_number: 1, white_id: 'a', black_id: 'c', result: 'white' },
      { round_number: 1, white_id: 'd', black_id: 'b', result: 'black' },
    ]
    // After r1: a=1, b=1, c=0, d=0. Pairings dentro de grupos: a-b y c-d (no rematch)
    const result = generateRound(players, round1, { roundNumber: 2 })
    const pairs = result.matches
      .filter((m) => m.result === null)
      .map((m) => [m.white_id, m.black_id].sort())
    expect(pairs).not.toContainEqual(['a', 'c']) // a y c ya jugaron
    expect(pairs).not.toContainEqual(['b', 'd']) // b y d ya jugaron
    expect(result.warnings).toEqual([])
  })

  it('flotea entre grupos si quedan participantes impares', () => {
    // 5 players, ronda 1: a-c, d-b (gana a, gana b), e=bye(+1)
    // After r1: a=1, b=1, c=0, d=0, e=1 → group 1pt: [a,b,e] (impar), group 0pt: [c,d]
    // El algoritmo debe floatar uno de 1pt al 0pt group.
    const players = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
      { id: 'd', seed_rating: 1400, withdrawn: false },
      { id: 'e', seed_rating: 1200, withdrawn: false },
    ]
    const round1 = [
      { round_number: 1, white_id: 'a', black_id: 'c', result: 'white' },
      { round_number: 1, white_id: 'd', black_id: 'b', result: 'black' },
      { round_number: 1, white_id: 'e', black_id: null, result: 'bye' },
    ]
    const result = generateRound(players, round1, { roundNumber: 2 })
    // El bye en ronda 2 debe ir a alguien que no haya tenido bye antes (no a 'e').
    const byeMatch = result.matches.find((m) => m.result === 'bye')
    if (byeMatch) {
      expect(byeMatch.white_id).not.toBe('e')
    }
    // 2 matches + opcional 1 bye
    expect(result.matches.length).toBeGreaterThanOrEqual(2)
  })

  it('respeta el cap de colores ±2', () => {
    // Forzar a un jugador a haber jugado 2 blancas seguidas y verificar que en
    // la próxima ronda recibe negras.
    const players = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1900, withdrawn: false },
      { id: 'c', seed_rating: 1800, withdrawn: false },
      { id: 'd', seed_rating: 1700, withdrawn: false },
    ]
    const matches = [
      // a jugó blancas y ganó
      { round_number: 1, white_id: 'a', black_id: 'c', result: 'white' },
      { round_number: 1, white_id: 'b', black_id: 'd', result: 'white' },
      // a jugó blancas otra vez (forzado para el test) y ganó
      { round_number: 2, white_id: 'a', black_id: 'd', result: 'white' },
      { round_number: 2, white_id: 'b', black_id: 'c', result: 'white' },
    ]
    // Ronda 3: a debería jugar negras (sus colorDiff = +2, máximo permitido sin cap break)
    const result = generateRound(players, matches, { roundNumber: 3 })
    const aMatch = result.matches.find(
      (m) => m.result === null && (m.white_id === 'a' || m.black_id === 'a'),
    )
    expect(aMatch).toBeDefined()
    expect(aMatch.black_id).toBe('a') // a juega negras
  })
})
