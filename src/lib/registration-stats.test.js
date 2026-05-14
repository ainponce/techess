import { describe, it, expect } from 'vitest'
import {
  averageRatingByTiempo,
  onlineRatio,
} from './registration-stats'

describe('averageRatingByTiempo', () => {
  it('promedia chess y lichess por persona cuando tiene ambos', () => {
    const rows = [
      { chess_rating_rapid: 1500, lichess_rating_rapid: 1700 }, // person avg 1600
      { chess_rating_rapid: 1400, lichess_rating_rapid: null }, // 1400
      { chess_rating_rapid: null, lichess_rating_rapid: 2000 }, // 2000
    ]
    // set: [1600, 1400, 2000] → avg 1666.67 → redondeado 1667
    expect(averageRatingByTiempo(rows, 'rapid')).toBe(1667)
  })

  it('ignora filas sin rating para ese tiempo', () => {
    const rows = [
      { chess_rating_blitz: 1500, lichess_rating_blitz: null },
      { chess_rating_blitz: null, lichess_rating_blitz: null }, // no cuenta
      { chess_rating_blitz: 1700, lichess_rating_blitz: 1900 }, // 1800
    ]
    // set: [1500, 1800] → 1650
    expect(averageRatingByTiempo(rows, 'blitz')).toBe(1650)
  })

  it('devuelve null si nadie tiene rating en ese tiempo', () => {
    const rows = [
      { chess_rating_bullet: null, lichess_rating_bullet: null },
      { chess_rating_bullet: null, lichess_rating_bullet: null },
    ]
    expect(averageRatingByTiempo(rows, 'bullet')).toBe(null)
  })

  it('devuelve null para set vacío', () => {
    expect(averageRatingByTiempo([], 'rapid')).toBe(null)
  })
})

describe('onlineRatio', () => {
  it('cuenta inscriptos con al menos una plataforma cargada', () => {
    const rows = [
      { chess_username: 'a', lichess_username: null },
      { chess_username: null, lichess_username: 'b' },
      { chess_username: 'c', lichess_username: 'd' },
      { chess_username: null, lichess_username: null },
    ]
    expect(onlineRatio(rows)).toEqual({ withAny: 3, total: 4, pct: 75 })
  })

  it('pct redondea al entero', () => {
    const rows = [
      { chess_username: 'a', lichess_username: null },
      { chess_username: null, lichess_username: null },
      { chess_username: null, lichess_username: null },
    ]
    // 1/3 = 33.33 → 33
    expect(onlineRatio(rows)).toEqual({ withAny: 1, total: 3, pct: 33 })
  })

  it('total 0 devuelve pct null', () => {
    expect(onlineRatio([])).toEqual({ withAny: 0, total: 0, pct: null })
  })
})
