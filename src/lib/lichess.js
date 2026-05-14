// Normaliza un handle de Lichess o URL de perfil a un username bare en lowercase.
// Acepta:
//   - "MagnusCarlsen" → "magnuscarlsen"
//   - "@MagnusCarlsen" → "magnuscarlsen"
//   - "https://lichess.org/@/MagnusCarlsen" → "magnuscarlsen"
//   - "https://lichess.org/@/MagnusCarlsen/all" → "magnuscarlsen"
export function normalizeLichessHandle(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const noAt = trimmed.replace(/^@/, '')
  const fromUrl = noAt.match(/lichess\.org\/@\/([^/?#]+)/i)
  return (fromUrl ? fromUrl[1] : noAt).toLowerCase()
}

export const LICHESS_API = 'https://lichess.org/api/user'
