import { useEffect, useState } from 'react'

const LS_KEY_BASE = 'techess:form-controls'

// Canonical pose for the selected piece during the form stage. Desktop sits
// the piece to the left of a right-aligned form; portrait places it above a
// stacked form. Dev GUI tuner writes to separate LS slots per layout so tweaks
// on one don't leak to the other.
const DEFAULTS_DESKTOP = {
  x: -4.2,
  y: -1.9,
  z: -1.4,
  scale: 3.15,
  rx: 0,
  ry: 0.284,
  rz: -0.5615,
  spinSpeed: 0.4,
}

const DEFAULTS_MOBILE = {
  x: 0,
  y: 1.4,
  z: 0,
  scale: 1.6,
  rx: 0,
  ry: 0,
  rz: 0,
  spinSpeed: 0.4,
}

const IS_DEV = import.meta.env.DEV

function lsKey(isPortrait) {
  return isPortrait ? `${LS_KEY_BASE}:mobile` : `${LS_KEY_BASE}:desktop`
}

function defaultsFor(isPortrait) {
  return isPortrait ? DEFAULTS_MOBILE : DEFAULTS_DESKTOP
}

function load(isPortrait) {
  const defaults = defaultsFor(isPortrait)
  if (typeof window === 'undefined') return { ...defaults }
  try {
    const raw = window.localStorage.getItem(lsKey(isPortrait))
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw)
    return { ...defaults, ...parsed }
  } catch {
    return { ...defaults }
  }
}

function save(state, isPortrait) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(lsKey(isPortrait), JSON.stringify(state))
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Mounts a lil-gui panel while `active` is true and exposes tunables for the
 * selected piece during the form stage. Production builds skip the GUI and
 * always return the canonical defaults — the panel and lil-gui itself are
 * dynamically imported so they don't ship in the prod bundle.
 */
export default function useFormControls(active, device) {
  const isPortrait = device?.isPortrait ?? false
  const [values, setValues] = useState(() =>
    IS_DEV ? load(isPortrait) : { ...defaultsFor(isPortrait) },
  )

  // When the user rotates the device while on the form stage, swap pose.
  useEffect(() => {
    setValues(IS_DEV ? load(isPortrait) : { ...defaultsFor(isPortrait) })
  }, [isPortrait])

  useEffect(() => {
    if (!IS_DEV || !active) return
    let gui = null
    let cancelled = false

    import('lil-gui').then(({ default: GUI }) => {
      if (cancelled) return
      gui = new GUI({ title: `Pieza seleccionada (${isPortrait ? 'mobile' : 'desktop'})` })
      const state = { ...values }
      const defaults = defaultsFor(isPortrait)

      const update = (key) => (v) => {
        state[key] = v
        setValues((prev) => {
          const next = { ...prev, [key]: v }
          save(next, isPortrait)
          return next
        })
      }

      gui.add(state, 'x', -6, 6, 0.05).onChange(update('x'))
      gui.add(state, 'y', -4, 4, 0.05).onChange(update('y'))
      gui.add(state, 'z', -4, 4, 0.05).onChange(update('z'))
      gui.add(state, 'scale', 0.2, 4, 0.05).onChange(update('scale'))
      gui.add(state, 'rx', -Math.PI, Math.PI, 0.01).name('rot x').onChange(update('rx'))
      gui.add(state, 'ry', -Math.PI, Math.PI, 0.01).name('rot y').onChange(update('ry'))
      gui.add(state, 'rz', -Math.PI, Math.PI, 0.01).name('rot z').onChange(update('rz'))
      gui.add(state, 'spinSpeed', 0, 2, 0.01).name('spin').onChange(update('spinSpeed'))

      gui
        .add(
          {
            reset: () => {
              window.localStorage.removeItem(lsKey(isPortrait))
              setValues({ ...defaults })
              gui.controllersRecursive().forEach((c) => {
                if (c.property in defaults) c.setValue(defaults[c.property])
              })
            },
          },
          'reset',
        )
        .name('↺ Reset')
    })

    return () => {
      cancelled = true
      gui?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isPortrait])

  return values
}
