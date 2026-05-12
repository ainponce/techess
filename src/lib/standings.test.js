import { describe, it, expect } from 'vitest'
import { computeStandings } from './standings'

describe('computeStandings', () => {
  const players = [
    { id: 'a', seed_rating: 2000, withdrawn: false },
    { id: 'b', seed_rating: 1800, withdrawn: false },
    { id: 'c', seed_rating: 1600, withdrawn: false },
    { id: 'd', seed_rating: 1400, withdrawn: false },
  ]

  it('cuenta puntos correctamente (W=1, D=0.5, L=0, bye=1)', () => {
    const matches = [
      { round_number: 1, white_id: 'a', black_id: 'b', result: 'white' }, // a gana
      { round_number: 1, white_id: 'c', black_id: 'd', result: 'draw' },
      { round_number: 2, white_id: 'a', black_id: 'c', result: 'black' }, // c gana
      { round_number: 2, white_id: 'd', black_id: 'b', result: 'white' }, // d gana
    ]
    const standings = computeStandings(players, matches)
    const byId = Object.fromEntries(standings.map((s) => [s.participantId, s]))
    expect(byId.a.points).toBe(1) // 1+0
    expect(byId.b.points).toBe(0) // 0+0
    expect(byId.c.points).toBe(1.5) // 0.5+1
    expect(byId.d.points).toBe(1.5) // 0.5+1
  })

  it('Buchholz suma puntos de oponentes y excluye byes', () => {
    const matches = [
      { round_number: 1, white_id: 'a', black_id: 'b', result: 'white' },
      { round_number: 1, white_id: 'c', black_id: null, result: 'bye' }, // c bye
      // Pretendemos d no entra para simplificar
      { round_number: 2, white_id: 'a', black_id: 'c', result: 'draw' },
      { round_number: 2, white_id: 'b', black_id: null, result: 'bye' }, // b bye
    ]
    // Puntos: a=1.5, b=1, c=1.5, d=0
    const standings = computeStandings(players, matches)
    const byId = Object.fromEntries(standings.map((s) => [s.participantId, s]))
    // Buchholz a = puntos de sus oponentes con quienes jugó = b (1) + c (1.5) = 2.5
    expect(byId.a.buchholz).toBe(2.5)
    // c jugó solo contra a (bye no cuenta) → buchholz = 1.5
    expect(byId.c.buchholz).toBe(1.5)
    // b solo jugó contra a → buchholz = 1.5
    expect(byId.b.buchholz).toBe(1.5)
  })

  it('cuenta wins (sin contar byes como win)', () => {
    const matches = [
      { round_number: 1, white_id: 'a', black_id: 'b', result: 'white' },
      { round_number: 1, white_id: 'c', black_id: null, result: 'bye' },
      { round_number: 2, white_id: 'a', black_id: 'c', result: 'white' },
    ]
    const standings = computeStandings(players, matches)
    const byId = Object.fromEntries(standings.map((s) => [s.participantId, s]))
    expect(byId.a.wins).toBe(2)
    expect(byId.b.wins).toBe(0)
    expect(byId.c.wins).toBe(0) // bye no cuenta como win
  })

  it('ordena por puntos > buchholz > wins > seed_rating', () => {
    const players = [
      { id: 'a', seed_rating: 1500, withdrawn: false },
      { id: 'b', seed_rating: 1500, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
    ]
    const matches = [
      { round_number: 1, white_id: 'a', black_id: 'b', result: 'draw' },
      { round_number: 1, white_id: 'c', black_id: null, result: 'bye' },
    ]
    // a=0.5, b=0.5, c=1. c primero por puntos.
    // a y b empatan en puntos. Buchholz a = b (0.5); buchholz b = a (0.5). Empatan.
    // Wins: a=0, b=0. Empatan.
    // seed_rating desc: a=1500 = b=1500. Empatan completos → orden estable o por id.
    const standings = computeStandings(players, matches)
    expect(standings[0].participantId).toBe('c')
    expect([standings[1].participantId, standings[2].participantId]).toEqual(
      expect.arrayContaining(['a', 'b']),
    )
  })

  it('incluye withdrawn al final con flag', () => {
    const players = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: true },
    ]
    const matches = [
      { round_number: 1, white_id: 'a', black_id: 'b', result: 'white' },
    ]
    const standings = computeStandings(players, matches)
    expect(standings[0].participantId).toBe('a')
    expect(standings[0].withdrawn).toBe(false)
    expect(standings[1].participantId).toBe('b')
    expect(standings[1].withdrawn).toBe(true)
  })
})
