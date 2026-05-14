import { describe, it, expect } from 'vitest'
import { normalizeLichessHandle } from './lichess'

describe('normalizeLichessHandle', () => {
  it('devuelve handle bare en minúscula', () => {
    expect(normalizeLichessHandle('MagnusCarlsen')).toBe('magnuscarlsen')
  })

  it('saca @ del comienzo', () => {
    expect(normalizeLichessHandle('@MagnusCarlsen')).toBe('magnuscarlsen')
  })

  it('extrae handle desde URL lichess.org/@/handle', () => {
    expect(normalizeLichessHandle('https://lichess.org/@/MagnusCarlsen')).toBe(
      'magnuscarlsen',
    )
  })

  it('extrae handle desde URL con path adicional', () => {
    expect(
      normalizeLichessHandle('https://lichess.org/@/MagnusCarlsen/all'),
    ).toBe('magnuscarlsen')
  })

  it('devuelve string vacío para input vacío', () => {
    expect(normalizeLichessHandle('')).toBe('')
    expect(normalizeLichessHandle('   ')).toBe('')
  })

  it('trimea espacios', () => {
    expect(normalizeLichessHandle('  Magnus  ')).toBe('magnus')
  })
})
