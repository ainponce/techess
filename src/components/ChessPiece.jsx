import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Center } from '@react-three/drei'

const GLTF_MODELS = {
  bishop: { url: '/low_poly_bishop/scene.gltf', scale: 0.3 },
  rook: { url: '/low_poly_rook/scene.gltf', scale: 0.56 },
  knight: { url: '/knight_-_low_poly/scene.gltf', scale: 0.48 },
  king: { url: '/low_poly_king/scene.gltf', scale: 0.26 },
  pawn: { url: '/low_poly_pawn/scene.gltf', scale: 0.52 },
  queen: { url: '/queen_-_low_poly/scene.gltf', scale: 0.3 },
}

function Primitive({ variant }) {
  const material = (
    <meshStandardMaterial color="#f5f1ea" roughness={0.5} metalness={0.05} />
  )
  if (variant === 'sphere') {
    return (
      <mesh castShadow>
        <sphereGeometry args={[0.9, 24, 24]} />
        {material}
      </mesh>
    )
  }
  if (variant === 'box') {
    return (
      <mesh castShadow>
        <boxGeometry args={[1.2, 1.8, 1.2]} />
        {material}
      </mesh>
    )
  }
  return (
    <mesh castShadow>
      <capsuleGeometry args={[0.55, 1.1, 8, 16]} />
      {material}
    </mesh>
  )
}

// One tuned material instance per (source material, color variant). three.js
// happily shares materials across meshes, so 32 on-board pieces end up with
// ~2 materials in GPU instead of ~32 (one per original mesh × 2 colors).
const MATERIAL_CACHE = new Map()
function getTunedMaterial(original, dark) {
  const key = `${original.uuid}|${dark ? 'b' : 'w'}`
  const cached = MATERIAL_CACHE.get(key)
  if (cached) return cached
  const mat = original.clone()
  if (dark && mat.color) mat.color.set('#181818')
  if ('roughness' in mat) mat.roughness = 0.85
  if ('metalness' in mat) mat.metalness = 0
  MATERIAL_CACHE.set(key, mat)
  return mat
}

function GltfModel({ url, scale, bottomAlign, dark }) {
  const { scene } = useGLTF(url)
  // scene.clone(true) duplicates the object graph but keeps geometry/material
  // references shared — we just swap in a cached tuned material per mesh so
  // all clones of the same color share materials and GPU upload is one-shot.
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return
      obj.material = getTunedMaterial(obj.material, dark)
    })
    return c
  }, [scene, dark])
  // drei <Center> naming is counter-intuitive: `top` pushes the bbox UP from
  // the origin (so the bottom rests at y=0). That's what we want for a chess
  // piece sitting on its position. See node_modules/.../drei/core/Center.js:37
  return (
    <Center top={bottomAlign}>
      <primitive object={cloned} scale={scale} />
    </Center>
  )
}

export default function ChessPiece({
  variant = 'capsule',
  spinSpeed = 0.6,
  bottomAlign = false,
  dark = false,
  ...props
}) {
  const ref = useRef(null)
  useFrame((_, delta) => {
    if (spinSpeed === 0) return
    if (ref.current) ref.current.rotation.y += delta * spinSpeed
  })
  const gltf = GLTF_MODELS[variant]
  return (
    <group {...props}>
      <group ref={ref}>
        {gltf ? (
          <GltfModel
            url={gltf.url}
            scale={gltf.scale}
            bottomAlign={bottomAlign}
            dark={dark}
          />
        ) : (
          <Primitive variant={variant} />
        )}
      </group>
    </group>
  )
}

Object.values(GLTF_MODELS).forEach(({ url }) => useGLTF.preload(url))
