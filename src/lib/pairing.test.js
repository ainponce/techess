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
