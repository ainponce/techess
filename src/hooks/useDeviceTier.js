import { useSyncExternalStore } from 'react'

// Single source of truth for "how much GPU/CPU can I spend on this device?".
// Consumed by <StageScene>, <CameraRig>, useFormControls — anywhere we need
// to degrade quality or change layout on mobile.

const PORTRAIT_QUERY = '(max-width: 768px) and (orientation: portrait)'
const MOBILE_QUERY = '(pointer: coarse), (max-width: 768px)'

function subscribeMedia(query) {
  return (cb) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const mql = window.matchMedia(query)
    mql.addEventListener?.('change', cb)
    return () => mql.removeEventListener?.('change', cb)
  }
}

function matchMedia(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}

function computeTier({ isMobile }) {
  if (typeof window === 'undefined') return 'high'
  if (!isMobile) return 'high'
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = navigator.deviceMemory ?? 4
  if (cores < 4 || mem < 4) return 'low'
  return 'mid'
}

export default function useDeviceTier() {
  const isPortrait = useSyncExternalStore(
    subscribeMedia(PORTRAIT_QUERY),
    () => matchMedia(PORTRAIT_QUERY),
    () => false,
  )
  const isMobile = useSyncExternalStore(
    subscribeMedia(MOBILE_QUERY),
    () => matchMedia(MOBILE_QUERY),
    () => false,
  )
  const tier = computeTier({ isMobile })
  return { tier, isMobile, isPortrait }
}
