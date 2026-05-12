# Torneos + Pairing Swiss — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar al dashboard admin la creación de torneos tipo Swiss con asignación manual de jugadores, generación de pairings por elo, carga de resultados ronda por ronda y standings con tiebreakers.

**Architecture:** Tres tablas nuevas en Supabase (`tournaments`, `tournament_participants`, `tournament_matches`) con RLS solo para `authenticated`. Algoritmo de pairing y cómputo de standings como funciones puras en `src/lib/pairing.js` y `src/lib/standings.js`. UI dentro del `DashboardView` mediante tabs ("Inscriptos" / "Torneos") con state interno, sin router. La vista detalle del torneo es single-page con secciones (meta, jugadores, standings, ronda actual, rondas pasadas).

**Tech Stack:** React 19, Vite 8, @supabase/supabase-js 2.x. **Vitest** (nuevo) para tests unitarios del algoritmo de pairing y standings. Sin librerías de Swiss pairing (implementación propia).

**Verification:** El proyecto no tenía test framework. Sumamos vitest **solo** para `src/lib/pairing.js` y `src/lib/standings.js` (algoritmos puros). El resto (UI, fetch, Supabase) se verifica manualmente en el dev server que el usuario mantiene corriendo. **No correr `pnpm dev` ni `pnpm lint`** desde los subagentes.

**Spec:** `docs/superpowers/specs/2026-05-12-tournaments-design.md`

---

## File Structure

```
src/
  Dashboard.css                              (modify)  estilos para tabs, cards, tournament detail, picker
  components/
    DashboardView.jsx                        (modify)  shell: tabs + dispatch a la tab activa
    DashboardRegistrations.jsx               (create)  lo que hoy hace DashboardView (extraído)
    DashboardTournaments.jsx                 (create)  lista + new tournament + dispatch a detail
    TournamentDetail.jsx                     (create)  vista detalle del torneo
    TournamentPlayerPicker.jsx               (create)  modal multi-select para agregar inscriptos
  lib/
    pairing.js                               (create)  algoritmo Swiss puro
    pairing.test.js                          (create)  tests vitest
    standings.js                             (create)  cómputo standings puro
    standings.test.js                        (create)  tests vitest
    tournaments.js                           (create)  helpers Supabase

vite.config.js                               (modify)  test config para vitest
package.json                                 (modify)  + vitest devDep, + "test" script
docs/superpowers/specs/2026-05-12-tournaments-design.md  (referencia)
```

### Responsabilidades por archivo

- `lib/pairing.js`: función pura `generateRound(participants, previousMatches, options)` → array de matches sin id. Sin imports React ni Supabase.
- `lib/standings.js`: función pura `computeStandings(participants, matches)` → array ordenado. Sin imports React ni Supabase.
- `lib/tournaments.js`: todas las llamadas a Supabase (listTournaments, createTournament, addParticipants, etc.). Cada función devuelve `{ data, error }` o lanza, según convenga.
- `components/DashboardView.jsx`: layout shell. Header con tabs + dispatch. Mantiene el estado de la tab activa.
- `components/DashboardRegistrations.jsx`: TODO el contenido de stats/search/table que hoy vive en DashboardView, ahora sin el header (lo provee el shell).
- `components/DashboardTournaments.jsx`: lista de torneos, modal "nuevo", maneja también el state de "torneo seleccionado". Si hay selected, renderiza TournamentDetail.
- `components/TournamentDetail.jsx`: 5 secciones (meta, jugadores, standings, ronda actual, rondas pasadas) + acciones (empezar, generar ronda, cerrar, eliminar).
- `components/TournamentPlayerPicker.jsx`: modal con buscador + multi-select por checkboxes.

---

## Pre-requisito (acción del controller / usuario)

Antes de la Task 2 hay que aplicar la migración SQL en Supabase. Lo hace el controller (vía MCP `mcp__supabase__apply_migration`) o el usuario en el SQL editor. La Task 2 incluye el SQL completo y la verificación.

---

## Task 1: Setup de vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/lib/pairing.test.js` (smoke test inicial)

- [ ] **Step 1: Instalar vitest como devDependency**

```bash
pnpm add -D vitest
```

Expected: `package.json` gana `"vitest": "^3.x.x"` en devDependencies y `pnpm-lock.yaml` se actualiza.

- [ ] **Step 2: Agregar script "test" a package.json**

En la sección `"scripts"` agregar:

```json
"test": "vitest run",
"test:watch": "vitest"
```

(Conservar `"dev"`, `"build"`, `"lint"`, `"preview"` como están.)

- [ ] **Step 3: Configurar vitest en vite.config.js**

Reemplazar el contenido entero de `vite.config.js` por:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
```

- [ ] **Step 4: Smoke test**

Crear `src/lib/pairing.test.js` con un test trivial para verificar el setup:

```js
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Correr el test y verificar**

```bash
pnpm test
```

Expected: 1 passing test. Si falla, revisar el config.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.js src/lib/pairing.test.js
git commit -m "Setup de vitest para tests del algoritmo de pairing"
```

---

## Task 2: Migración SQL (tournaments, tournament_participants, tournament_matches)

**Files:**
- Aplicado vía MCP de Supabase (no hay archivo en repo).

**Pre-requisito:** El controller / usuario aplica la siguiente migración vía `mcp__supabase__apply_migration` con `name = "tournaments_create_tables"`. Si lo hace el subagente, debe pedirle al controller que aplique el SQL.

- [ ] **Step 1: Aplicar migración**

SQL:

```sql
-- Trigger function para refrescar updated_at
create or replace function public.tournaments_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- tournaments
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique,
  tiempo text not null check (tiempo in ('rapid','blitz','bullet')),
  status text not null default 'draft' check (status in ('draft','ongoing','finished')),
  total_rounds int,
  current_round int not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tournaments_status_created_at_idx
  on public.tournaments(status, created_at desc);

create trigger tournaments_updated_at
  before update on public.tournaments
  for each row execute function public.tournaments_set_updated_at();

alter table public.tournaments enable row level security;

create policy tournaments_authenticated_all
  on public.tournaments
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.tournaments to authenticated;

-- tournament_participants
create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  registration_id uuid not null references public.techess_registrations(id) on delete restrict,
  seed_rating int not null check (seed_rating between 0 and 4000),
  withdrawn boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tournament_id, registration_id)
);

create index tournament_participants_tournament_idx
  on public.tournament_participants(tournament_id);

alter table public.tournament_participants enable row level security;

create policy tournament_participants_authenticated_all
  on public.tournament_participants
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.tournament_participants to authenticated;

-- tournament_matches
create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number int not null check (round_number >= 1),
  white_id uuid references public.tournament_participants(id),
  black_id uuid references public.tournament_participants(id),
  result text check (result in ('white','black','draw','bye')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (white_id is not null or black_id is not null),
  check (
    result is null
    or result <> 'bye'
    or (white_id is not null and black_id is null)
    or (white_id is null and black_id is not null)
  )
);

create index tournament_matches_tournament_round_idx
  on public.tournament_matches(tournament_id, round_number);

create unique index tournament_matches_white_unique
  on public.tournament_matches(tournament_id, round_number, white_id)
  where white_id is not null;

create unique index tournament_matches_black_unique
  on public.tournament_matches(tournament_id, round_number, black_id)
  where black_id is not null;

create trigger tournament_matches_updated_at
  before update on public.tournament_matches
  for each row execute function public.tournaments_set_updated_at();

alter table public.tournament_matches enable row level security;

create policy tournament_matches_authenticated_all
  on public.tournament_matches
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.tournament_matches to authenticated;
```

- [ ] **Step 2: Verificar que las 3 tablas existen con RLS habilitada**

Ejecutar (via `mcp__supabase__execute_sql` o SQL editor):

```sql
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename in (
  'tournaments','tournament_participants','tournament_matches'
)
order by tablename;
```

Expected: 3 rows, todas con `rowsecurity = true`.

- [ ] **Step 3: Verificar que el rol `authenticated` tiene grants**

```sql
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
  and table_name in ('tournaments','tournament_participants','tournament_matches')
order by table_name, privilege_type;
```

Expected: 12 rows (4 privilegios × 3 tablas), con SELECT/INSERT/UPDATE/DELETE para cada tabla.

- [ ] **Step 4: No hay commit local — la migración vive en Supabase.**

---

## Task 3: Algoritmo de pairing — Ronda 1 (split-half)

**Files:**
- Modify: `src/lib/pairing.test.js`
- Create: `src/lib/pairing.js`

- [ ] **Step 1: Escribir tests para ronda 1**

Reemplazar el contenido entero de `src/lib/pairing.test.js` por:

```js
import { describe, it, expect } from 'vitest'
import { generateRound } from './pairing'

describe('generateRound — ronda 1 (split-half)', () => {
  it('empareja 4 jugadores: top con bottom alternando colores', () => {
    const participants = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
      { id: 'd', seed_rating: 1400, withdrawn: false },
    ]
    const result = generateRound(participants, [], { roundNumber: 1 })
    expect(result.matches).toEqual([
      { round_number: 1, white_id: 'a', black_id: 'c', result: null },
      { round_number: 1, white_id: 'd', black_id: 'b', result: null },
    ])
    expect(result.warnings).toEqual([])
  })

  it('con N impar asigna bye al menor rating', () => {
    const participants = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
      { id: 'd', seed_rating: 1400, withdrawn: false },
      { id: 'e', seed_rating: 1200, withdrawn: false },
    ]
    const result = generateRound(participants, [], { roundNumber: 1 })
    const bye = result.matches.find((m) => m.result === 'bye')
    expect(bye).toBeDefined()
    expect(bye.white_id).toBe('e') // menor rating
    expect(bye.black_id).toBeNull()
    expect(result.matches.filter((m) => m.result === null)).toHaveLength(2)
  })

  it('excluye participantes withdrawn', () => {
    const participants = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: true },
      { id: 'c', seed_rating: 1600, withdrawn: false },
    ]
    const result = generateRound(participants, [], { roundNumber: 1 })
    // Quedan 2 activos: 1 match, sin bye
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].result).toBeNull()
  })

  it('desempata por seed_rating idéntico usando id alfabético', () => {
    const participants = [
      { id: 'zeta', seed_rating: 1500, withdrawn: false },
      { id: 'alpha', seed_rating: 1500, withdrawn: false },
      { id: 'mike', seed_rating: 1500, withdrawn: false },
      { id: 'bravo', seed_rating: 1500, withdrawn: false },
    ]
    const result = generateRound(participants, [], { roundNumber: 1 })
    // Ordenados por rating desc, desempate id asc: alpha, bravo, mike, zeta
    // S1 = [alpha, bravo], S2 = [mike, zeta]
    expect(result.matches[0].white_id).toBe('alpha')
    expect(result.matches[0].black_id).toBe('mike')
    expect(result.matches[1].white_id).toBe('zeta')
    expect(result.matches[1].black_id).toBe('bravo')
  })
})
```

- [ ] **Step 2: Correr tests, deben fallar**

```bash
pnpm test
```

Expected: 4 tests, todos fallan con "Cannot find module './pairing'" o similar.

- [ ] **Step 3: Implementar pairing.js para ronda 1**

Crear `src/lib/pairing.js`:

```js
// Pure Swiss pairing for techess.
// generateRound(participants, previousMatches, { roundNumber }) → { matches, warnings }
// participants: [{ id, seed_rating, withdrawn }]
// previousMatches: [{ round_number, white_id, black_id, result }]
// Round 1 uses split-half by rating; subsequent rounds group by score.

function sortBySeed(arr) {
  return [...arr].sort((a, b) => {
    if (b.seed_rating !== a.seed_rating) return b.seed_rating - a.seed_rating
    return String(a.id).localeCompare(String(b.id))
  })
}

function pickBye(pool, hadBye) {
  // Lowest rating without prior bye. If all already had bye, pick lowest rating.
  const eligible = pool.filter((p) => !hadBye.has(p.id))
  const target = eligible.length > 0 ? eligible : pool
  return target[target.length - 1] // last after sort = lowest seed
}

export function generateRound(participants, previousMatches, options) {
  const { roundNumber } = options
  const active = participants.filter((p) => !p.withdrawn)
  const hadBye = new Set(
    previousMatches
      .filter((m) => m.result === 'bye')
      .map((m) => m.white_id ?? m.black_id),
  )

  if (roundNumber === 1) {
    return pairRound1(active, hadBye)
  }
  // Subsequent rounds — implementation in next task
  throw new Error('Rondas posteriores aún no implementadas')
}

function pairRound1(active, hadBye) {
  const sorted = sortBySeed(active)
  let pool = sorted
  const matches = []

  if (pool.length % 2 === 1) {
    const byeP = pickBye(pool, hadBye)
    matches.push({ round_number: 1, white_id: byeP.id, black_id: null, result: 'bye' })
    pool = pool.filter((p) => p.id !== byeP.id)
  }

  const half = pool.length / 2
  const s1 = pool.slice(0, half)
  const s2 = pool.slice(half)

  for (let i = 0; i < half; i++) {
    const a = s1[i]
    const b = s2[i]
    // Alternate colors by row index: even → s1 white, odd → s2 white
    const white = i % 2 === 0 ? a : b
    const black = i % 2 === 0 ? b : a
    matches.push({ round_number: 1, white_id: white.id, black_id: black.id, result: null })
  }

  return { matches, warnings: [] }
}
```

- [ ] **Step 4: Correr tests, deben pasar**

```bash
pnpm test
```

Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pairing.js src/lib/pairing.test.js
git commit -m "Implementar pairing de ronda 1 con split-half y bye"
```

---

## Task 4: Algoritmo de pairing — Rondas 2+ con agrupamiento por puntaje

**Files:**
- Modify: `src/lib/pairing.test.js` (agregar tests)
- Modify: `src/lib/pairing.js` (implementar rondas siguientes)

- [ ] **Step 1: Agregar tests para rondas siguientes**

Al final de `src/lib/pairing.test.js`, agregar:

```js
describe('generateRound — rondas 2+', () => {
  const fourPlayers = [
    { id: 'a', seed_rating: 2000, withdrawn: false },
    { id: 'b', seed_rating: 1800, withdrawn: false },
    { id: 'c', seed_rating: 1600, withdrawn: false },
    { id: 'd', seed_rating: 1400, withdrawn: false },
  ]

  it('ronda 2 agrupa por puntaje: 1 pt vs 1 pt, 0 pt vs 0 pt', () => {
    // Ronda 1 ganaron a y c (white). Quedan: a=1, b=0, c=1, d=0
    const round1 = [
      { round_number: 1, white_id: 'a', black_id: 'c', result: 'white' }, // a gana
      { round_number: 1, white_id: 'd', black_id: 'b', result: 'black' }, // b gana
    ]
    // Wait — after r1 with that result: a=1 (won), b=1 (won), c=0, d=0
    // So group 1pt: [a,b], group 0pt: [c,d]
    const result = generateRound(fourPlayers, round1, { roundNumber: 2 })
    // Group 1pt is a vs b; group 0pt is c vs d
    const pairs = result.matches
      .filter((m) => m.result === null)
      .map((m) => [m.white_id, m.black_id].sort())
    expect(pairs).toContainEqual(['a', 'b'])
    expect(pairs).toContainEqual(['c', 'd'])
  })

  it('evita rematch permutando dentro del grupo', () => {
    // Ronda 1: a vs b, c vs d. Ahora a=1, b=0, c=1, d=0.
    // Para ronda 2, split del 1pt group [a,c] daría a vs c — pero ya jugaron.
    // El algoritmo debe permutar y emparejar diferente.
    const players = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
      { id: 'd', seed_rating: 1400, withdrawn: false },
    ]
    const round1 = [
      { round_number: 1, white_id: 'a', black_id: 'c', result: 'white' },
      { round_number: 1, white_id: 'd', black_id: 'b', result: 'black' },
    ]
    // After r1: a=1, b=1, c=0, d=0. Pairings dentro de grupos: a-b y c-d (no rematch)
    const result = generateRound(players, round1, { roundNumber: 2 })
    const pairs = result.matches
      .filter((m) => m.result === null)
      .map((m) => [m.white_id, m.black_id].sort())
    expect(pairs).not.toContainEqual(['a', 'c']) // a y c ya jugaron
    expect(pairs).not.toContainEqual(['b', 'd']) // b y d ya jugaron
    expect(result.warnings).toEqual([])
  })

  it('flotea entre grupos si quedan participantes impares', () => {
    // 5 players, ronda 1: a-c, d-b (gana a, gana b), e=bye(+1)
    // After r1: a=1, b=1, c=0, d=0, e=1 → group 1pt: [a,b,e] (impar), group 0pt: [c,d]
    // El algoritmo debe floatar uno de 1pt al 0pt group.
    const players = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1800, withdrawn: false },
      { id: 'c', seed_rating: 1600, withdrawn: false },
      { id: 'd', seed_rating: 1400, withdrawn: false },
      { id: 'e', seed_rating: 1200, withdrawn: false },
    ]
    const round1 = [
      { round_number: 1, white_id: 'a', black_id: 'c', result: 'white' },
      { round_number: 1, white_id: 'd', black_id: 'b', result: 'black' },
      { round_number: 1, white_id: 'e', black_id: null, result: 'bye' },
    ]
    const result = generateRound(players, round1, { roundNumber: 2 })
    // El bye en ronda 2 debe ir a alguien que no haya tenido bye antes (no a 'e').
    const byeMatch = result.matches.find((m) => m.result === 'bye')
    if (byeMatch) {
      expect(byeMatch.white_id).not.toBe('e')
    }
    // 2 matches + opcional 1 bye
    expect(result.matches.length).toBeGreaterThanOrEqual(2)
  })

  it('respeta el cap de colores ±2', () => {
    // Forzar a un jugador a haber jugado 2 blancas seguidas y verificar que en
    // la próxima ronda recibe negras.
    const players = [
      { id: 'a', seed_rating: 2000, withdrawn: false },
      { id: 'b', seed_rating: 1900, withdrawn: false },
      { id: 'c', seed_rating: 1800, withdrawn: false },
      { id: 'd', seed_rating: 1700, withdrawn: false },
    ]
    const matches = [
      // a jugó blancas y ganó
      { round_number: 1, white_id: 'a', black_id: 'c', result: 'white' },
      { round_number: 1, white_id: 'b', black_id: 'd', result: 'white' },
      // a jugó blancas otra vez (forzado para el test) y ganó
      { round_number: 2, white_id: 'a', black_id: 'd', result: 'white' },
      { round_number: 2, white_id: 'b', black_id: 'c', result: 'white' },
    ]
    // Ronda 3: a debería jugar negras (sus colorDiff = +2, máximo permitido sin cap break)
    const result = generateRound(players, matches, { roundNumber: 3 })
    const aMatch = result.matches.find(
      (m) => m.result === null && (m.white_id === 'a' || m.black_id === 'a'),
    )
    expect(aMatch).toBeDefined()
    expect(aMatch.black_id).toBe('a') // a juega negras
  })
})
```

- [ ] **Step 2: Correr tests para confirmar que fallan**

```bash
pnpm test
```

Expected: los 4 nuevos tests fallan con "Rondas posteriores aún no implementadas".

- [ ] **Step 3: Implementar rondas posteriores en pairing.js**

Reemplazar el contenido entero de `src/lib/pairing.js` por:

```js
// Pure Swiss pairing for techess.
// generateRound(participants, previousMatches, { roundNumber }) → { matches, warnings }

function sortBySeed(arr) {
  return [...arr].sort((a, b) => {
    if (b.seed_rating !== a.seed_rating) return b.seed_rating - a.seed_rating
    return String(a.id).localeCompare(String(b.id))
  })
}

function pickBye(pool, hadBye) {
  const eligible = pool.filter((p) => !hadBye.has(p.id))
  const target = eligible.length > 0 ? eligible : pool
  return target[target.length - 1] // last after sort = lowest seed
}

function computePoints(matches) {
  const pts = new Map()
  for (const m of matches) {
    if (m.result === 'bye') {
      const id = m.white_id ?? m.black_id
      pts.set(id, (pts.get(id) ?? 0) + 1)
      continue
    }
    if (m.result === 'white') {
      pts.set(m.white_id, (pts.get(m.white_id) ?? 0) + 1)
      pts.set(m.black_id, pts.get(m.black_id) ?? 0)
    } else if (m.result === 'black') {
      pts.set(m.black_id, (pts.get(m.black_id) ?? 0) + 1)
      pts.set(m.white_id, pts.get(m.white_id) ?? 0)
    } else if (m.result === 'draw') {
      pts.set(m.white_id, (pts.get(m.white_id) ?? 0) + 0.5)
      pts.set(m.black_id, (pts.get(m.black_id) ?? 0) + 0.5)
    }
  }
  return pts
}

function computeOpponents(matches) {
  const opps = new Map()
  for (const m of matches) {
    if (m.result === 'bye') continue
    if (!opps.has(m.white_id)) opps.set(m.white_id, new Set())
    if (!opps.has(m.black_id)) opps.set(m.black_id, new Set())
    opps.get(m.white_id).add(m.black_id)
    opps.get(m.black_id).add(m.white_id)
  }
  return opps
}

function computeColorHistory(matches) {
  // Returns map id → array of 'W' / 'B' in chronological order
  const hist = new Map()
  const sorted = [...matches].sort((a, b) => a.round_number - b.round_number)
  for (const m of sorted) {
    if (m.result === 'bye') continue
    if (!hist.has(m.white_id)) hist.set(m.white_id, [])
    if (!hist.has(m.black_id)) hist.set(m.black_id, [])
    hist.get(m.white_id).push('W')
    hist.get(m.black_id).push('B')
  }
  return hist
}

function colorDiff(history) {
  if (!history) return 0
  let w = 0
  let b = 0
  for (const c of history) c === 'W' ? w++ : b++
  return w - b
}

function tryPermutations(s1, s2, previousOpponents) {
  // Try the default pairing (s1[i] vs s2[i]); if any pair already met, swap
  // within s2 to find a valid arrangement. Returns null if impossible.
  const indices = s2.map((_, i) => i)
  const seen = new Set()
  const tryIt = (perm) => {
    for (let i = 0; i < s1.length; i++) {
      const a = s1[i].id
      const b = s2[perm[i]].id
      if (previousOpponents.get(a)?.has(b)) return null
    }
    return perm.map((j, i) => [s1[i], s2[j]])
  }

  // Generate permutations bounded — for groups > 8 this becomes too many, but
  // groups in Swiss are typically small. Fall back if not found.
  const permute = (arr) => {
    if (arr.length <= 1) return [arr]
    const out = []
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
      for (const p of permute(rest)) out.push([arr[i], ...p])
    }
    return out
  }

  for (const perm of permute(indices)) {
    const key = perm.join(',')
    if (seen.has(key)) continue
    seen.add(key)
    const pairs = tryIt(perm)
    if (pairs) return pairs
  }
  return null
}

function assignColors(pair, colorHistory) {
  const [a, b] = pair
  const diffA = colorDiff(colorHistory.get(a.id))
  const diffB = colorDiff(colorHistory.get(b.id))
  // Preferred color: negative diff (more blacks) → prefers W; positive → prefers B
  const prefA = diffA > 0 ? 'B' : diffA < 0 ? 'W' : null
  const prefB = diffB > 0 ? 'B' : diffB < 0 ? 'W' : null

  let whiteId
  if (prefA && prefB && prefA !== prefB) {
    whiteId = prefA === 'W' ? a.id : b.id
  } else if (prefA && !prefB) {
    whiteId = prefA === 'W' ? a.id : b.id
  } else if (!prefA && prefB) {
    whiteId = prefB === 'B' ? a.id : b.id
  } else if (prefA && prefB && prefA === prefB) {
    // Clash: give the preferred to whoever has larger |diff|
    const absA = Math.abs(diffA)
    const absB = Math.abs(diffB)
    if (absA > absB) {
      whiteId = prefA === 'W' ? a.id : b.id
    } else if (absB > absA) {
      whiteId = prefB === 'W' ? b.id : a.id
    } else {
      // Equal tension: deterministic by id
      whiteId = String(a.id).localeCompare(String(b.id)) < 0 ? a.id : b.id
    }
  } else {
    // Neither has preference (both even) — default a → white
    whiteId = a.id
  }

  // Cap check: would this push someone to |diff| >= 3?
  const wouldDiffA = diffA + (whiteId === a.id ? 1 : -1)
  const wouldDiffB = diffB + (whiteId === b.id ? 1 : -1)
  if (Math.abs(wouldDiffA) >= 3) {
    whiteId = b.id
  } else if (Math.abs(wouldDiffB) >= 3) {
    whiteId = a.id
  }

  return { white_id: whiteId, black_id: whiteId === a.id ? b.id : a.id }
}

export function generateRound(participants, previousMatches, options) {
  const { roundNumber } = options
  const active = participants.filter((p) => !p.withdrawn)
  const hadBye = new Set(
    previousMatches
      .filter((m) => m.result === 'bye')
      .map((m) => m.white_id ?? m.black_id),
  )

  if (roundNumber === 1) {
    return pairRound1(active, hadBye)
  }
  return pairLaterRound(active, previousMatches, hadBye, roundNumber)
}

function pairRound1(active, hadBye) {
  const sorted = sortBySeed(active)
  let pool = sorted
  const matches = []

  if (pool.length % 2 === 1) {
    const byeP = pickBye(pool, hadBye)
    matches.push({ round_number: 1, white_id: byeP.id, black_id: null, result: 'bye' })
    pool = pool.filter((p) => p.id !== byeP.id)
  }

  const half = pool.length / 2
  const s1 = pool.slice(0, half)
  const s2 = pool.slice(half)

  for (let i = 0; i < half; i++) {
    const a = s1[i]
    const b = s2[i]
    const white = i % 2 === 0 ? a : b
    const black = i % 2 === 0 ? b : a
    matches.push({ round_number: 1, white_id: white.id, black_id: black.id, result: null })
  }

  return { matches, warnings: [] }
}

function pairLaterRound(active, previousMatches, hadBye, roundNumber) {
  const points = computePoints(previousMatches)
  const previousOpponents = computeOpponents(previousMatches)
  const colorHistory = computeColorHistory(previousMatches)

  let pool = sortBySeed(active)
  const warnings = []
  const matches = []

  // Asignar bye si N impar (al de menor puntaje + menor rating sin bye previo)
  if (pool.length % 2 === 1) {
    const byCandidates = sortBySeed(pool).reverse() // ascending rating
    // sort ascending by points first, then by rating asc (lowest first)
    byCandidates.sort((a, b) => {
      const pa = points.get(a.id) ?? 0
      const pb = points.get(b.id) ?? 0
      if (pa !== pb) return pa - pb
      return a.seed_rating - b.seed_rating
    })
    const eligible = byCandidates.find((p) => !hadBye.has(p.id)) ?? byCandidates[0]
    matches.push({ round_number: roundNumber, white_id: eligible.id, black_id: null, result: 'bye' })
    pool = pool.filter((p) => p.id !== eligible.id)
  }

  // Agrupar por puntaje
  const groups = new Map()
  for (const p of pool) {
    const pts = points.get(p.id) ?? 0
    if (!groups.has(pts)) groups.set(pts, [])
    groups.get(pts).push(p)
  }
  const sortedPts = [...groups.keys()].sort((a, b) => b - a)
  for (const k of sortedPts) groups.set(k, sortBySeed(groups.get(k)))

  // Procesar grupos de mayor a menor; floatear si tamaño impar
  let floated = []
  const orderedGroups = sortedPts.map((k) => [...groups.get(k)])

  for (let g = 0; g < orderedGroups.length; g++) {
    let group = [...floated, ...orderedGroups[g]]
    floated = []
    if (group.length % 2 === 1 && g < orderedGroups.length - 1) {
      // Float al de menor rating al siguiente grupo
      floated = [group[group.length - 1]]
      group = group.slice(0, -1)
    }
    if (group.length === 0) continue
    if (group.length === 1) {
      // Resto suelto que no puede emparejarse — emparejar con el primero de floated previo / siguiente
      // En el peor caso queda un repeat: se acepta y warning.
      floated = [...floated, ...group]
      continue
    }

    const half = group.length / 2
    const s1 = group.slice(0, half)
    const s2 = group.slice(half)
    const pairs = tryPermutations(s1, s2, previousOpponents)

    let resolved
    if (pairs) {
      resolved = pairs
    } else {
      // Fallback: emparejar tal cual (puede haber repeat)
      resolved = s1.map((p, i) => [p, s2[i]])
      warnings.push(`Ronda ${roundNumber}: emparejamiento con repeat en grupo de ${group[0]?.id ? `pts=${points.get(group[0].id) ?? 0}` : 'desconocido'}`)
    }

    for (const pair of resolved) {
      const { white_id, black_id } = assignColors(pair, colorHistory)
      matches.push({ round_number: roundNumber, white_id, black_id, result: null })
    }
  }

  // Si quedó algún floated suelto sin pareja, hacer ronda con el último previo
  if (floated.length === 1) {
    // Edge: solo si no había nadie con quien emparejar. Marcamos warning.
    warnings.push(`Ronda ${roundNumber}: jugador sin par (${floated[0].id})`)
  }

  return { matches, warnings }
}
```

- [ ] **Step 4: Correr tests, todos deben pasar**

```bash
pnpm test
```

Expected: 8/8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pairing.js src/lib/pairing.test.js
git commit -m "Implementar pairing de rondas 2+ con agrupamiento, rematch avoidance y colores"
```

---

## Task 5: Standings (puntos, Buchholz, wins)

**Files:**
- Create: `src/lib/standings.js`
- Create: `src/lib/standings.test.js`

- [ ] **Step 1: Escribir tests para standings**

Crear `src/lib/standings.test.js`:

```js
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
```

- [ ] **Step 2: Correr tests, deben fallar**

```bash
pnpm test
```

Expected: 5 new failing tests con "Cannot find module './standings'".

- [ ] **Step 3: Implementar standings.js**

Crear `src/lib/standings.js`:

```js
// computeStandings(participants, matches) → array sorted with points + tiebreakers.

export function computeStandings(participants, matches) {
  const pointsBy = new Map()
  const opponentsBy = new Map()
  const winsBy = new Map()

  for (const p of participants) {
    pointsBy.set(p.id, 0)
    opponentsBy.set(p.id, [])
    winsBy.set(p.id, 0)
  }

  for (const m of matches) {
    if (m.result === 'bye') {
      const id = m.white_id ?? m.black_id
      if (pointsBy.has(id)) pointsBy.set(id, pointsBy.get(id) + 1)
      // bye no cuenta como oponente ni como win
      continue
    }
    if (m.result == null) continue // partidos no jugados se ignoran

    if (m.white_id != null) opponentsBy.get(m.white_id)?.push(m.black_id)
    if (m.black_id != null) opponentsBy.get(m.black_id)?.push(m.white_id)

    if (m.result === 'white') {
      if (pointsBy.has(m.white_id)) pointsBy.set(m.white_id, pointsBy.get(m.white_id) + 1)
      if (winsBy.has(m.white_id)) winsBy.set(m.white_id, winsBy.get(m.white_id) + 1)
    } else if (m.result === 'black') {
      if (pointsBy.has(m.black_id)) pointsBy.set(m.black_id, pointsBy.get(m.black_id) + 1)
      if (winsBy.has(m.black_id)) winsBy.set(m.black_id, winsBy.get(m.black_id) + 1)
    } else if (m.result === 'draw') {
      if (pointsBy.has(m.white_id)) pointsBy.set(m.white_id, pointsBy.get(m.white_id) + 0.5)
      if (pointsBy.has(m.black_id)) pointsBy.set(m.black_id, pointsBy.get(m.black_id) + 0.5)
    }
  }

  // Buchholz = suma de puntos de oponentes (sin byes)
  const buchholzBy = new Map()
  for (const p of participants) {
    const opps = opponentsBy.get(p.id) ?? []
    const sum = opps.reduce((acc, oid) => acc + (pointsBy.get(oid) ?? 0), 0)
    buchholzBy.set(p.id, sum)
  }

  const active = participants.filter((p) => !p.withdrawn)
  const withdrawn = participants.filter((p) => p.withdrawn)

  const buildRow = (p) => ({
    participantId: p.id,
    points: pointsBy.get(p.id) ?? 0,
    buchholz: buchholzBy.get(p.id) ?? 0,
    wins: winsBy.get(p.id) ?? 0,
    seedRating: p.seed_rating,
    withdrawn: p.withdrawn === true,
  })

  const sortFn = (a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.seedRating - a.seedRating
  }

  return [...active.map(buildRow).sort(sortFn), ...withdrawn.map(buildRow).sort(sortFn)]
}
```

- [ ] **Step 4: Correr tests, todos deben pasar**

```bash
pnpm test
```

Expected: 13/13 passing (8 de pairing + 5 de standings).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standings.js src/lib/standings.test.js
git commit -m "Implementar standings con puntos, Buchholz y wins"
```

---

## Task 6: Lib `tournaments.js` con helpers de Supabase

**Files:**
- Create: `src/lib/tournaments.js`

- [ ] **Step 1: Crear el archivo con todas las funciones**

Crear `src/lib/tournaments.js`:

```js
import { supabase } from './supabase'

// Slug: lowercase, sin tildes, espacios → '-', solo [a-z0-9-]
export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function ensureUniqueSlug(base) {
  let candidate = base
  let n = 2
  while (n < 100) {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (error) throw error
    if (!data) return candidate
    candidate = `${base}-${n}`
    n++
  }
  return `${base}-${Date.now()}`
}

export async function listTournaments() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getTournament(id) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createTournament({ name, tiempo, createdBy }) {
  const slug = await ensureUniqueSlug(slugify(name))
  const { data, error } = await supabase
    .from('tournaments')
    .insert({ name: name.trim(), slug, tiempo, created_by: createdBy })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTournament(id, patch) {
  const { data, error } = await supabase
    .from('tournaments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTournament(id) {
  const { error } = await supabase.from('tournaments').delete().eq('id', id)
  if (error) throw error
}

export async function listParticipants(tournamentId) {
  // Join contra techess_registrations para mostrar el nombre, email, chess, etc.
  const { data, error } = await supabase
    .from('tournament_participants')
    .select(`
      id, tournament_id, registration_id, seed_rating, withdrawn, created_at,
      registration:techess_registrations(
        id, nombre, email, chess_username, chess_avatar, chess_url, twitter_handle, phone,
        chess_rating_rapid, chess_rating_blitz, chess_rating_bullet
      )
    `)
    .eq('tournament_id', tournamentId)
  if (error) throw error
  return data
}

export async function addParticipants(tournamentId, items) {
  // items: [{ registration_id, seed_rating }]
  if (items.length === 0) return []
  const payload = items.map((it) => ({
    tournament_id: tournamentId,
    registration_id: it.registration_id,
    seed_rating: it.seed_rating,
  }))
  const { data, error } = await supabase
    .from('tournament_participants')
    .insert(payload)
    .select()
  if (error) throw error
  return data
}

export async function updateParticipantRating(participantId, seedRating) {
  const { data, error } = await supabase
    .from('tournament_participants')
    .update({ seed_rating: seedRating })
    .eq('id', participantId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function withdrawParticipant(participantId) {
  return updateParticipantRating /* noop */
    ? supabase
        .from('tournament_participants')
        .update({ withdrawn: true })
        .eq('id', participantId)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw error
          return data
        })
    : null
}

export async function removeParticipant(participantId) {
  const { error } = await supabase
    .from('tournament_participants')
    .delete()
    .eq('id', participantId)
  if (error) throw error
}

export async function listMatches(tournamentId) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: true })
  if (error) throw error
  return data
}

export async function insertMatches(matches) {
  if (matches.length === 0) return []
  const { data, error } = await supabase
    .from('tournament_matches')
    .insert(matches)
    .select()
  if (error) throw error
  return data
}

export async function updateMatchResult(matchId, result) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .update({ result })
    .eq('id', matchId)
    .select()
    .single()
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Reescribir `withdrawParticipant` (la versión anterior era enrevesada)**

Reemplazar la función `withdrawParticipant` por:

```js
export async function withdrawParticipant(participantId) {
  const { data, error } = await supabase
    .from('tournament_participants')
    .update({ withdrawn: true })
    .eq('id', participantId)
    .select()
    .single()
  if (error) throw error
  return data
}
```

- [ ] **Step 3: Confirmar visualmente el archivo final**

No hay tests para esta lib (sería test de integración contra Supabase). Verificación viene en las tasks de UI siguientes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tournaments.js
git commit -m "Agregar helpers Supabase para torneos, participantes y matches"
```

---

## Task 7: Extraer DashboardRegistrations de DashboardView

**Files:**
- Create: `src/components/DashboardRegistrations.jsx`
- Modify: `src/components/DashboardView.jsx`

Este task es un refactor: mueve la lógica de "inscriptos" actual a un componente propio sin cambiar comportamiento. Después en Task 8 sumamos los tabs.

- [ ] **Step 1: Crear DashboardRegistrations.jsx**

Crear `src/components/DashboardRegistrations.jsx`. Tomar TODO el contenido de stats/search/table que hoy vive en `DashboardView.jsx` y moverlo acá, exportando un componente que recibe `onSessionExpired` como prop. El componente NO incluye el header (lo provee el shell del DashboardView). Estructura:

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const TIEMPO_LABEL = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet' }

const COLUMNS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'tiempo', label: 'Tiempo' },
  { key: 'chess_username', label: 'Chess.com' },
  { key: 'rating', label: 'Rating' },
  { key: 'twitter_handle', label: 'Twitter' },
  { key: 'created_at', label: 'Fecha' },
]

function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D+/g, '')
  return digits ? `https://wa.me/${digits}` : null
}

function ratingOf(row) {
  return row[`chess_rating_${row.tiempo}`] ?? null
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function compareRows(a, b, key) {
  const va = key === 'rating' ? ratingOf(a) : a[key]
  const vb = key === 'rating' ? ratingOf(b) : b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'es')
}

export default function DashboardRegistrations({ onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [rows, setRows] = useState([])

  const stats = useMemo(() => {
    if (rows.length === 0) {
      return { total: 0, byTiempo: { rapid: 0, blitz: 0, bullet: 0 }, topTiempo: 'rapid', avgRating: null, withChess: 0 }
    }
    const byTiempo = { rapid: 0, blitz: 0, bullet: 0 }
    for (const r of rows) {
      if (byTiempo[r.tiempo] != null) byTiempo[r.tiempo]++
    }
    const topTiempo = ['rapid', 'blitz', 'bullet'].reduce((top, t) => (byTiempo[t] > byTiempo[top] ? t : top), 'rapid')
    const ratingCol = `chess_rating_${topTiempo}`
    const ratings = rows.map((r) => r[ratingCol]).filter((v) => typeof v === 'number')
    const avgRating = ratings.length > 0 ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
    const withChess = rows.filter((r) => r.chess_username).length
    return { total: rows.length, byTiempo, topTiempo, avgRating, withChess }
  }, [rows])

  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const cmp = compareRows(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sort])

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const [query, setQuery] = useState('')

  const filteredRows = useMemo(() => {
    const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const q = norm(query.trim())
    if (!q) return sortedRows
    return sortedRows.filter((r) => {
      const haystack = norm([r.nombre, r.email, r.phone, r.chess_username].filter(Boolean).join(' '))
      return haystack.includes(q)
    })
  }, [sortedRows, query])

  const load = useCallback(async () => {
    setStatus('loading')
    const { data, error } = await supabase
      .from('techess_registrations')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      if (error.code === 'PGRST301' || error.message?.toLowerCase().includes('jwt')) {
        await onSessionExpired()
        return
      }
      console.warn('registrations load failed', error)
      setStatus('error')
      return
    }
    setRows(data ?? [])
    setStatus('ready')
  }, [onSessionExpired])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      {status === 'loading' && (
        <div>
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
        </div>
      )}

      {status === 'error' && (
        <div className="dashboard__state">
          <p>No pudimos cargar los registros.</p>
          <button type="button" className="dashboard__btn" onClick={load}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="dashboard__state">Todavía no se anotó nadie.</div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <>
          <div className="dashboard__stats">
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Total</span>
              <span className="dashboard__stat-value">{stats.total}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Rapid</span>
              <span className="dashboard__stat-value">{stats.byTiempo.rapid}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Blitz</span>
              <span className="dashboard__stat-value">{stats.byTiempo.blitz}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Bullet</span>
              <span className="dashboard__stat-value">{stats.byTiempo.bullet}</span>
            </div>
          </div>

          <div className="dashboard__stats-row">
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Rating prom · {stats.topTiempo}</span>
              <span className="dashboard__stat-value">{stats.avgRating ?? '—'}</span>
            </div>
            <div className="dashboard__stat">
              <span className="dashboard__stat-label">Con chess.com</span>
              <span className="dashboard__stat-value">
                {stats.withChess} / {stats.total}
              </span>
              <span className="dashboard__stat-sub">
                {stats.total > 0 ? `${Math.round((stats.withChess / stats.total) * 100)}%` : '—'}
              </span>
            </div>
          </div>

          <input
            className="dashboard__search"
            type="search"
            placeholder="Buscar por nombre, email, teléfono, chess.com…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {filteredRows.length === 0 ? (
            <div className="dashboard__state">Nada coincide con esa búsqueda.</div>
          ) : (
            <>
              <div className="dashboard__table-wrap">
                <table className="dashboard__table">
                  <thead>
                    <tr>
                      {COLUMNS.map((col) => (
                        <th key={col.key} onClick={() => toggleSort(col.key)}>
                          {col.label}
                          {sort.key === col.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => {
                      const rating = ratingOf(r)
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
                              </a>
                            ) : (
                              <span className="dashboard__muted">—</span>
                            )}
                          </td>
                          <td>{rating ?? <span className="dashboard__muted">—</span>}</td>
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
                  </tbody>
                </table>
              </div>
              <div className="dashboard__footer">
                {filteredRows.length} registro{filteredRows.length === 1 ? '' : 's'} · ordenado por {COLUMNS.find((c) => c.key === sort.key)?.label}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
```

Tres diferencias respecto al `DashboardView.jsx` actual:
1. El componente no envuelve nada en `<div className="dashboard">` — eso lo hace ahora el shell.
2. El componente no renderiza el header. Lo hace el shell.
3. Recibe `onSessionExpired` directo en lugar de `onSignOut` (ahora el botón Salir vive en el shell).

- [ ] **Step 2: Reemplazar el contenido entero de DashboardView.jsx para que sea el shell delegando a Registrations**

Reemplazar `src/components/DashboardView.jsx`:

```jsx
import DashboardRegistrations from './DashboardRegistrations'

export default function DashboardView({ session, onSignOut, onSessionExpired }) {
  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">techess · dashboard</span>
        <div className="dashboard__user">
          <span>{session.user.email ?? '—'}</span>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onSignOut}>
            Salir
          </button>
        </div>
      </div>
      <DashboardRegistrations onSessionExpired={onSessionExpired} />
    </div>
  )
}
```

- [ ] **Step 3: Verificar visualmente que el dashboard sigue funcionando igual**

El usuario abre `/dashboard`, hace login, ve stats + buscador + tabla como antes. Nada cambia visualmente. El botón "Recargar" todavía no existe — se reintroduce en Task 8 ligado al tab activo.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardRegistrations.jsx src/components/DashboardView.jsx
git commit -m "Refactor: extraer DashboardRegistrations de DashboardView"
```

---

## Task 8: Tabs en el header del DashboardView

**Files:**
- Modify: `src/components/DashboardView.jsx`
- Create: `src/components/DashboardTournaments.jsx` (stub provisorio)
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Crear stub de DashboardTournaments**

Crear `src/components/DashboardTournaments.jsx`:

```jsx
export default function DashboardTournaments({ onSessionExpired }) {
  return <div className="dashboard__state">Torneos — próximamente.</div>
}
```

- [ ] **Step 2: Reescribir DashboardView con tabs**

Reemplazar `src/components/DashboardView.jsx`:

```jsx
import { useState } from 'react'
import DashboardRegistrations from './DashboardRegistrations'
import DashboardTournaments from './DashboardTournaments'

export default function DashboardView({ session, onSignOut, onSessionExpired }) {
  const [tab, setTab] = useState('tournaments')

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">techess · dashboard</span>
        <div className="dashboard__tabs">
          <button
            type="button"
            className="dashboard__tab"
            data-active={tab === 'tournaments'}
            onClick={() => setTab('tournaments')}
          >
            Torneos
          </button>
          <button
            type="button"
            className="dashboard__tab"
            data-active={tab === 'registrations'}
            onClick={() => setTab('registrations')}
          >
            Inscriptos
          </button>
        </div>
        <div className="dashboard__user">
          <span>{session.user.email ?? '—'}</span>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onSignOut}>
            Salir
          </button>
        </div>
      </div>

      {tab === 'tournaments' ? (
        <DashboardTournaments onSessionExpired={onSessionExpired} />
      ) : (
        <DashboardRegistrations onSessionExpired={onSessionExpired} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Agregar estilos para los tabs**

En `src/Dashboard.css`, agregar al final del archivo (después del `@media`):

```css
.dashboard__tabs {
  display: flex;
  gap: 4px;
  background: var(--ink-soft-08);
  border-radius: 8px;
  padding: 4px;
}

.dashboard__tab {
  background: transparent;
  color: var(--muted);
  border: 0;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.dashboard__tab:hover {
  color: var(--ink);
}

.dashboard__tab[data-active='true'] {
  background: var(--ink-soft-14);
  color: var(--ink);
}

@media (max-width: 720px) {
  .dashboard__header {
    flex-wrap: wrap;
    gap: 12px;
  }
}
```

- [ ] **Step 4: Verificar visualmente**

- `/dashboard` muestra dos pills al lado del brand: "Torneos" / "Inscriptos".
- Default activo: "Torneos", body muestra "Torneos — próximamente.".
- Click "Inscriptos" → vuelve la tabla completa de inscriptos.
- Click "Torneos" → vuelve al stub.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardView.jsx src/components/DashboardTournaments.jsx src/Dashboard.css
git commit -m "Agregar tabs Inscriptos/Torneos al header del dashboard"
```

---

## Task 9: Lista de torneos (DashboardTournaments)

**Files:**
- Modify: `src/components/DashboardTournaments.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Implementar la lista con fetch + render**

Reemplazar `src/components/DashboardTournaments.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { listTournaments } from '../lib/tournaments'

const STATUS_LABEL = {
  draft: 'draft',
  ongoing: 'en curso',
  finished: 'terminado',
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function DashboardTournaments({ onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournaments, setTournaments] = useState([])

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await listTournaments()
      setTournaments(data)
      setStatus('ready')
    } catch (err) {
      if (err.code === 'PGRST301' || err.message?.toLowerCase().includes('jwt')) {
        await onSessionExpired()
        return
      }
      console.warn('tournaments load failed', err)
      setStatus('error')
    }
  }, [onSessionExpired])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div className="dashboard__section-head">
        <h2 className="dashboard__section-title">Torneos</h2>
        <button type="button" className="dashboard__btn" disabled>
          + Nuevo torneo
        </button>
      </div>

      {status === 'loading' && (
        <div>
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
        </div>
      )}

      {status === 'error' && (
        <div className="dashboard__state">
          <p>No pudimos cargar los torneos.</p>
          <button type="button" className="dashboard__btn" onClick={load}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' && tournaments.length === 0 && (
        <div className="dashboard__state">Todavía no hay torneos. Creá el primero.</div>
      )}

      {status === 'ready' && tournaments.length > 0 && (
        <div className="dashboard__tournaments-grid">
          {tournaments.map((t) => (
            <button
              key={t.id}
              type="button"
              className="dashboard__tournament-card"
              onClick={() => {
                // se cablea en Task 10 cuando agregamos selected state
              }}
            >
              <div className="dashboard__tournament-card-head">
                <span className="dashboard__tournament-name">{t.name}</span>
                <span
                  className="dashboard__tournament-status"
                  data-status={t.status}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
              <div className="dashboard__tournament-meta">
                tiempo {t.tiempo}
                {t.status === 'ongoing' && t.total_rounds && (
                  <> · R {t.current_round}/{t.total_rounds}</>
                )}
                {t.status === 'finished' && t.total_rounds && (
                  <> · {t.total_rounds} rondas</>
                )}
                {' · creado '}{formatDate(t.created_at)}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Agregar estilos de cards al CSS**

En `src/Dashboard.css`, agregar al final (después de los estilos de tabs):

```css
.dashboard__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.dashboard__section-title {
  font-size: 16px;
  letter-spacing: 0.08em;
  font-weight: 500;
}

.dashboard__tournaments-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 720px) {
  .dashboard__tournaments-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.dashboard__tournament-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  color: var(--ink);
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.dashboard__tournament-card:hover {
  border-color: var(--ink-soft-16);
}

.dashboard__tournament-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.dashboard__tournament-name {
  font-size: 15px;
}

.dashboard__tournament-status {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--ink-soft-08);
  color: var(--muted);
}

.dashboard__tournament-status[data-status='ongoing'] {
  background: rgba(120, 200, 120, 0.18);
  color: #b7e0b7;
}

.dashboard__tournament-status[data-status='finished'] {
  background: var(--ink-soft-14);
  color: var(--ink);
}

.dashboard__tournament-meta {
  font-size: 12px;
  color: var(--muted);
}
```

- [ ] **Step 3: Verificar visualmente**

- Tab "Torneos" activo, ahora muestra "Torneos" como título y botón "+ Nuevo torneo" (disabled — se habilita en Task 10).
- Si no hay torneos: "Todavía no hay torneos. Creá el primero.".
- Si la query falla (test con red cortada): error + retry.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardTournaments.jsx src/Dashboard.css
git commit -m "Lista de torneos con cards y estados"
```

---

## Task 10: Modal "Nuevo torneo" + selección de torneo

**Files:**
- Modify: `src/components/DashboardTournaments.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Sumar state de selected y modal de nuevo**

Reemplazar `src/components/DashboardTournaments.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { createTournament, listTournaments } from '../lib/tournaments'
import TournamentDetail from './TournamentDetail'

const STATUS_LABEL = {
  draft: 'draft',
  ongoing: 'en curso',
  finished: 'terminado',
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function DashboardTournaments({ session, onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournaments, setTournaments] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await listTournaments()
      setTournaments(data)
      setStatus('ready')
    } catch (err) {
      if (err.code === 'PGRST301' || err.message?.toLowerCase().includes('jwt')) {
        await onSessionExpired()
        return
      }
      console.warn('tournaments load failed', err)
      setStatus('error')
    }
  }, [onSessionExpired])

  useEffect(() => {
    load()
  }, [load])

  if (selectedId) {
    return (
      <TournamentDetail
        tournamentId={selectedId}
        session={session}
        onBack={() => {
          setSelectedId(null)
          load()
        }}
        onSessionExpired={onSessionExpired}
      />
    )
  }

  return (
    <>
      <div className="dashboard__section-head">
        <h2 className="dashboard__section-title">Torneos</h2>
        <button
          type="button"
          className="dashboard__btn"
          onClick={() => setShowNewModal(true)}
        >
          + Nuevo torneo
        </button>
      </div>

      {status === 'loading' && (
        <div>
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
          <div className="dashboard__skeleton-row" />
        </div>
      )}

      {status === 'error' && (
        <div className="dashboard__state">
          <p>No pudimos cargar los torneos.</p>
          <button type="button" className="dashboard__btn" onClick={load}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' && tournaments.length === 0 && (
        <div className="dashboard__state">Todavía no hay torneos. Creá el primero.</div>
      )}

      {status === 'ready' && tournaments.length > 0 && (
        <div className="dashboard__tournaments-grid">
          {tournaments.map((t) => (
            <button
              key={t.id}
              type="button"
              className="dashboard__tournament-card"
              onClick={() => setSelectedId(t.id)}
            >
              <div className="dashboard__tournament-card-head">
                <span className="dashboard__tournament-name">{t.name}</span>
                <span className="dashboard__tournament-status" data-status={t.status}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
              <div className="dashboard__tournament-meta">
                tiempo {t.tiempo}
                {t.status === 'ongoing' && t.total_rounds && (
                  <> · R {t.current_round}/{t.total_rounds}</>
                )}
                {t.status === 'finished' && t.total_rounds && (
                  <> · {t.total_rounds} rondas</>
                )}
                {' · creado '}{formatDate(t.created_at)}
              </div>
            </button>
          ))}
        </div>
      )}

      {showNewModal && (
        <NewTournamentModal
          onClose={() => setShowNewModal(false)}
          onCreated={(t) => {
            setShowNewModal(false)
            setSelectedId(t.id)
            load()
          }}
          createdBy={session.user.id}
        />
      )}
    </>
  )
}

function NewTournamentModal({ onClose, onCreated, createdBy }) {
  const [name, setName] = useState('')
  const [tiempo, setTiempo] = useState('rapid')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const t = await createTournament({ name, tiempo, createdBy })
      onCreated(t)
    } catch (err) {
      setError('No pudimos crear el torneo. Probá de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <div className="dashboard__modal-backdrop" onClick={onClose}>
      <form
        className="dashboard__modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 className="dashboard__modal-title">Nuevo torneo</h3>
        <label className="dashboard__modal-label">
          Nombre
          <input
            required
            className="dashboard__input"
            placeholder="Rapid de Mayo 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="dashboard__modal-label">
          Tiempo
          <select
            className="dashboard__input"
            value={tiempo}
            onChange={(e) => setTiempo(e.target.value)}
          >
            <option value="rapid">Rapid</option>
            <option value="blitz">Blitz</option>
            <option value="bullet">Bullet</option>
          </select>
        </label>
        {error && <span className="dashboard__error">{error}</span>}
        <div className="dashboard__modal-actions">
          <button
            type="button"
            className="dashboard__btn dashboard__btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button type="submit" className="dashboard__btn" disabled={submitting || !name.trim()}>
            {submitting ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Pasar `session` desde DashboardView**

En `src/components/DashboardView.jsx`, cambiar:

```jsx
<DashboardTournaments onSessionExpired={onSessionExpired} />
```

por:

```jsx
<DashboardTournaments session={session} onSessionExpired={onSessionExpired} />
```

- [ ] **Step 3: Crear stub provisional de TournamentDetail.jsx**

Crear `src/components/TournamentDetail.jsx` (se completa en tasks siguientes):

```jsx
export default function TournamentDetail({ tournamentId, onBack }) {
  return (
    <div>
      <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
        ← Volver
      </button>
      <div className="dashboard__state">Detalle del torneo {tournamentId} — pronto.</div>
    </div>
  )
}
```

- [ ] **Step 4: Estilos del modal**

En `src/Dashboard.css`, agregar al final:

```css
.dashboard__modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.dashboard__modal {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: var(--glass-shadow);
  padding: 24px;
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  backdrop-filter: blur(12px);
}

.dashboard__modal-title {
  font-size: 18px;
}

.dashboard__modal-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.dashboard__input {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  padding: 10px 12px;
  color: var(--ink);
  font-size: 14px;
  font: inherit;
}

.dashboard__input:focus {
  outline: none;
  border-color: var(--ink);
}

.dashboard__error {
  font-size: 12px;
  color: #ff8a80;
}

.dashboard__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 5: Verificar visualmente**

- "+ Nuevo torneo" abre el modal centrado.
- Cancelar / click fuera lo cierra sin guardar.
- Crear sin nombre: botón disabled.
- Crear con "Rapid de Mayo 2026" + Rapid: el torneo aparece en la lista y la UI navega al detalle stub.
- Click en una card existente: navega al detalle stub.

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardTournaments.jsx src/components/DashboardView.jsx src/components/TournamentDetail.jsx src/Dashboard.css
git commit -m "Modal de nuevo torneo + navegación a detalle"
```

---

## Task 11: TournamentDetail — meta + acciones del lifecycle

**Files:**
- Modify: `src/components/TournamentDetail.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Reescribir TournamentDetail con meta + acciones**

Reemplazar `src/components/TournamentDetail.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { deleteTournament, getTournament, updateTournament } from '../lib/tournaments'

const STATUS_LABEL = {
  draft: 'draft',
  ongoing: 'en curso',
  finished: 'terminado',
}

export default function TournamentDetail({ tournamentId, session, onBack, onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournament, setTournament] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const t = await getTournament(tournamentId)
      setTournament(t)
      setStatus('ready')
    } catch (err) {
      if (err.code === 'PGRST301' || err.message?.toLowerCase().includes('jwt')) {
        await onSessionExpired()
        return
      }
      console.warn('tournament load failed', err)
      setStatus('error')
    }
  }, [tournamentId, onSessionExpired])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar '${tournament.name}'? Esta acción no se puede deshacer.`)) return
    try {
      await deleteTournament(tournament.id)
      onBack()
    } catch (err) {
      setErrorMsg('No pudimos eliminar el torneo.')
    }
  }

  const handleFinish = async () => {
    if (!confirm(`¿Cerrar el torneo '${tournament.name}'?`)) return
    try {
      const next = await updateTournament(tournament.id, { status: 'finished' })
      setTournament(next)
    } catch (err) {
      setErrorMsg('No pudimos cerrar el torneo.')
    }
  }

  if (status === 'loading') {
    return (
      <div>
        <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
          ← Volver
        </button>
        <div className="dashboard__skeleton-row" />
        <div className="dashboard__skeleton-row" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
          ← Volver
        </button>
        <div className="dashboard__state">
          <p>No pudimos cargar el torneo.</p>
          <button type="button" className="dashboard__btn" onClick={load}>Reintentar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard__tournament-detail">
      <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
        ← Volver
      </button>

      <header className="dashboard__detail-head">
        <div>
          <h2 className="dashboard__detail-title">{tournament.name}</h2>
          <div className="dashboard__detail-meta">
            <span className="dashboard__tournament-status" data-status={tournament.status}>
              {STATUS_LABEL[tournament.status] ?? tournament.status}
            </span>
            <span>tiempo {tournament.tiempo}</span>
            {tournament.status === 'ongoing' && tournament.total_rounds && (
              <span>ronda {tournament.current_round}/{tournament.total_rounds}</span>
            )}
            {tournament.status === 'finished' && tournament.total_rounds && (
              <span>{tournament.total_rounds} rondas</span>
            )}
          </div>
        </div>
        <div className="dashboard__detail-actions">
          {tournament.status === 'draft' && (
            <>
              <button type="button" className="dashboard__btn" disabled>
                Empezar torneo
              </button>
              <button
                type="button"
                className="dashboard__btn dashboard__btn--ghost"
                onClick={handleDelete}
              >
                Eliminar
              </button>
            </>
          )}
          {tournament.status === 'ongoing' && (
            <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={handleFinish}>
              Cerrar torneo
            </button>
          )}
        </div>
      </header>

      {errorMsg && <div className="dashboard__error">{errorMsg}</div>}

      {/* Secciones siguientes se agregan en tasks posteriores */}
      <div className="dashboard__state">Jugadores, rondas y standings — pronto.</div>
    </div>
  )
}
```

- [ ] **Step 2: Agregar estilos**

En `src/Dashboard.css`, agregar al final:

```css
.dashboard__tournament-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard__detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.dashboard__detail-title {
  font-size: 22px;
  margin-bottom: 6px;
}

.dashboard__detail-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.dashboard__detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
```

- [ ] **Step 3: Verificar visualmente**

- Click en una card → muestra el detalle: "← Volver", título del torneo, status badge, tiempo, y dos botones (Empezar torneo disabled, Eliminar).
- "Eliminar" pide confirm y vuelve a la lista. El torneo desaparece de la lista (recargado).
- Si el status es ongoing, muestra "Cerrar torneo" (sin "Empezar"). Para testearlo manualmente, actualizá status='ongoing' en Supabase y recargá.

- [ ] **Step 4: Commit**

```bash
git add src/components/TournamentDetail.jsx src/Dashboard.css
git commit -m "Vista detalle del torneo con meta y acciones de lifecycle"
```

---

## Task 12: Jugadores del torneo + picker

**Files:**
- Modify: `src/components/TournamentDetail.jsx`
- Create: `src/components/TournamentPlayerPicker.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Crear el picker**

Crear `src/components/TournamentPlayerPicker.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function TournamentPlayerPicker({ tournament, alreadyAddedIds, onCancel, onConfirm }) {
  const [registrations, setRegistrations] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('techess_registrations')
        .select('id, nombre, email, chess_username, chess_rating_rapid, chess_rating_blitz, chess_rating_bullet')
        .order('nombre', { ascending: true })
      if (!active) return
      if (!error) setRegistrations(data ?? [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  const ratingCol = `chess_rating_${tournament.tiempo}`
  const available = useMemo(() => {
    const blocked = new Set(alreadyAddedIds)
    return registrations.filter((r) => !blocked.has(r.id))
  }, [registrations, alreadyAddedIds])

  const filtered = useMemo(() => {
    const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const q = norm(query.trim())
    if (!q) return available
    return available.filter((r) => {
      const haystack = norm([r.nombre, r.email, r.chess_username].filter(Boolean).join(' '))
      return haystack.includes(q)
    })
  }, [available, query])

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    const items = [...selected].map((id) => {
      const reg = registrations.find((r) => r.id === id)
      const ratingFromChess = reg?.[ratingCol]
      const seed = typeof ratingFromChess === 'number' ? ratingFromChess : 1200
      return { registration_id: id, seed_rating: seed }
    })
    try {
      await onConfirm(items)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dashboard__modal-backdrop" onClick={onCancel}>
      <div className="dashboard__modal dashboard__modal--lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="dashboard__modal-title">Agregar inscriptos</h3>
        <input
          className="dashboard__input"
          type="search"
          placeholder="Buscar por nombre, email, chess.com…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="dashboard__picker-list">
          {loading && <div className="dashboard__state">Cargando…</div>}
          {!loading && filtered.length === 0 && (
            <div className="dashboard__state">No hay inscriptos disponibles.</div>
          )}
          {!loading &&
            filtered.map((r) => {
              const rating = r[ratingCol]
              return (
                <label key={r.id} className="dashboard__picker-row">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <span className="dashboard__picker-name">{r.nombre}</span>
                  <span className="dashboard__picker-chess">
                    {r.chess_username ? `@${r.chess_username}` : '—'}
                  </span>
                  <span className="dashboard__picker-rating">
                    {typeof rating === 'number' ? `${tournament.tiempo} ${rating}` : 'sin chess'}
                  </span>
                </label>
              )
            })}
        </div>
        <div className="dashboard__modal-actions">
          <button
            type="button"
            className="dashboard__btn dashboard__btn--ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="dashboard__btn"
            onClick={handleConfirm}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? 'Agregando…' : `Agregar ${selected.size || ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sumar sección de jugadores a TournamentDetail**

En `src/components/TournamentDetail.jsx`, reemplazar el contenido entero:

```jsx
import { useCallback, useEffect, useState } from 'react'
import {
  addParticipants,
  deleteTournament,
  getTournament,
  listParticipants,
  removeParticipant,
  updateParticipantRating,
  updateTournament,
  withdrawParticipant,
} from '../lib/tournaments'
import TournamentPlayerPicker from './TournamentPlayerPicker'

const STATUS_LABEL = {
  draft: 'draft',
  ongoing: 'en curso',
  finished: 'terminado',
}

export default function TournamentDetail({ tournamentId, session, onBack, onSessionExpired }) {
  const [status, setStatus] = useState('loading')
  const [tournament, setTournament] = useState(null)
  const [participants, setParticipants] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [editingRating, setEditingRating] = useState(null) // participant id
  const [editingValue, setEditingValue] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const [t, parts] = await Promise.all([
        getTournament(tournamentId),
        listParticipants(tournamentId),
      ])
      setTournament(t)
      setParticipants(parts)
      setStatus('ready')
    } catch (err) {
      if (err.code === 'PGRST301' || err.message?.toLowerCase().includes('jwt')) {
        await onSessionExpired()
        return
      }
      console.warn('tournament load failed', err)
      setStatus('error')
    }
  }, [tournamentId, onSessionExpired])

  useEffect(() => {
    load()
  }, [load])

  const handleAddParticipants = async (items) => {
    try {
      await addParticipants(tournament.id, items)
      setShowPicker(false)
      await load()
    } catch (err) {
      setErrorMsg('No pudimos agregar a esos jugadores.')
    }
  }

  const handleRemove = async (participantId) => {
    if (!confirm('¿Sacar a este jugador del torneo?')) return
    try {
      await removeParticipant(participantId)
      await load()
    } catch (err) {
      setErrorMsg('No pudimos sacar al jugador.')
    }
  }

  const handleWithdraw = async (participantId) => {
    if (!confirm('¿Retirar a este jugador? Sus partidos pasados quedan en standings.')) return
    try {
      await withdrawParticipant(participantId)
      await load()
    } catch (err) {
      setErrorMsg('No pudimos retirar al jugador.')
    }
  }

  const handleSaveRating = async (participantId) => {
    const value = parseInt(editingValue, 10)
    if (Number.isNaN(value) || value < 0 || value > 4000) {
      setErrorMsg('Rating tiene que estar entre 0 y 4000.')
      return
    }
    try {
      await updateParticipantRating(participantId, value)
      setEditingRating(null)
      setEditingValue('')
      await load()
    } catch (err) {
      setErrorMsg('No pudimos guardar el rating.')
    }
  }

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar '${tournament.name}'? Esta acción no se puede deshacer.`)) return
    try {
      await deleteTournament(tournament.id)
      onBack()
    } catch (err) {
      setErrorMsg('No pudimos eliminar el torneo.')
    }
  }

  const handleFinish = async () => {
    if (!confirm(`¿Cerrar el torneo '${tournament.name}'?`)) return
    try {
      const next = await updateTournament(tournament.id, { status: 'finished' })
      setTournament(next)
    } catch (err) {
      setErrorMsg('No pudimos cerrar el torneo.')
    }
  }

  if (status === 'loading') {
    return (
      <div>
        <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
          ← Volver
        </button>
        <div className="dashboard__skeleton-row" />
        <div className="dashboard__skeleton-row" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
          ← Volver
        </button>
        <div className="dashboard__state">
          <p>No pudimos cargar el torneo.</p>
          <button type="button" className="dashboard__btn" onClick={load}>Reintentar</button>
        </div>
      </div>
    )
  }

  const sortedParticipants = [...participants].sort(
    (a, b) => b.seed_rating - a.seed_rating,
  )

  return (
    <div className="dashboard__tournament-detail">
      <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onBack}>
        ← Volver
      </button>

      <header className="dashboard__detail-head">
        <div>
          <h2 className="dashboard__detail-title">{tournament.name}</h2>
          <div className="dashboard__detail-meta">
            <span className="dashboard__tournament-status" data-status={tournament.status}>
              {STATUS_LABEL[tournament.status] ?? tournament.status}
            </span>
            <span>tiempo {tournament.tiempo}</span>
            <span>{participants.filter((p) => !p.withdrawn).length} jugadores</span>
            {tournament.status === 'ongoing' && tournament.total_rounds && (
              <span>ronda {tournament.current_round}/{tournament.total_rounds}</span>
            )}
            {tournament.status === 'finished' && tournament.total_rounds && (
              <span>{tournament.total_rounds} rondas</span>
            )}
          </div>
        </div>
        <div className="dashboard__detail-actions">
          {tournament.status === 'draft' && (
            <>
              <button type="button" className="dashboard__btn" disabled>
                Empezar torneo
              </button>
              <button
                type="button"
                className="dashboard__btn dashboard__btn--ghost"
                onClick={handleDelete}
              >
                Eliminar
              </button>
            </>
          )}
          {tournament.status === 'ongoing' && (
            <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={handleFinish}>
              Cerrar torneo
            </button>
          )}
        </div>
      </header>

      {errorMsg && <div className="dashboard__error">{errorMsg}</div>}

      <section>
        <div className="dashboard__section-head">
          <h3 className="dashboard__section-title">Jugadores ({participants.length})</h3>
          {tournament.status === 'draft' && (
            <button
              type="button"
              className="dashboard__btn"
              onClick={() => setShowPicker(true)}
            >
              + Agregar inscriptos
            </button>
          )}
        </div>

        {sortedParticipants.length === 0 && (
          <div className="dashboard__state">Sin jugadores. Agregá algunos para empezar.</div>
        )}

        {sortedParticipants.length > 0 && (
          <div className="dashboard__participants">
            {sortedParticipants.map((p) => {
              const reg = p.registration
              const hasChessRating = typeof reg?.[`chess_rating_${tournament.tiempo}`] === 'number'
              return (
                <div key={p.id} className="dashboard__participant" data-withdrawn={p.withdrawn}>
                  <span className="dashboard__participant-name">{reg?.nombre ?? '—'}</span>
                  <span className="dashboard__participant-chess">
                    {reg?.chess_username ? `@${reg.chess_username}` : '—'}
                  </span>
                  <span className="dashboard__participant-rating">
                    {editingRating === p.id ? (
                      <>
                        <input
                          className="dashboard__input dashboard__input--inline"
                          type="number"
                          min="0"
                          max="4000"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                        />
                        <button
                          type="button"
                          className="dashboard__btn dashboard__btn--xs"
                          onClick={() => handleSaveRating(p.id)}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          className="dashboard__btn dashboard__btn--ghost dashboard__btn--xs"
                          onClick={() => {
                            setEditingRating(null)
                            setEditingValue('')
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        {hasChessRating
                          ? `${tournament.tiempo} ${p.seed_rating}`
                          : `sin chess · ${p.seed_rating}`}
                        {tournament.status === 'draft' && !hasChessRating && (
                          <button
                            type="button"
                            className="dashboard__btn dashboard__btn--ghost dashboard__btn--xs"
                            onClick={() => {
                              setEditingRating(p.id)
                              setEditingValue(String(p.seed_rating))
                            }}
                          >
                            Editar
                          </button>
                        )}
                      </>
                    )}
                  </span>
                  <span className="dashboard__participant-actions">
                    {tournament.status === 'draft' && (
                      <button
                        type="button"
                        className="dashboard__btn dashboard__btn--ghost dashboard__btn--xs"
                        onClick={() => handleRemove(p.id)}
                      >
                        Quitar
                      </button>
                    )}
                    {tournament.status === 'ongoing' && !p.withdrawn && (
                      <button
                        type="button"
                        className="dashboard__btn dashboard__btn--ghost dashboard__btn--xs"
                        onClick={() => handleWithdraw(p.id)}
                      >
                        Retirar
                      </button>
                    )}
                    {p.withdrawn && <span className="dashboard__muted">retirado</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Standings y rondas en tasks siguientes */}

      {showPicker && (
        <TournamentPlayerPicker
          tournament={tournament}
          alreadyAddedIds={participants.map((p) => p.registration_id)}
          onCancel={() => setShowPicker(false)}
          onConfirm={handleAddParticipants}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Estilos**

En `src/Dashboard.css`, agregar al final:

```css
.dashboard__modal--lg {
  max-width: 560px;
}

.dashboard__picker-list {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--ink-soft-08);
  border-radius: 8px;
}

.dashboard__picker-row {
  display: grid;
  grid-template-columns: auto 1fr 1fr auto;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ink-soft-08);
  align-items: center;
  cursor: pointer;
  font-size: 13px;
}

.dashboard__picker-row:last-child {
  border-bottom: 0;
}

.dashboard__picker-row:hover {
  background: var(--ink-soft-08);
}

.dashboard__picker-name {
  color: var(--ink);
}

.dashboard__picker-chess,
.dashboard__picker-rating {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.dashboard__participants {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 8px;
}

.dashboard__participant {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1.2fr auto;
  gap: 12px;
  padding: 10px 12px;
  font-size: 13px;
  align-items: center;
  border-radius: 6px;
}

.dashboard__participant[data-withdrawn='true'] {
  opacity: 0.5;
}

.dashboard__participant-name {
  color: var(--ink);
}

.dashboard__participant-chess {
  color: var(--muted);
}

.dashboard__participant-rating {
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.dashboard__participant-actions {
  display: inline-flex;
  gap: 6px;
}

.dashboard__btn--xs {
  font-size: 10px;
  padding: 4px 8px;
}

.dashboard__input--inline {
  width: 70px;
  padding: 4px 6px;
  font-size: 12px;
}

@media (max-width: 720px) {
  .dashboard__participant {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .dashboard__picker-row {
    grid-template-columns: auto 1fr;
    row-gap: 4px;
  }
  .dashboard__picker-chess,
  .dashboard__picker-rating {
    grid-column: 2;
  }
}
```

- [ ] **Step 4: Verificar visualmente**

- Entrar al detalle de un torneo en draft.
- Apretar "+ Agregar inscriptos" → modal con buscador y checkboxes.
- Seleccionar 2-3 inscriptos, click "Agregar N" → modal cierra, lista muestra esos jugadores ordenados por rating.
- Inscriptos sin chess.com aparecen con "sin chess · 1200" + botón "Editar". Click → input inline, OK guarda.
- "Quitar" pide confirm y elimina.
- Inscriptos que ya están en el torneo NO aparecen en el picker.

- [ ] **Step 5: Commit**

```bash
git add src/components/TournamentDetail.jsx src/components/TournamentPlayerPicker.jsx src/Dashboard.css
git commit -m "Jugadores del torneo: lista, picker, edición y retiro"
```

---

## Task 13: Empezar torneo (genera ronda 1)

**Files:**
- Modify: `src/components/TournamentDetail.jsx`

- [ ] **Step 1: Importar pairing y agregar handler de start**

Cerca del top del archivo `src/components/TournamentDetail.jsx`, sumar import:

```jsx
import { generateRound } from '../lib/pairing'
import { insertMatches, listMatches } from '../lib/tournaments'
```

En el componente, después de los handlers existentes, agregar:

```jsx
const handleStart = async () => {
  const active = participants.filter((p) => !p.withdrawn)
  if (active.length < 2) {
    setErrorMsg('Necesitás al menos 2 jugadores.')
    return
  }
  if (!confirm(`¿Empezar el torneo con ${active.length} jugadores? Después no se pueden agregar/quitar (sí retirar).`)) return
  try {
    const totalRounds = Math.max(1, Math.ceil(Math.log2(active.length)))
    const { matches } = generateRound(
      active.map((p) => ({ id: p.id, seed_rating: p.seed_rating, withdrawn: p.withdrawn })),
      [],
      { roundNumber: 1 },
    )
    await insertMatches(matches.map((m) => ({ ...m, tournament_id: tournament.id })))
    const next = await updateTournament(tournament.id, {
      status: 'ongoing',
      total_rounds: totalRounds,
      current_round: 1,
    })
    setTournament(next)
  } catch (err) {
    console.warn('start failed', err)
    setErrorMsg('No pudimos empezar el torneo.')
  }
}
```

- [ ] **Step 2: Habilitar el botón "Empezar torneo"**

Reemplazar el botón actual:

```jsx
<button type="button" className="dashboard__btn" disabled>
  Empezar torneo
</button>
```

por:

```jsx
<button
  type="button"
  className="dashboard__btn"
  onClick={handleStart}
  disabled={participants.filter((p) => !p.withdrawn).length < 2}
  title={
    participants.filter((p) => !p.withdrawn).length < 2
      ? 'Necesitás al menos 2 jugadores'
      : undefined
  }
>
  Empezar torneo
</button>
```

- [ ] **Step 3: Verificar end-to-end**

1. Crear un torneo nuevo "Test Swiss" tiempo rapid.
2. Agregar 5 inscriptos (impar para testear bye).
3. Apretar "Empezar torneo". Confirmar el dialog.
4. La página cambia: status pasa a "en curso", total_rounds = `ceil(log2(5)) = 3`.
5. En Supabase, verificar que `tournament_matches` tiene 3 filas para `tournament_id = X, round_number = 1`: 2 matches + 1 bye.

(Las rondas se visualizan en la próxima task; por ahora solo se inserta data.)

- [ ] **Step 4: Commit**

```bash
git add src/components/TournamentDetail.jsx
git commit -m "Empezar torneo: calcular rondas e insertar pairings de ronda 1"
```

---

## Task 14: Visualización de rondas + carga de resultados

**Files:**
- Modify: `src/components/TournamentDetail.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Cargar matches al cargar el detalle y agregar handler de resultado**

En `src/components/TournamentDetail.jsx`:

1. Sumar import (si no lo agregaste antes):

```jsx
import { insertMatches, listMatches, updateMatchResult } from '../lib/tournaments'
```

2. Sumar estado de matches en el componente:

```jsx
const [matches, setMatches] = useState([])
```

3. Cambiar `load` para que también traiga matches:

```jsx
const load = useCallback(async () => {
  setStatus('loading')
  try {
    const [t, parts, ms] = await Promise.all([
      getTournament(tournamentId),
      listParticipants(tournamentId),
      listMatches(tournamentId),
    ])
    setTournament(t)
    setParticipants(parts)
    setMatches(ms)
    setStatus('ready')
  } catch (err) {
    if (err.code === 'PGRST301' || err.message?.toLowerCase().includes('jwt')) {
      await onSessionExpired()
      return
    }
    console.warn('tournament load failed', err)
    setStatus('error')
  }
}, [tournamentId, onSessionExpired])
```

4. Agregar handler de resultado (optimistic):

```jsx
const handleResult = async (matchId, result) => {
  const prev = matches
  setMatches((ms) => ms.map((m) => (m.id === matchId ? { ...m, result } : m)))
  try {
    await updateMatchResult(matchId, result)
  } catch (err) {
    setMatches(prev)
    setErrorMsg('No pudimos guardar el resultado.')
  }
}
```

- [ ] **Step 2: Helper para nombre de participante**

Encima del componente o como const dentro, agregar:

```jsx
function participantName(p) {
  return p?.registration?.nombre ?? '—'
}

function findParticipant(participants, id) {
  return participants.find((p) => p.id === id)
}
```

- [ ] **Step 3: Renderizar ronda actual debajo de la sección de jugadores**

Justo después del `</section>` de la sección "Jugadores", antes del `{showPicker && ...}`, agregar:

```jsx
{tournament.status !== 'draft' && (
  <RoundSection
    tournament={tournament}
    participants={participants}
    matches={matches.filter((m) => m.round_number === tournament.current_round)}
    onResult={handleResult}
  />
)}
```

Y agregar el subcomponente `RoundSection` al final del archivo (después del `export default`):

```jsx
function RoundSection({ tournament, participants, matches, onResult }) {
  if (matches.length === 0) return null
  const canEdit = tournament.status === 'ongoing'

  return (
    <section>
      <div className="dashboard__section-head">
        <h3 className="dashboard__section-title">
          Ronda {tournament.current_round}
          {tournament.total_rounds && ` de ${tournament.total_rounds}`}
        </h3>
        <button type="button" className="dashboard__btn" disabled>
          Generar ronda {tournament.current_round + 1}
        </button>
      </div>

      <div className="dashboard__pairings">
        <div className="dashboard__pairing dashboard__pairing--head">
          <span>#</span>
          <span>Blancas</span>
          <span>Negras</span>
          <span>Resultado</span>
        </div>
        {matches.map((m, idx) => {
          const white = findParticipant(participants, m.white_id)
          const black = findParticipant(participants, m.black_id)
          const isBye = m.result === 'bye'
          return (
            <div key={m.id} className="dashboard__pairing">
              <span className="dashboard__muted">{idx + 1}</span>
              <span>{white ? participantName(white) : <span className="dashboard__muted">BYE</span>}</span>
              <span>{black ? participantName(black) : <span className="dashboard__muted">BYE</span>}</span>
              <span className="dashboard__pairing-actions">
                {isBye ? (
                  <span className="dashboard__muted">1 punto (bye)</span>
                ) : (
                  <>
                    <ResultBtn current={m.result} mine="white" disabled={!canEdit} onClick={() => onResult(m.id, 'white')}>
                      1-0
                    </ResultBtn>
                    <ResultBtn current={m.result} mine="draw" disabled={!canEdit} onClick={() => onResult(m.id, 'draw')}>
                      ½
                    </ResultBtn>
                    <ResultBtn current={m.result} mine="black" disabled={!canEdit} onClick={() => onResult(m.id, 'black')}>
                      0-1
                    </ResultBtn>
                    {m.result && <span className="dashboard__pairing-check">✓</span>}
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ResultBtn({ current, mine, disabled, onClick, children }) {
  const isActive = current === mine
  return (
    <button
      type="button"
      className={`dashboard__btn dashboard__btn--xs ${isActive ? '' : 'dashboard__btn--ghost'}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Estilos**

En `src/Dashboard.css`, agregar al final:

```css
.dashboard__pairings {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 8px;
}

.dashboard__pairing {
  display: grid;
  grid-template-columns: 30px 1.2fr 1.2fr auto;
  gap: 12px;
  padding: 8px 12px;
  font-size: 13px;
  align-items: center;
  border-radius: 6px;
}

.dashboard__pairing--head {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  padding-bottom: 4px;
}

.dashboard__pairing-actions {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.dashboard__pairing-check {
  font-size: 11px;
  color: #b7e0b7;
}

@media (max-width: 720px) {
  .dashboard__pairing {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .dashboard__pairing--head {
    display: none;
  }
}
```

- [ ] **Step 5: Verificar visualmente**

- Después de empezar el torneo (Task 13), la sección "Ronda 1" aparece.
- Para los matches sin bye, aparecen 3 botones [1-0] [½] [0-1].
- Click en un botón guarda el resultado (Supabase) y muestra ✓.
- Bye muestra "1 punto (bye)" sin botones.
- "Generar ronda 2" aparece pero deshabilitado (se habilita en Task 16).

- [ ] **Step 6: Commit**

```bash
git add src/components/TournamentDetail.jsx src/Dashboard.css
git commit -m "Visualizar ronda actual del torneo y cargar resultados inline"
```

---

## Task 15: Standings

**Files:**
- Modify: `src/components/TournamentDetail.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Importar y renderizar standings**

En `src/components/TournamentDetail.jsx`:

1. Importar standings:

```jsx
import { computeStandings } from '../lib/standings'
```

2. En el componente, antes del `return`, calcular standings:

```jsx
const standings = participants.length > 0
  ? computeStandings(
      participants.map((p) => ({ id: p.id, seed_rating: p.seed_rating, withdrawn: p.withdrawn })),
      matches,
    )
  : []
```

3. Renderizar la sección entre "Jugadores" y "Ronda actual":

```jsx
{tournament.status !== 'draft' && standings.length > 0 && (
  <section>
    <div className="dashboard__section-head">
      <h3 className="dashboard__section-title">
        Standings · ronda {tournament.current_round} de {tournament.total_rounds ?? '?'}
      </h3>
    </div>
    <div className="dashboard__standings-wrap">
      <table className="dashboard__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Jugador</th>
            <th>Pts</th>
            <th>Buchholz</th>
            <th>Wins</th>
            <th>Elo</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, idx) => {
            const p = findParticipant(participants, row.participantId)
            return (
              <tr key={row.participantId} data-withdrawn={row.withdrawn}>
                <td className="dashboard__muted">{idx + 1}</td>
                <td>
                  {participantName(p)}
                  {row.withdrawn && (
                    <span className="dashboard__muted"> · retirado</span>
                  )}
                </td>
                <td>{row.points}</td>
                <td>{row.buchholz}</td>
                <td>{row.wins}</td>
                <td>{row.seedRating}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </section>
)}
```

- [ ] **Step 2: Estilos**

En `src/Dashboard.css`, agregar al final:

```css
.dashboard__standings-wrap {
  overflow-x: auto;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--glass-bg);
}

.dashboard__standings-wrap tr[data-withdrawn='true'] {
  opacity: 0.5;
}
```

- [ ] **Step 3: Verificar visualmente**

- Standings aparece debajo de Jugadores, encima de Ronda actual.
- Cargá resultados a la ronda 1 (Task 14) y verificá que los puntos se actualizan.
- Después de cargar todos los resultados, el primero de la tabla debería ser el que más puntos tiene; en empate, el de mayor Buchholz; en empate seguido, más wins.
- Si un jugador está retirado, aparece al final con opacidad reducida y "retirado".

- [ ] **Step 4: Commit**

```bash
git add src/components/TournamentDetail.jsx src/Dashboard.css
git commit -m "Standings con puntos, Buchholz y wins en el detalle del torneo"
```

---

## Task 16: Generar próxima ronda + accordion de rondas pasadas

**Files:**
- Modify: `src/components/TournamentDetail.jsx`
- Modify: `src/Dashboard.css`

- [ ] **Step 1: Handler para generar próxima ronda**

En el componente, agregar después de `handleStart`:

```jsx
const handleGenerateNext = async () => {
  const currentMatches = matches.filter((m) => m.round_number === tournament.current_round)
  const incomplete = currentMatches.filter((m) => m.result === null && m.white_id != null && m.black_id != null)
  if (incomplete.length > 0) {
    setErrorMsg('Falta cargar resultados de la ronda actual.')
    return
  }
  if (tournament.current_round >= tournament.total_rounds) {
    setErrorMsg('Esta era la última ronda. Cerrá el torneo cuando quieras.')
    return
  }

  const nextRound = tournament.current_round + 1
  const active = participants.filter((p) => !p.withdrawn)
  try {
    const { matches: newMatches, warnings } = generateRound(
      active.map((p) => ({ id: p.id, seed_rating: p.seed_rating, withdrawn: p.withdrawn })),
      matches,
      { roundNumber: nextRound },
    )
    await insertMatches(newMatches.map((m) => ({ ...m, tournament_id: tournament.id })))
    const next = await updateTournament(tournament.id, { current_round: nextRound })
    setTournament(next)
    await load()
    if (warnings.length > 0) {
      setErrorMsg(`Ronda generada con warnings: ${warnings.join('; ')}`)
    }
  } catch (err) {
    console.warn('generate next failed', err)
    setErrorMsg('No pudimos generar la próxima ronda.')
  }
}
```

- [ ] **Step 2: Habilitar el botón "Generar ronda N+1"**

En `RoundSection`, reemplazar el botón disabled por uno controlado. Cambiar la firma de `RoundSection` para recibir `onGenerateNext` y `canGenerate`:

```jsx
function RoundSection({ tournament, participants, matches, onResult, onGenerateNext, canGenerate }) {
```

Y el botón:

```jsx
<button
  type="button"
  className="dashboard__btn"
  onClick={onGenerateNext}
  disabled={!canGenerate}
  title={!canGenerate ? 'Falta cargar resultados' : undefined}
>
  Generar ronda {tournament.current_round + 1}
</button>
```

Y en el render del componente principal, pasar las props nuevas:

```jsx
{tournament.status !== 'draft' && (
  <RoundSection
    tournament={tournament}
    participants={participants}
    matches={matches.filter((m) => m.round_number === tournament.current_round)}
    onResult={handleResult}
    onGenerateNext={handleGenerateNext}
    canGenerate={
      tournament.status === 'ongoing' &&
      tournament.current_round < (tournament.total_rounds ?? 0) &&
      matches
        .filter((m) => m.round_number === tournament.current_round)
        .every((m) => m.result !== null)
    }
  />
)}
```

- [ ] **Step 3: Accordion de rondas pasadas**

En el componente principal, después del `RoundSection`, agregar:

```jsx
{tournament.status !== 'draft' && tournament.current_round > 1 && (
  <PastRounds
    tournament={tournament}
    participants={participants}
    matches={matches}
  />
)}
```

Y agregar el subcomponente al final del archivo:

```jsx
function PastRounds({ tournament, participants, matches }) {
  const [openRound, setOpenRound] = useState(null)
  const rounds = []
  for (let r = 1; r < tournament.current_round; r++) {
    rounds.push(r)
  }
  if (rounds.length === 0) return null

  return (
    <section className="dashboard__past-rounds">
      <h3 className="dashboard__section-title">Rondas pasadas</h3>
      {rounds.map((r) => {
        const roundMatches = matches.filter((m) => m.round_number === r)
        const isOpen = openRound === r
        return (
          <div key={r} className="dashboard__accordion">
            <button
              type="button"
              className="dashboard__accordion-head"
              onClick={() => setOpenRound(isOpen ? null : r)}
            >
              {isOpen ? '▼' : '▶'} Ronda {r} (completa)
            </button>
            {isOpen && (
              <div className="dashboard__pairings dashboard__pairings--past">
                {roundMatches.map((m, idx) => {
                  const white = findParticipant(participants, m.white_id)
                  const black = findParticipant(participants, m.black_id)
                  return (
                    <div key={m.id} className="dashboard__pairing">
                      <span className="dashboard__muted">{idx + 1}</span>
                      <span>{white ? participantName(white) : 'BYE'}</span>
                      <span>{black ? participantName(black) : 'BYE'}</span>
                      <span className="dashboard__muted">
                        {m.result === 'white' && '1-0'}
                        {m.result === 'black' && '0-1'}
                        {m.result === 'draw' && '½-½'}
                        {m.result === 'bye' && '1 punto'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
```

- [ ] **Step 4: Estilos**

En `src/Dashboard.css`, agregar al final:

```css
.dashboard__past-rounds {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard__accordion-head {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  text-align: left;
  width: 100%;
  cursor: pointer;
  letter-spacing: 0.05em;
}

.dashboard__accordion-head:hover {
  border-color: var(--ink-soft-16);
}

.dashboard__pairings--past {
  margin-top: 4px;
}
```

- [ ] **Step 5: Verificar end-to-end**

1. Empezar un torneo con 6 jugadores (par).
2. Cargar los 3 resultados de la ronda 1 (mix de 1-0, ½, 0-1).
3. El botón "Generar ronda 2" se habilita.
4. Apretarlo → ronda 2 aparece con los nuevos pairings agrupados por puntos.
5. La ronda 1 ahora vive en "Rondas pasadas" como accordion.
6. Click en el accordion expande y muestra pairings + resultados read-only.
7. Cargar resultados de ronda 2, generar ronda 3 (`ceil(log2(6)) = 3`).
8. Después de ronda 3 completa, click "Cerrar torneo". Status pasa a `finished` y las secciones quedan read-only.
9. Probar también con 7 jugadores (impar) — verificar que el bye cambia entre rondas.

- [ ] **Step 6: Commit**

```bash
git add src/components/TournamentDetail.jsx src/Dashboard.css
git commit -m "Generar siguientes rondas y mostrar rondas pasadas en accordion"
```

---

## Self-Review

**1. Spec coverage:**
- Routing/tabs en header → Task 8 ✓
- Lista de torneos → Tasks 9-10 ✓
- Modal "Nuevo torneo" → Task 10 ✓
- Detalle: meta + acciones → Task 11 ✓
- Detalle: jugadores + picker → Task 12 ✓
- Empezar torneo (genera ronda 1) → Task 13 ✓
- Visualización de ronda actual + carga de resultados → Task 14 ✓
- Standings con Buchholz + wins → Task 15 ✓
- Generar próximas rondas → Task 16 ✓
- Rondas pasadas accordion → Task 16 ✓
- Cerrar torneo → Task 11 ✓
- Retirar jugador (ongoing) → Task 12 ✓
- Editar rating manual (sin chess) → Task 12 ✓
- Datos modelados: 3 tablas con constraints → Task 2 ✓
- Algoritmo Swiss puro testeable → Tasks 3-4 ✓
- Standings puras testeable → Task 5 ✓
- DB migration aplicada → Task 2 ✓

**2. Placeholder scan:** Sin TBD/TODO. Todos los pasos con código tienen código completo.

**3. Type consistency:** `generateRound` mantiene la firma `(participants, previousMatches, options)` desde Task 3 hasta su uso en Task 13 y 16. `computeStandings(participants, matches)` consistente Task 5 y Task 15. `tournaments.js` exporta las funciones usadas en las tasks que las consumen. `participants` en pairing tiene shape `{ id, seed_rating, withdrawn }` consistentemente.

**4. Notas para el implementer:**
- La migración SQL de Task 2 la aplica el controller via MCP (yo) o el usuario en SQL editor. El subagente verifica la existencia.
- `pnpm dev` y `pnpm lint` no se corren desde subagentes (el dev server lo mantiene el usuario; lint el usuario lo considera inútil).
- `pnpm test` sí se puede correr; sirve para validar pairing.js y standings.js.
- Las verificaciones manuales de UI las hace el usuario en el browser después de cada commit.
