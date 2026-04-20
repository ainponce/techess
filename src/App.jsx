import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardControls, useKeyboardControls } from '@react-three/drei'
import StageScene from './components/StageScene'
import RegistrationForm from './components/RegistrationForm'
import useFormControls from './hooks/useFormControls'
import useMoveSound from './hooks/useMoveSound'
import useDeviceTier from './hooks/useDeviceTier'
import './App.css'

const PIECES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']

const ArrowIcon = ({ dir }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    style={{ transform: dir === 'left' ? 'rotate(180deg)' : undefined }}
  >
    <path
      d="M5 2L10 7L5 12"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default function App() {
  const map = useMemo(
    () => [
      { name: 'prev', keys: ['ArrowLeft', 'KeyA'] },
      { name: 'next', keys: ['ArrowRight', 'KeyD'] },
      { name: 'choose', keys: ['Enter', 'Space'] },
      { name: 'toggleColor', keys: ['KeyB', 'KeyC'] },
    ],
    [],
  )
  return (
    <KeyboardControls map={map}>
      <AppInner />
    </KeyboardControls>
  )
}

function AppInner() {
  const [stage, setStage] = useState('boot')
  const [centerIdx, setCenterIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [color, setColor] = useState('white')

  // refs let the keyboard subscriber read fresh values without re-subscribing
  const stageRef = useRef(stage)
  const centerIdxRef = useRef(centerIdx)
  useEffect(() => {
    stageRef.current = stage
  }, [stage])
  useEffect(() => {
    centerIdxRef.current = centerIdx
  }, [centerIdx])

  useEffect(() => {
    const t1 = setTimeout(() => {
      setStage('intro')
      const t2 = setTimeout(() => setStage('selecting'), 1450)
      timers.push(t2)
    }, 250)
    const timers = [t1]
    return () => timers.forEach(clearTimeout)
  }, [])

  const playMoveSound = useMoveSound()

  const rotate = (dir) => {
    setCenterIdx((i) => (i + dir + PIECES.length) % PIECES.length)
    playMoveSound()
  }

  const choosePiece = () => {
    setSelected(PIECES[centerIdxRef.current])
    setStage('form')
  }

  const onFormSubmit = () => {
    playMoveSound()
    setStage('board')
  }

  const device = useDeviceTier()
  const formControls = useFormControls(stage === 'form', device)

  // Wire keyboard: arrows rotate, Enter/Space chooses. Only active in 'selecting'.
  const [subscribe] = useKeyboardControls()
  useEffect(() => {
    const onlyInSelecting = (fn) => (pressed) => {
      if (!pressed || stageRef.current !== 'selecting') return
      fn()
    }
    const unsubs = [
      subscribe((s) => s.prev, onlyInSelecting(() => rotate(-1))),
      subscribe((s) => s.next, onlyInSelecting(() => rotate(1))),
      subscribe((s) => s.choose, onlyInSelecting(choosePiece)),
      subscribe(
        (s) => s.toggleColor,
        onlyInSelecting(() => setColor((c) => (c === 'white' ? 'black' : 'white'))),
      ),
    ]
    return () => unsubs.forEach((u) => u())
    // rotate/choosePiece read fresh state via setters & refs, so no deps needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe])

  return (
    <div className="page" data-stage={stage}>
      <div className="page__scene">
        <StageScene
          stage={stage}
          centerIdx={centerIdx}
          selected={selected}
          color={color}
          formControls={formControls}
          device={device}
        />
      </div>

      <div className="page__curtain" aria-hidden="true" />

      {(stage === 'intro' || stage === 'selecting') && (
        <div className="carousel-ui">
          <div className="color-toggle" role="radiogroup" aria-label="Color de pieza (B)">
            <button
              type="button"
              className={`color-toggle__option ${color === 'white' ? 'is-active' : ''}`}
              onClick={() => setColor('white')}
              role="radio"
              aria-checked={color === 'white'}
              disabled={stage !== 'selecting'}
            >
              BLANCAS
            </button>
            <span className="color-toggle__sep">/</span>
            <button
              type="button"
              className={`color-toggle__option ${color === 'black' ? 'is-active' : ''}`}
              onClick={() => setColor('black')}
              role="radio"
              aria-checked={color === 'black'}
              disabled={stage !== 'selecting'}
            >
              NEGRAS
            </button>
          </div>
          <div className="carousel-ui__nav">
            <button
              type="button"
              className="carousel-ui__arrow"
              onClick={() => rotate(-1)}
              aria-label="Anterior (←)"
              disabled={stage !== 'selecting'}
            >
              <ArrowIcon dir="left" />
            </button>
            <button
              type="button"
              className="carousel-ui__choose"
              onClick={choosePiece}
              aria-label="Elegir (Enter)"
              disabled={stage !== 'selecting'}
            >
              ELEGIR
            </button>
            <button
              type="button"
              className="carousel-ui__arrow"
              onClick={() => rotate(1)}
              aria-label="Siguiente (→)"
              disabled={stage !== 'selecting'}
            >
              <ArrowIcon dir="right" />
            </button>
          </div>
        </div>
      )}

      {stage === 'form' && (
        <>
          <img className="logo-mark" src="/logo.svg" alt="techess" />
          <div className="page__form-col">
            <RegistrationForm onSubmitted={onFormSubmit} />
          </div>
        </>
      )}

      {stage === 'board' && (
        <div className="board-banner">
          <span className="board-banner__eyebrow">INSCRIPCIÓN RECIBIDA</span>
          <p className="board-banner__lede">
            We are not the piece, we are the board.
          </p>
        </div>
      )}
    </div>
  )
}
