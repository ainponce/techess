# Feedback dashboard + Lichess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el round de feedback al dashboard de techess y al form de inscripción: placeholders en login, logo en header, soporte para Lichess (campos en form, columnas en DB, métricas), métricas nuevas de torneos, dedupe por chess/lichess username, y acento de color sutil.

**Architecture:** Frontend React 19 + Vite con un solo cliente Supabase (`src/lib/supabase.js`). La lógica pura (normalización de handles, cálculos de stats) vive en `src/lib/` con tests Vitest. La UI vive en `src/components/`. La DB tiene migrations aplicadas vía la MCP Supabase tool (`apply_migration`).

**Tech Stack:** React 19, Vite, Supabase (PostgreSQL), Vitest, CSS variables.

**Spec:** `docs/superpowers/specs/2026-05-14-feedback-dashboard-lichess-design.md`

---

## File Structure

**Creates:**
- `src/lib/lichess.js` — helpers de normalización y fetch de Lichess
- `src/lib/lichess.test.js` — tests para `normalizeLichessHandle`
- `src/lib/registration-stats.js` — helpers puros para los stats del dashboard
- `src/lib/registration-stats.test.js` — tests para stats

**Modifies:**
- `src/components/DashboardLogin.jsx` — placeholders
- `src/components/DashboardView.jsx` — logo en header
- `src/components/RegistrationForm.jsx` — input + lookup + payload + error diff de lichess
- `src/components/DashboardRegistrations.jsx` — nuevos stats, columnas, query de torneos
- `src/Dashboard.css` — accent color, logo en brand, stats grid 3-fila, columna por plataforma

**Migrations (vía Supabase MCP):**
- `add_lichess_columns_to_registrations` — agrega 6 columnas lichess_*
- `add_unique_indexes_on_usernames` — unique parcial sobre chess_username y lichess_username

---

## Task 1: Pre-migration — chequear duplicados existentes

**Files:** ninguno (operación de discovery)

**Why first:** la migration de unique parcial falla si ya hay duplicados (el feedback menciona Manu Soria y Ain Ponce). Hay que resolverlos antes de aplicar el índice.

- [ ] **Step 1: Listar duplicados de chess_username**

Ejecutar vía `mcp__supabase__execute_sql`:

```sql
SELECT lower(chess_username) AS handle, count(*) AS n, array_agg(id::text) AS ids, array_agg(nombre) AS nombres, array_agg(email) AS emails
FROM public.techess_registrations
WHERE chess_username IS NOT NULL
GROUP BY lower(chess_username)
HAVING count(*) > 1
ORDER BY n DESC;
```

Expected: una o dos filas (Manu Soria, Ain Ponce según el feedback).

- [ ] **Step 2: Mostrar los duplicados al usuario y pedir resolución**

Para cada grupo duplicado, listar las filas completas:

```sql
SELECT id, nombre, email, phone, chess_username, created_at
FROM public.techess_registrations
WHERE id::text = ANY(ARRAY[...ids...]);
```

Preguntar al usuario qué hacer con cada grupo. Opciones:
1. Borrar la fila más vieja (`DELETE FROM techess_registrations WHERE id = '<uuid>'`).
2. NULL-ear `chess_username` en la fila más vieja (`UPDATE techess_registrations SET chess_username = NULL, chess_url = NULL, chess_avatar = NULL, chess_name = NULL, chess_country = NULL, chess_rating_rapid = NULL, chess_rating_blitz = NULL, chess_rating_bullet = NULL WHERE id = '<uuid>'`).
3. Cambiar el handle de una de las dos filas (`UPDATE ... SET chess_username = '<otro>' WHERE id = '<uuid>'`).

Esperar respuesta del usuario antes de ejecutar.

- [ ] **Step 3: Aplicar las decisiones del usuario y reverificar**

Ejecutar los UPDATEs/DELETEs decididos vía `mcp__supabase__execute_sql`. Luego re-correr el SQL del Step 1 y confirmar que no devuelve filas.

Expected: 0 filas.

- [ ] **Step 4: Commit (sin cambios de código, pero dejar registro de la decisión)**

No hay cambios de código aún. Continuar a Task 2.

---

## Task 2: Migration — columnas lichess + unique partial indexes

**Files:** migration vía `mcp__supabase__apply_migration`

- [ ] **Step 1: Aplicar migration de columnas lichess**

Llamar `mcp__supabase__apply_migration` con name `add_lichess_columns_to_registrations` y query:

```sql
ALTER TABLE public.techess_registrations
  ADD COLUMN lichess_username text,
  ADD COLUMN lichess_name text,
  ADD COLUMN lichess_url text,
  ADD COLUMN lichess_rating_rapid int4
    CHECK (lichess_rating_rapid IS NULL OR (lichess_rating_rapid >= 0 AND lichess_rating_rapid <= 4000)),
  ADD COLUMN lichess_rating_blitz int4
    CHECK (lichess_rating_blitz IS NULL OR (lichess_rating_blitz >= 0 AND lichess_rating_blitz <= 4000)),
  ADD COLUMN lichess_rating_bullet int4
    CHECK (lichess_rating_bullet IS NULL OR (lichess_rating_bullet >= 0 AND lichess_rating_bullet <= 4000));
```

Expected: migration aplicada sin errores.

- [ ] **Step 2: Verificar columnas**

Ejecutar `mcp__supabase__list_tables` con `schemas: ["public"]` y `verbose: true`. Confirmar que `techess_registrations` ahora tiene las 6 columnas nuevas.

- [ ] **Step 3: Aplicar migration de unique indexes**

Llamar `mcp__supabase__apply_migration` con name `add_unique_indexes_on_usernames` y query:

```sql
CREATE UNIQUE INDEX techess_registrations_chess_username_unique
  ON public.techess_registrations (lower(chess_username))
  WHERE chess_username IS NOT NULL;

CREATE UNIQUE INDEX techess_registrations_lichess_username_unique
  ON public.techess_registrations (lower(lichess_username))
  WHERE lichess_username IS NOT NULL;
```

Expected: migration aplicada sin errores. Si falla por duplicados, volver a Task 1.

- [ ] **Step 4: Verificar índices**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'techess_registrations' AND indexname LIKE '%username_unique';
```

Expected: dos filas, ambas con `WHERE` clause partial.

- [ ] **Step 5: Smoke test del unique**

Intentar `INSERT` con un chess_username que ya existe (por ej `'magnuscarlsen'` si está, o pickear uno existente vía SELECT primero). Debe fallar con `23505`.

```sql
-- Pickear uno existente
SELECT chess_username FROM techess_registrations WHERE chess_username IS NOT NULL LIMIT 1;
-- Intentar insertar (reemplazar <existing> con el valor de arriba)
INSERT INTO techess_registrations (nombre, email, tiempo, phone, chess_username)
VALUES ('Test', 'test-uniq@example.com', 'rapid', '+5491111111111', '<existing>');
```

Expected: `ERROR: duplicate key value violates unique constraint`. Borrar la fila si por algún motivo entró (no debería).

---

## Task 3: Login placeholders

**Files:**
- Modify: `src/components/DashboardLogin.jsx`

- [ ] **Step 1: Agregar placeholders a los inputs**

En `src/components/DashboardLogin.jsx`, modificar el input de email (líneas 33-40) y password (líneas 44-51).

```jsx
<label>
  Email
  <input
    required
    type="email"
    autoComplete="email"
    placeholder="vos@ejemplo.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
</label>

<label>
  Password
  <input
    required
    type="password"
    autoComplete="current-password"
    placeholder="••••••••"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
  />
</label>
```

- [ ] **Step 2: Verificar visualmente**

Dev server ya corre (no levantarlo). Abrir `/dashboard` (ruta de login). Confirmar que ambos inputs muestran el placeholder cuando están vacíos.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardLogin.jsx
git commit -m "feat(login): placeholders en email y password"
```

---

## Task 4: Logo en dashboard header

**Files:**
- Modify: `src/components/DashboardView.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Sumar regla CSS para el logo del header**

En `src/Dashboard.css`, justo después del bloque `.dashboard__brand` (línea 34-39), agregar:

```css
.dashboard__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.dashboard__brand-logo {
  width: 28px;
  height: 28px;
  display: block;
}
```

(Reemplazar el bloque existente con esto — `display: inline-flex` y `gap` son nuevos, lo demás queda igual.)

- [ ] **Step 2: Reemplazar el texto del brand por logo + wordmark**

En `src/components/DashboardView.jsx` línea 11, reemplazar:

```jsx
<span className="dashboard__brand">techess · dashboard</span>
```

por:

```jsx
<span className="dashboard__brand">
  <img className="dashboard__brand-logo" src="/logo.svg" alt="techess" />
  dashboard
</span>
```

- [ ] **Step 3: Verificar visualmente**

Abrir el dashboard (post login). Confirmar logo SVG a la izquierda y texto "dashboard" al lado.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardView.jsx src/Dashboard.css
git commit -m "feat(dashboard): logo svg en header en vez de texto"
```

---

## Task 5: Helper de Lichess — `normalizeLichessHandle` (TDD)

**Files:**
- Create: `src/lib/lichess.js`
- Test: `src/lib/lichess.test.js`

- [ ] **Step 1: Escribir tests fallidos**

Crear `src/lib/lichess.test.js`:

```js
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
```

- [ ] **Step 2: Correr tests, ver que fallan**

```bash
pnpm test src/lib/lichess.test.js
```

Expected: FAIL — `Cannot find module './lichess'`.

- [ ] **Step 3: Implementar `normalizeLichessHandle`**

Crear `src/lib/lichess.js`:

```js
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
```

- [ ] **Step 4: Correr tests, ver que pasan**

```bash
pnpm test src/lib/lichess.test.js
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lichess.js src/lib/lichess.test.js
git commit -m "feat(lib): normalizeLichessHandle"
```

---

## Task 6: Form — input de Lichess + lookup + LichessHint

**Files:**
- Modify: `src/components/RegistrationForm.jsx`

Para Lichess no hace falta un segundo endpoint: `GET /api/user/{handle}` devuelve perfil y `perfs` (con ratings de cada modalidad) en la misma respuesta.

- [ ] **Step 1: Importar el helper y constantes**

En `src/components/RegistrationForm.jsx`, sumar al tope del archivo:

```jsx
import { normalizeLichessHandle, LICHESS_API } from '../lib/lichess'
```

Y en el bloque `TIEMPOS` (línea 13-17), agregar la key de lichess perfs. Reemplazar `TIEMPOS` por:

```jsx
const TIEMPOS = [
  { value: 'rapid', label: 'Rápido', statsKey: 'chess_rapid', lichessKey: 'rapid' },
  { value: 'blitz', label: 'Blitz', statsKey: 'chess_blitz', lichessKey: 'blitz' },
  { value: 'bullet', label: 'Bullet', statsKey: 'chess_bullet', lichessKey: 'bullet' },
]
```

- [ ] **Step 2: Agregar `lichessUsername` al estado inicial**

Reemplazar `INITIAL` (líneas 4-11):

```jsx
const INITIAL = {
  nombre: '',
  email: '',
  phone: '',
  chessUsername: '',
  lichessUsername: '',
  twitterHandle: '',
  tiempo: 'rapid',
}
```

- [ ] **Step 3: Renombrar `lookup` a `chessLookup` y sumar `lichessLookup`**

En el componente `RegistrationForm`, reemplazar:

```jsx
const [lookup, setLookup] = useState({ status: 'idle' })
```

por:

```jsx
const [chessLookup, setChessLookup] = useState({ status: 'idle' })
const [lichessLookup, setLichessLookup] = useState({ status: 'idle' })
```

Y reemplazar todas las referencias a `lookup` y `setLookup` por `chessLookup` y `setChessLookup` dentro del `useEffect` existente (el de chess.com), incluyendo el `currentRating` que se calcula abajo:

```jsx
const currentRating =
  chessLookup.status === 'found'
    ? chessLookup.stats?.[tiempoMeta.statsKey]?.last?.rating ?? null
    : null
```

- [ ] **Step 4: Agregar `useEffect` de lookup de Lichess**

Justo debajo del `useEffect` de chess.com (después de la línea 92 del archivo original), agregar:

```jsx
useEffect(() => {
  const handle = normalizeLichessHandle(form.lichessUsername)
  if (!handle) {
    setLichessLookup({ status: 'idle' })
    return
  }
  const controller = new AbortController()
  const timer = setTimeout(async () => {
    setLichessLookup({ status: 'loading' })
    try {
      const res = await fetch(`${LICHESS_API}/${encodeURIComponent(handle)}`, {
        signal: controller.signal,
      })
      if (res.status === 404) {
        setLichessLookup({ status: 'notfound' })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setLichessLookup({ status: 'found', user: data })
    } catch (err) {
      if (err.name === 'AbortError') return
      console.warn('lichess lookup failed', err)
      setLichessLookup({ status: 'error' })
    }
  }, 450)
  return () => {
    controller.abort()
    clearTimeout(timer)
  }
}, [form.lichessUsername])
```

- [ ] **Step 5: Computar rating actual de lichess para el hint**

Debajo del `currentRating` de chess.com, agregar:

```jsx
const currentLichessRating =
  lichessLookup.status === 'found'
    ? lichessLookup.user?.perfs?.[tiempoMeta.lichessKey]?.rating ?? null
    : null
```

- [ ] **Step 6: Sumar el input de lichess al JSX**

Después del bloque `<label>` de "Usuario de chess.com" (línea 197-207 del original), agregar:

```jsx
<label>
  Usuario de Lichess <span className="form__optional">(opcional)</span>
  <input
    placeholder="DrNykterstein"
    autoComplete="off"
    autoCapitalize="off"
    spellCheck={false}
    value={form.lichessUsername}
    onChange={update('lichessUsername')}
  />
  <LichessHint
    lookup={lichessLookup}
    tiempoLabel={tiempoMeta.label}
    rating={currentLichessRating}
  />
</label>
```

Y en el label de chess.com, reemplazar `<ChessComHint lookup={lookup} ...>` por `<ChessComHint lookup={chessLookup} ...>`.

- [ ] **Step 7: Sumar el componente `LichessHint`**

Al final del archivo, después de `ChessComHint`, agregar:

```jsx
function LichessHint({ lookup, tiempoLabel, rating }) {
  if (lookup.status === 'idle') return null
  if (lookup.status === 'loading')
    return <div className="form__hint">BUSCANDO…</div>
  if (lookup.status === 'notfound')
    return (
      <div className="form__hint form__hint--warn">
        NO ENCONTRAMOS ESE USUARIO
      </div>
    )
  if (lookup.status === 'error')
    return (
      <div className="form__hint form__hint--warn">
        NO PUDIMOS CONSULTAR LICHESS
      </div>
    )
  const { user } = lookup
  const displayName =
    user.profile?.realName?.trim() || `@${user.username ?? user.id}`
  return (
    <div className="form__hint form__hint--found">
      <span className="form__hint-text">
        <span className="form__hint-name">{displayName}</span>
        {rating != null && (
          <span className="form__hint-rating">
            {tiempoLabel} {rating}
          </span>
        )}
      </span>
    </div>
  )
}
```

(Sin avatar — Lichess no expone uno fiable en la API pública. La key correcta del username devuelto es `user.id` o `user.username` según versión; usamos fallback.)

- [ ] **Step 8: Verificar visualmente**

Abrir el form en `/`, llegar al stage `form`. Tipear un handle real de Lichess (ej `DrNykterstein`) y un handle inexistente. Confirmar:
- Carga "BUSCANDO…" mientras hace fetch.
- Muestra nombre + rating del tiempo seleccionado cuando encuentra.
- Muestra "NO ENCONTRAMOS ESE USUARIO" en 404.

- [ ] **Step 9: Commit**

```bash
git add src/components/RegistrationForm.jsx
git commit -m "feat(form): input y lookup de Lichess junto a chess.com"
```

---

## Task 7: Form — payload incluye lichess y diff de errores duplicados

**Files:**
- Modify: `src/components/RegistrationForm.jsx`

- [ ] **Step 1: Extender el payload del submit con columnas lichess**

En el handler `onSubmit` de `RegistrationForm`, dentro del bloque `payload = {...}` (línea ~119-133), después de `chess_rating_bullet`, agregar:

```jsx
const lichessFound = lichessLookup.status === 'found' ? lichessLookup.user : null

// ... resto del payload ...
const payload = {
  // ... columnas existentes ...
  chess_rating_rapid: stats?.chess_rapid?.last?.rating ?? null,
  chess_rating_blitz: stats?.chess_blitz?.last?.rating ?? null,
  chess_rating_bullet: stats?.chess_bullet?.last?.rating ?? null,
  lichess_username: lichessFound?.username ?? lichessFound?.id ?? null,
  lichess_name: lichessFound?.profile?.realName ?? null,
  lichess_url: lichessFound?.url ?? (lichessFound ? `https://lichess.org/@/${lichessFound.username ?? lichessFound.id}` : null),
  lichess_rating_rapid: lichessFound?.perfs?.rapid?.rating ?? null,
  lichess_rating_blitz: lichessFound?.perfs?.blitz?.rating ?? null,
  lichess_rating_bullet: lichessFound?.perfs?.bullet?.rating ?? null,
}
```

Y arriba del `payload`, donde se computa `found = lookup.status === 'found' ? lookup.profile : null`, reemplazar por:

```jsx
const found = chessLookup.status === 'found' ? chessLookup.profile : null
const stats = chessLookup.status === 'found' ? chessLookup.stats : null
const lichessFound = lichessLookup.status === 'found' ? lichessLookup.user : null
```

- [ ] **Step 2: Diferenciar mensajes de error según constraint**

Reemplazar el bloque de manejo del error 23505 (líneas ~139-148):

```jsx
if (error) {
  if (error.code === '23505') {
    const msg = (error.message ?? '').toLowerCase()
    if (msg.includes('chess_username')) {
      setSubmitError('Ese usuario de chess.com ya está anotado.')
    } else if (msg.includes('lichess_username')) {
      setSubmitError('Ese usuario de Lichess ya está anotado.')
    } else {
      setSubmitError('Ese email ya está anotado.')
    }
  } else {
    console.warn('supabase insert failed', error)
    setSubmitError('No pudimos guardar tu inscripción. Probá de nuevo.')
  }
  setSubmitting(false)
  return
}
```

(El nombre del índice contiene `chess_username` o `lichess_username`, así que match por substring en `error.message` es estable. La unique de email viene del check existente y no contiene esas substrings.)

- [ ] **Step 3: Verificar manualmente**

Anotarse con un chess_username que ya existe → "Ese usuario de chess.com ya está anotado." Anotarse con un lichess_username que ya existe → "Ese usuario de Lichess ya está anotado." Anotarse con email repetido → "Ese email ya está anotado."

- [ ] **Step 4: Commit**

```bash
git add src/components/RegistrationForm.jsx
git commit -m "feat(form): incluir lichess en payload y diff de error 23505"
```

---

## Task 8: Helpers de stats (TDD)

**Files:**
- Create: `src/lib/registration-stats.js`
- Test: `src/lib/registration-stats.test.js`

- [ ] **Step 1: Escribir los tests**

Crear `src/lib/registration-stats.test.js`:

```js
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
```

- [ ] **Step 2: Correr tests, ver que fallan**

```bash
pnpm test src/lib/registration-stats.test.js
```

Expected: FAIL — `Cannot find module './registration-stats'`.

- [ ] **Step 3: Implementar los helpers**

Crear `src/lib/registration-stats.js`:

```js
// Promedio de rating para un tiempo dado (rapid|blitz|bullet).
// Por inscripto: si tiene chess y lichess en el tiempo → promedio de los dos.
// Si tiene solo uno → ese valor. Si no tiene ninguno → no cuenta.
// Devuelve un entero redondeado, o null si el set queda vacío.
export function averageRatingByTiempo(rows, tiempo) {
  const chessKey = `chess_rating_${tiempo}`
  const lichessKey = `lichess_rating_${tiempo}`
  const perPerson = []
  for (const r of rows) {
    const c = typeof r[chessKey] === 'number' ? r[chessKey] : null
    const l = typeof r[lichessKey] === 'number' ? r[lichessKey] : null
    if (c != null && l != null) perPerson.push((c + l) / 2)
    else if (c != null) perPerson.push(c)
    else if (l != null) perPerson.push(l)
  }
  if (perPerson.length === 0) return null
  return Math.round(perPerson.reduce((a, b) => a + b, 0) / perPerson.length)
}

// Cuenta inscriptos con al menos una plataforma cargada (chess o lichess).
export function onlineRatio(rows) {
  const total = rows.length
  if (total === 0) return { withAny: 0, total: 0, pct: null }
  const withAny = rows.filter(
    (r) => r.chess_username || r.lichess_username,
  ).length
  return { withAny, total, pct: Math.round((withAny / total) * 100) }
}
```

- [ ] **Step 4: Correr tests, ver que pasan**

```bash
pnpm test src/lib/registration-stats.test.js
```

Expected: 7 passed (4 de `averageRatingByTiempo` + 3 de `onlineRatio`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-stats.js src/lib/registration-stats.test.js
git commit -m "feat(lib): helpers averageRatingByTiempo y onlineRatio"
```

---

## Task 9: Dashboard stats — usar los helpers nuevos y renderizar 3 filas

**Files:**
- Modify: `src/components/DashboardRegistrations.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Importar los helpers**

Tope de `src/components/DashboardRegistrations.jsx`, después de los imports de supabase:

```jsx
import { averageRatingByTiempo, onlineRatio } from '../lib/registration-stats'
```

- [ ] **Step 2: Reemplazar el `useMemo` de stats**

Reemplazar el bloque `const stats = useMemo(...)` (líneas 47-61) por:

```jsx
const stats = useMemo(() => {
  const byTiempo = { rapid: 0, blitz: 0, bullet: 0 }
  for (const r of rows) {
    if (byTiempo[r.tiempo] != null) byTiempo[r.tiempo]++
  }
  return {
    total: rows.length,
    byTiempo,
    avgRapid: averageRatingByTiempo(rows, 'rapid'),
    avgBlitz: averageRatingByTiempo(rows, 'blitz'),
    avgBullet: averageRatingByTiempo(rows, 'bullet'),
    online: onlineRatio(rows),
  }
}, [rows])
```

- [ ] **Step 3: Sumar modifier CSS para grid de 3 columnas**

En `src/Dashboard.css`, después del bloque `.dashboard__stats` (línea 143-148), agregar:

```css
.dashboard__stats--three {
  grid-template-columns: repeat(3, 1fr);
}

@media (max-width: 720px) {
  .dashboard__stats--three {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Reemplazar el JSX de la fila 2 (3 rating prom)**

Reemplazar el bloque `<div className="dashboard__stats-row">` (líneas ~159-173) por:

```jsx
<div className="dashboard__stats dashboard__stats--three">
  <div className="dashboard__stat">
    <span className="dashboard__stat-label">Rating prom · Rapid</span>
    <span className="dashboard__stat-value">{stats.avgRapid ?? '—'}</span>
  </div>
  <div className="dashboard__stat">
    <span className="dashboard__stat-label">Rating prom · Blitz</span>
    <span className="dashboard__stat-value">{stats.avgBlitz ?? '—'}</span>
  </div>
  <div className="dashboard__stat">
    <span className="dashboard__stat-label">Rating prom · Bullet</span>
    <span className="dashboard__stat-value">{stats.avgBullet ?? '—'}</span>
  </div>
</div>
```

(La fila 3 con Ratio online + Torneos organizados + Prom jugadores se agrega en Task 10. La regla CSS legacy `.dashboard__stats-row` queda en el archivo sin usar — se puede limpiar más adelante.)

- [ ] **Step 5: Verificar visualmente**

Recargar el dashboard, tab Inscriptos. Confirmar:
- Primera fila: Total / Rapid / Blitz / Bullet (igual que antes).
- Segunda fila: 3 tarjetas de Rating prom (Rapid / Blitz / Bullet) en grid de 3 columnas.
- Los valores numéricos pintan razonables (con los datos actuales, sin lichess cargado, deberían coincidir con los chess ratings).

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardRegistrations.jsx src/Dashboard.css
git commit -m "feat(dashboard): rating prom por tiempo (rapid/blitz/bullet)"
```

---

## Task 10: Dashboard — fila 3 con Ratio online + métricas de torneos

**Files:**
- Modify: `src/components/DashboardRegistrations.jsx`

- [ ] **Step 1: Sumar estado y query de torneos**

En `DashboardRegistrations`, agregar un nuevo estado debajo de `[rows, setRows]`:

```jsx
const [tournamentStats, setTournamentStats] = useState({
  count: null,
  avgPlayers: null,
})
```

Y dentro del `useEffect` que llama `load()`, sumar un efecto separado al lado:

```jsx
useEffect(() => {
  let cancelled = false
  const fetchTournamentStats = async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, status, tournament_participants(count)')
      .neq('status', 'draft')
    if (cancelled) return
    if (error) {
      console.warn('tournament stats load failed', error)
      setTournamentStats({ count: null, avgPlayers: null })
      return
    }
    const count = data.length
    if (count === 0) {
      setTournamentStats({ count: 0, avgPlayers: null })
      return
    }
    const totalPlayers = data.reduce(
      (acc, t) => acc + (t.tournament_participants?.[0]?.count ?? 0),
      0,
    )
    setTournamentStats({
      count,
      avgPlayers: Math.round(totalPlayers / count),
    })
  }
  fetchTournamentStats()
  return () => {
    cancelled = true
  }
}, [])
```

(Nota sobre la query: Supabase devuelve el embedded count como `[{ count: N }]` cuando usás la sintaxis `tournament_participants(count)`. El acceso `[0]?.count` cubre el caso.)

- [ ] **Step 2: Agregar tercera fila de stats (3 columnas: Ratio + Torneos + Prom)**

Después del bloque de la fila 2 (cierre del `<div className="dashboard__stats dashboard__stats--three">` con los 3 rating prom), agregar:

```jsx
<div className="dashboard__stats dashboard__stats--three">
  <div className="dashboard__stat">
    <span className="dashboard__stat-label">Ratio online</span>
    <span className="dashboard__stat-value">
      {stats.online.withAny} / {stats.online.total}
    </span>
    <span className="dashboard__stat-sub">
      {stats.online.pct != null ? `${stats.online.pct}%` : '—'}
    </span>
  </div>
  <div className="dashboard__stat">
    <span className="dashboard__stat-label">Torneos organizados</span>
    <span className="dashboard__stat-value">
      {tournamentStats.count ?? '—'}
    </span>
  </div>
  <div className="dashboard__stat">
    <span className="dashboard__stat-label">Prom jugadores/torneo</span>
    <span className="dashboard__stat-value">
      {tournamentStats.avgPlayers ?? '—'}
    </span>
  </div>
</div>
```

Reutiliza el modifier `--three` que se sumó en Task 9 Step 3.

- [ ] **Step 3: Verificar visualmente**

Confirmar las 3 filas finales:
- Fila 1: Total / Rapid / Blitz / Bullet (4 cards, grid base).
- Fila 2: 3 Rating prom (3 cards, grid `--three`).
- Fila 3: Ratio online / Torneos organizados / Prom jugadores (3 cards, grid `--three`).

Con datos actuales debería pintar al menos 1 torneo (hay uno con status `ongoing` según el schema check).

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardRegistrations.jsx
git commit -m "feat(dashboard): fila 3 con ratio online + métricas de torneos"
```

---

## Task 11: Dashboard table — columnas Chess.com + Lichess (cada una con handle + rating)

**Files:**
- Modify: `src/components/DashboardRegistrations.jsx`

- [ ] **Step 1: Reemplazar la lista `COLUMNS`**

Reemplazar el array `COLUMNS` (líneas 6-15) por:

```jsx
const COLUMNS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'tiempo', label: 'Tiempo' },
  { key: 'chess_username', label: 'Chess.com' },
  { key: 'lichess_username', label: 'Lichess' },
  { key: 'twitter_handle', label: 'Twitter' },
  { key: 'created_at', label: 'Fecha' },
]
```

- [ ] **Step 2: Eliminar la función `ratingOf` y simplificar `compareRows`**

Borrar la función `ratingOf` (líneas 23-25) — ya no se usa. Reemplazar `compareRows` (líneas 33-41) por:

```jsx
function compareRows(a, b, key) {
  const va = a[key]
  const vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'es')
}
```

- [ ] **Step 3: Reemplazar la celda de chess.com y agregar la de lichess**

En el `<tbody>`, dentro de `filteredRows.map((r) => {...})`, reemplazar el bloque que renderiza la fila (líneas 200-256) por:

```jsx
{filteredRows.map((r) => {
  const chessRating = r[`chess_rating_${r.tiempo}`] ?? null
  const lichessRating = r[`lichess_rating_${r.tiempo}`] ?? null
  return (
    <tr key={r.id ?? `${r.email}-${r.created_at}`}>
      <td>{r.nombre}</td>
      <td>{r.email}</td>
      <td>
        {r.phone ? (
          <a
            className="dashboard__link"
            href={waLink(r.phone) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
          >
            {r.phone}
          </a>
        ) : (
          <span className="dashboard__muted">—</span>
        )}
      </td>
      <td>{TIEMPO_LABEL[r.tiempo] ?? r.tiempo}</td>
      <td>
        {r.chess_username ? (
          <a
            className="dashboard__chess"
            href={r.chess_url ?? `https://www.chess.com/member/${r.chess_username}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {r.chess_avatar && (
              <img className="dashboard__chess-avatar" src={r.chess_avatar} alt="" />
            )}
            @{r.chess_username}
            {chessRating != null && (
              <span className="dashboard__muted"> · {TIEMPO_LABEL[r.tiempo].toLowerCase()} {chessRating}</span>
            )}
          </a>
        ) : (
          <span className="dashboard__muted">—</span>
        )}
      </td>
      <td>
        {r.lichess_username ? (
          <a
            className="dashboard__chess"
            href={r.lichess_url ?? `https://lichess.org/@/${r.lichess_username}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            @{r.lichess_username}
            {lichessRating != null && (
              <span className="dashboard__muted"> · {TIEMPO_LABEL[r.tiempo].toLowerCase()} {lichessRating}</span>
            )}
          </a>
        ) : (
          <span className="dashboard__muted">—</span>
        )}
      </td>
      <td>
        {r.twitter_handle ? (
          <a
            className="dashboard__link"
            href={`https://x.com/${r.twitter_handle}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            @{r.twitter_handle}
          </a>
        ) : (
          <span className="dashboard__muted">—</span>
        )}
      </td>
      <td>{formatDate(r.created_at)}</td>
    </tr>
  )
})}
```

(Reutiliza `.dashboard__chess` para mantener el styling de avatar+handle. La columna "Rating" anterior se eliminó.)

- [ ] **Step 4: Verificar visualmente**

Confirmar:
- Aparece columna Chess.com y Lichess.
- En cada celda con handle: muestra `@handle · rapid 1450` (o el tiempo del inscripto).
- Si no tiene esa plataforma: `—` muted.
- La columna "Rating" anterior ya no está.
- Sort por chess.com y lichess funciona alfabéticamente.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardRegistrations.jsx
git commit -m "feat(dashboard): columnas Chess.com y Lichess con handle + rating"
```

---

## Task 12: Acento de color sutil

**Files:**
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Sumar la variable `--accent`**

En `src/Dashboard.css`, dentro del bloque `:root`-style del top (línea 1-17, el de `.dashboard, .dashboard-login`), después de `--btn-ink`, agregar:

```css
--accent: #a3e635;
--accent-soft: rgba(163, 230, 53, 0.18);
```

- [ ] **Step 2: Aplicar accent en botones primarios**

Reemplazar el bloque `.dashboard__btn` (líneas 49-59):

```css
.dashboard__btn {
  background: var(--btn-bg);
  color: var(--btn-ink);
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.dashboard__btn:hover:not(:disabled) {
  border-color: var(--accent);
}
```

- [ ] **Step 3: Aplicar accent en tab activo**

Reemplazar el selector `.dashboard__tab[data-active='true']` (línea 336-339):

```css
.dashboard__tab[data-active='true'] {
  background: var(--ink-soft-14);
  color: var(--ink);
  box-shadow: inset 0 -2px 0 0 var(--accent);
}
```

- [ ] **Step 4: Aplicar accent en status pill "ongoing"**

Reemplazar `.dashboard__tournament-status[data-status='ongoing']` (líneas 413-416):

```css
.dashboard__tournament-status[data-status='ongoing'] {
  background: var(--accent-soft);
  color: var(--accent);
}
```

- [ ] **Step 5: Aplicar accent en header de columna sorteada**

En `src/Dashboard.css`, después de `.dashboard__table th:hover` (línea 234-236), agregar:

```css
.dashboard__table th[data-sorted='true'] {
  color: var(--accent);
}
```

- [ ] **Step 6: Pasar el sort state al `th` en el JSX**

En `src/components/DashboardRegistrations.jsx`, en el `<thead>`, reemplazar:

```jsx
<th key={col.key} onClick={() => toggleSort(col.key)}>
  {col.label}
  {sort.key === col.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
</th>
```

por:

```jsx
<th
  key={col.key}
  onClick={() => toggleSort(col.key)}
  data-sorted={sort.key === col.key ? 'true' : 'false'}
>
  {col.label}
  {sort.key === col.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
</th>
```

- [ ] **Step 7: Verificar visualmente**

Confirmar:
- Hover en botones primarios pinta borde lima.
- Tab activo tiene underline lima.
- Torneos "en curso" tienen pill lima clarito.
- Click en una columna ordena, el header de esa columna pinta lima.
- El resto del dashboard sigue negro/glass como antes.

- [ ] **Step 8: Commit**

```bash
git add src/Dashboard.css src/components/DashboardRegistrations.jsx
git commit -m "feat(dashboard): acento de color lima en botones, tabs y sort"
```

---

## Task 13: Run-through final + tests

**Files:** ninguno (verificación)

- [ ] **Step 1: Correr suite completa de tests**

```bash
pnpm test
```

Expected: todos los tests pasan, incluyendo los nuevos en `src/lib/lichess.test.js` y `src/lib/registration-stats.test.js`, sin romper `pairing.test.js` ni `standings.test.js`.

- [ ] **Step 2: Build de producción**

```bash
pnpm build
```

Expected: build exitoso, sin errores ni warnings nuevos.

- [ ] **Step 3: Smoke manual end-to-end**

1. Login con credenciales válidas → ver placeholders en form vacío.
2. Dashboard cargado → logo SVG en header.
3. Tab Inscriptos → 3 filas de stats (Total/Rapid/Blitz/Bullet, 3 Rating prom + Ratio online, Torneos + Prom jugadores).
4. Tabla → columnas Chess.com y Lichess con handle + rating.
5. Volver al form público (cerrar sesión, ir a `/`) → llenar inscripción con solo chess, solo lichess, ambos, ninguno. Verificar que cada combinación inserta bien.
6. Intentar repetir un chess_username existente → error específico.
7. Intentar repetir un lichess_username existente → error específico.
8. Visual: ver lima en hovers, tab activo, ongoing pills.

- [ ] **Step 4: Commit final (si hay ajustes menores)**

Solo si surgieron tweaks visuales o de copy durante el smoke. Si no, no hay commit.

---

## Notas

- **Dev server**: el usuario lo mantiene corriendo (`pnpm dev`). No correrlo desde tasks.
- **Lint**: el usuario considera `pnpm lint` inútil. No correrlo.
- **Knowledge base 3D**: irrelevante para este plan — los cambios son de UI 2D, form y dashboard.
- **Backwards compat**: los inscriptos viejos no tienen `lichess_*` (todo NULL). El dashboard maneja esto con `?? null` y `?? '—'`. No hace falta migrar datos.
