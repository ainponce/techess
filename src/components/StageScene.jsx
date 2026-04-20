import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, PerspectiveCamera, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import ChessPiece from './ChessPiece'

const PIECES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']

const BOARD_SIZE = 8
const TILE = 0.7
const BOARD_Y = -0.5

const STARTING_ROW = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']

// White army occupies the rows closest to the camera; black mirrors it.
const BACK_ROW = 7
const PAWN_ROW = 6
const BLACK_BACK_ROW = BOARD_SIZE - 1 - BACK_ROW // 0
const BLACK_PAWN_ROW = BOARD_SIZE - 1 - PAWN_ROW // 1

// Where the chosen piece lands on its side. Non-unique pieces (rook, knight,
// bishop, pawn) pick one canonical column so the rest of the army can fill
// the remaining slots.
const CHOSEN_COL = {
  rook: 0,
  knight: 1,
  bishop: 2,
  queen: 3,
  king: 4,
  pawn: 4,
}

function chosenBoardSlot(variant, color) {
  const col = CHOSEN_COL[variant] ?? 0
  const row =
    variant === 'pawn'
      ? color === 'black'
        ? BLACK_PAWN_ROW
        : PAWN_ROW
      : color === 'black'
        ? BLACK_BACK_ROW
        : BACK_ROW
  return { variant, col, row, color, id: `${color[0]}-${variant}-${col}` }
}

function allBoardSlots() {
  const list = []
  STARTING_ROW.forEach((v, col) => {
    list.push({ id: `w-${v}-${col}`, color: 'white', variant: v, col, row: BACK_ROW })
    list.push({ id: `b-${v}-${col}`, color: 'black', variant: v, col, row: BLACK_BACK_ROW })
  })
  for (let col = 0; col < 8; col++) {
    list.push({ id: `w-pawn-${col}`, color: 'white', variant: 'pawn', col, row: PAWN_ROW })
    list.push({ id: `b-pawn-${col}`, color: 'black', variant: 'pawn', col, row: BLACK_PAWN_ROW })
  }
  return list
}

// Per-variant board scale: respects chess hierarchy (king tallest, pawn smallest).
const BOARD_BASE = 0.34
const BOARD_PIECE_SCALES = {
  king: 1.0,
  queen: 0.94,
  rook: 0.78,
  bishop: 0.8,
  knight: 0.74,
  pawn: 0.62,
}
const boardScaleFor = (v) => BOARD_BASE * (BOARD_PIECE_SCALES[v] ?? 0.8)

const CAROUSEL_RADIUS_DESKTOP = 2.4
const CAROUSEL_RADIUS_PORTRAIT = 1.8

// Per-variant correction applied on top of the GUI scale, so we can normalize
// the visual size of pieces whose GLTFs render too big at the shared value.
const FORM_SCALE_FACTOR = {
  rook: 0.7,
}

function formTarget(piece, selected, controls, isPortrait) {
  // Portrait has no room for the piece alongside the stacked form — hide
  // everything during 'form' so the inputs own the viewport.
  if (isPortrait) {
    return {
      position: [0, -10, 0],
      scale: 0.001,
      rotation: [0, 0, 0],
      visible: false,
      spinAxis: 'none',
    }
  }
  if (piece === selected) {
    const factor = FORM_SCALE_FACTOR[piece] ?? 1
    return {
      position: [controls.x, controls.y, controls.z],
      scale: controls.scale * factor,
      rotation: [controls.rx, controls.ry, controls.rz],
      visible: true,
      spinAxis: 'y',
      spinSpeed: controls.spinSpeed,
    }
  }
  return {
    position: [0, -10, 0],
    scale: 0.01,
    rotation: [0, 0, 0],
    visible: false,
    spinAxis: 'none',
  }
}

// y of the top surface of the board base + tiles, where pieces should rest.
const BOARD_TOP = BOARD_Y + 0.001

const HIDDEN_TARGET = {
  position: [0, -10, 0],
  scale: 0.001,
  rotation: [0, 0, 0],
  visible: false,
  spinAxis: 'none',
}

function boardFacingY(color, variant) {
  if (variant === 'knight') return color === 'black' ? Math.PI * 0.25 : Math.PI * 0.75
  return color === 'black' ? 0 : Math.PI
}

// In the board stage only the chosen piece (from the carousel) animates into
// place. Everyone else is rendered statically by <BoardArmy>.
function boardTarget(piece, selected, color) {
  if (piece !== selected) return HIDDEN_TARGET
  const slot = chosenBoardSlot(piece, color)
  return {
    position: [(slot.col - 3.5) * TILE, BOARD_TOP, (slot.row - 3.5) * TILE],
    scale: boardScaleFor(piece),
    rotation: [0, boardFacingY(color, piece), 0],
    visible: true,
    spinAxis: 'none',
  }
}

const tmpVec = new THREE.Vector3()
const TWO_PI = Math.PI * 2

function shortestAngleDelta(target, current) {
  let diff = (target - current) % TWO_PI
  if (diff > Math.PI) diff -= TWO_PI
  if (diff < -Math.PI) diff += TWO_PI
  return diff
}

function PieceController({ stage, piece, idx, centerIdx, selected, color, formControls, isPortrait }) {
  const groupRef = useRef(null)
  const innerRef = useRef(null)
  // tracks the piece's current ring angle so we can lerp along the shortest arc
  const angleRef = useRef(((idx - centerIdx) / PIECES.length) * TWO_PI)
  // once a hidden piece has fully damped to its parked target we stop spending
  // frames on it. reset whenever the piece becomes visible again.
  const settledRef = useRef(false)
  const prevStageRef = useRef(stage)

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return
    const hidden =
      (stage === 'form' && (isPortrait || piece !== selected)) ||
      (stage === 'board' && piece !== selected)
    if (hidden && settledRef.current) return
    if (!hidden) settledRef.current = false
    // frame-rate independent damping. lower lambda = slower, smoother easing.
    const damp = (cur, tgt, lambda) =>
      THREE.MathUtils.damp(cur, tgt, lambda, delta)
    const RING_LAMBDA = 2.5
    const STAGE_LAMBDA = 4

    if (stage === 'intro' || stage === 'selecting') {
      // circular orbit around Y. shortest-path angular interpolation
      // makes sure pieces travel along the ring, not across it.
      const len = PIECES.length
      const targetAngle = ((idx - centerIdx) / len) * TWO_PI
      const diff = shortestAngleDelta(targetAngle, angleRef.current)
      // exponential easing on the angle delta — equivalent to damp() but on a relative value
      angleRef.current += diff * (1 - Math.exp(-RING_LAMBDA * delta))
      const a = angleRef.current
      const radius = isPortrait ? CAROUSEL_RADIUS_PORTRAIT : CAROUSEL_RADIUS_DESKTOP
      g.position.x = Math.sin(a) * radius
      g.position.y = damp(g.position.y, 0, RING_LAMBDA)
      g.position.z = (Math.cos(a) - 1) * radius * 0.6
      g.rotation.x = damp(g.rotation.x, 0, RING_LAMBDA)
      g.rotation.z = damp(g.rotation.z, 0, RING_LAMBDA)
      g.rotation.y = -a

      const depth = (Math.cos(a) + 1) / 2 // 1 at front, 0 at back
      const ts = 0.32 + depth * 0.5
      g.scale.setScalar(damp(g.scale.x, ts, RING_LAMBDA))

      const isCenter = Math.abs(shortestAngleDelta(0, targetAngle)) < 0.01
      if (innerRef.current) {
        if (isCenter) innerRef.current.rotation.y += delta * 0.8
        else innerRef.current.rotation.y = damp(innerRef.current.rotation.y, 0, RING_LAMBDA)
      }
      return
    }

    // form / board: damp toward absolute world target
    const target = stage === 'form'
      ? formTarget(piece, selected, formControls, isPortrait)
      : boardTarget(piece, selected, color)

    // On portrait we park the piece at y=-10 during 'form'. Entering 'board'
    // it would otherwise damp straight up through the board surface. Snap
    // the selected piece to its slot on first frame of 'board' instead.
    if (
      prevStageRef.current !== 'board' &&
      stage === 'board' &&
      piece === selected &&
      isPortrait
    ) {
      g.position.set(target.position[0], target.position[1], target.position[2])
      g.scale.setScalar(target.scale)
      g.rotation.set(target.rotation[0], target.rotation[1], target.rotation[2])
      prevStageRef.current = stage
      return
    }
    prevStageRef.current = stage

    g.position.x = damp(g.position.x, target.position[0], STAGE_LAMBDA)
    g.position.y = damp(g.position.y, target.position[1], STAGE_LAMBDA)
    g.position.z = damp(g.position.z, target.position[2], STAGE_LAMBDA)

    const targetScale = target.visible ? target.scale : 0.001
    g.scale.setScalar(damp(g.scale.x, targetScale, STAGE_LAMBDA))

    g.rotation.x = damp(g.rotation.x, target.rotation[0], STAGE_LAMBDA)
    g.rotation.y = damp(g.rotation.y, target.rotation[1], STAGE_LAMBDA)
    g.rotation.z = damp(g.rotation.z, target.rotation[2], STAGE_LAMBDA)

    if (innerRef.current) {
      const speed = target.spinSpeed ?? 0.6
      if (target.spinAxis === 'y') innerRef.current.rotation.y += delta * speed
      else innerRef.current.rotation.y = damp(innerRef.current.rotation.y, 0, STAGE_LAMBDA)
    }

    if (hidden) {
      const dx = g.position.x - target.position[0]
      const dy = g.position.y - target.position[1]
      const dz = g.position.z - target.position[2]
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq < 1e-4 && Math.abs(g.scale.x - 0.001) < 1e-3) {
        settledRef.current = true
      }
    }
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]} scale={0.001}>
      <group ref={innerRef}>
        <ChessPiece
          variant={piece}
          spinSpeed={0}
          bottomAlign={stage === 'board'}
          dark={color === 'black'}
        />
      </group>
    </group>
  )
}

function ChessBoard({ visible }) {
  const tiles = useMemo(() => {
    const arr = []
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const dark = (r + c) % 2 === 1
        arr.push({ r, c, dark, key: `${r}-${c}` })
      }
    }
    return arr
  }, [])

  if (!visible) return null

  return (
    <group>
      {tiles.map((t) => (
        <mesh
          key={t.key}
          position={[(t.c - 3.5) * TILE, BOARD_Y, (t.r - 3.5) * TILE]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[TILE, TILE]} />
          {/* unlit material guarantees the dark/light contrast survives the
              studio environment and directional light. */}
          <meshBasicMaterial color={t.dark ? '#1a1411' : '#ece2cc'} />
        </mesh>
      ))}
      <mesh position={[0, BOARD_Y - 0.06, 0]} receiveShadow>
        <boxGeometry args={[BOARD_SIZE * TILE + 0.4, 0.1, BOARD_SIZE * TILE + 0.4]} />
        <meshStandardMaterial color="#0a0807" roughness={0.7} />
      </mesh>
    </group>
  )
}

// Renders all 32 board pieces statically (no fall animation). The slot of the
// chosen piece is skipped — that one is animated separately by PieceController
// from the form position to the board.
function BoardArmy({ stage, selected, color }) {
  const slots = useMemo(() => allBoardSlots(), [])
  const skipId = selected ? chosenBoardSlot(selected, color).id : null
  const visible = stage === 'board'
  return (
    <>
      {slots
        .filter((s) => s.id !== skipId)
        .map((s) => (
          <BoardPiece key={s.id} slot={s} visible={visible} />
        ))}
    </>
  )
}

function BoardPiece({ slot, visible }) {
  const fullScale = boardScaleFor(slot.variant)
  // Snap to position the moment the board stage activates; no flying-in.
  const scale = visible ? fullScale : 0.001
  return (
    <group
      position={[(slot.col - 3.5) * TILE, BOARD_TOP, (slot.row - 3.5) * TILE]}
      rotation={[0, boardFacingY(slot.color, slot.variant), 0]}
      scale={scale}
    >
      <ChessPiece
        variant={slot.variant}
        spinSpeed={0}
        bottomAlign
        dark={slot.color === 'black'}
      />
    </group>
  )
}

function CameraRig({ stage, color, isPortrait }) {
  const camRef = useRef(null)
  // Interpolated lookAt target so rotation eases with translation rather than
  // snapping the moment `stage` changes.
  const lookRef = useRef(new THREE.Vector3(0, 0, 0))
  const prevStageRef = useRef(stage)

  // Base fov per orientation; per-stage overrides happen in-frame.
  useEffect(() => {
    const cam = camRef.current
    if (!cam) return
    cam.fov = isPortrait ? 46 : 38
    cam.updateProjectionMatrix()
  }, [isPortrait])

  useFrame((_, delta) => {
    const cam = camRef.current
    if (!cam) return
    let target = isPortrait ? [0, 0.3, 5.4] : [0, 0.4, 6]
    let look = [0, 0, 0]
    // FOV defaults to the orientation base; board portrait needs more to fit
    // the 8×0.7 board horizontally on a narrow viewport.
    let fovTarget = isPortrait ? 46 : 38
    if (stage === 'form') {
      // Portrait: piece sits up top, form below — camera aims higher.
      target = isPortrait ? [0, 1.2, 6] : [0.5, 0, 6]
      look = isPortrait ? [0, 0.2, 0] : [-0.5, -0.5, 0]
    } else if (stage === 'board') {
      // Frame the board from the side of the chosen color so the player's
      // army is in the foreground. Flipping z mirrors the view 180° around Y.
      const sideZ = color === 'black' ? -7.8 : 7.8
      target = isPortrait ? [0, 5.0, sideZ * 1.8] : [0, 5.2, sideZ]
      look = [0, -0.4, 0]
      if (isPortrait) fovTarget = 54
    }
    // Frame-rate independent critical-damp. Lower lambda = slower/cinematic.
    const damp = (cur, tgt, lambda) =>
      THREE.MathUtils.damp(cur, tgt, lambda, delta)
    const POS_LAMBDA = 1.8
    const LOOK_LAMBDA = 2.4
    // On stage entry into 'board', snap directly to the target. Otherwise
    // lerping z from +6 (form) to -7.8 (black side) crosses the origin and
    // the camera visibly swings 180° around the lookAt point.
    if (prevStageRef.current !== 'board' && stage === 'board') {
      cam.position.set(target[0], target[1], target[2])
      lookRef.current.set(look[0], look[1], look[2])
      // Snap fov too so the first frame of the board already frames the
      // whole 8-tile width on portrait instead of catching up via damp.
      cam.fov = fovTarget
      cam.updateProjectionMatrix()
    } else {
      cam.position.x = damp(cam.position.x, target[0], POS_LAMBDA)
      cam.position.y = damp(cam.position.y, target[1], POS_LAMBDA)
      cam.position.z = damp(cam.position.z, target[2], POS_LAMBDA)
      lookRef.current.x = damp(lookRef.current.x, look[0], LOOK_LAMBDA)
      lookRef.current.y = damp(lookRef.current.y, look[1], LOOK_LAMBDA)
      lookRef.current.z = damp(lookRef.current.z, look[2], LOOK_LAMBDA)
    }
    prevStageRef.current = stage

    // Damp fov in lockstep with position so the zoom-out on entering board
    // feels like the camera move rather than a separate snap.
    const FOV_LAMBDA = 2
    const nextFov = THREE.MathUtils.damp(cam.fov, fovTarget, FOV_LAMBDA, delta)
    if (Math.abs(nextFov - cam.fov) > 1e-3) {
      cam.fov = nextFov
      cam.updateProjectionMatrix()
    }

    cam.lookAt(lookRef.current)
  })
  return (
    <PerspectiveCamera
      ref={camRef}
      makeDefault
      position={[0, 0.4, 6]}
      fov={isPortrait ? 46 : 38}
    />
  )
}

const DPR_BY_TIER = {
  low: [1, 1.25],
  mid: [1, 1.5],
  high: [1, 2],
}

export default function StageScene({ stage, centerIdx, selected, color, formControls, device }) {
  const tier = device?.tier ?? 'high'
  const isPortrait = device?.isPortrait ?? false
  const highTier = tier === 'high'
  return (
    <Canvas
      shadows={highTier}
      dpr={DPR_BY_TIER[tier]}
      gl={{ antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance' }}
    >
      <CameraRig stage={stage} color={color} isPortrait={isPortrait} />
      {/* hemisphere gives a soft sky/ground fill that replaces the HDR env on
          mid/low tiers without noticeably changing the flat standard material look. */}
      <hemisphereLight args={['#f5f1ea', '#2a241f', highTier ? 0.35 : 0.75]} />
      <ambientLight intensity={highTier ? 0.2 : 0.2} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={highTier ? 1.2 : 1.1}
        castShadow={highTier}
        shadow-mapSize={[512, 512]}
      />
      {/* Opposite-side fill only where there's no HDR env to bounce light into
          the shadow side — keeps black pieces readable on mobile. */}
      {!highTier && (
        <directionalLight position={[-3, 3, -2]} intensity={0.45} />
      )}
      {highTier && <Environment preset="studio" />}
      <Suspense fallback={null}>
        {PIECES.map((piece, idx) => (
          <PieceController
            key={piece}
            stage={stage}
            piece={piece}
            idx={idx}
            centerIdx={centerIdx}
            selected={selected}
            color={color}
            formControls={formControls}
            isPortrait={isPortrait}
          />
        ))}
        <BoardArmy stage={stage} selected={selected} color={color} />
        <ChessBoard visible={stage === 'board'} />
      </Suspense>
    </Canvas>
  )
}

PIECES.forEach((p) => {
  // ensure preload of all GLTFs used in board
  const url = `/${p === 'knight' ? 'knight_-_low_poly' : p === 'queen' ? 'queen_-_low_poly' : `low_poly_${p}`}/scene.gltf`
  useGLTF.preload(url)
})
