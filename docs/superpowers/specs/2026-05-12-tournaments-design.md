# Torneos + Pairing Swiss — Diseño

**Fecha:** 2026-05-12
**Estado:** Aprobado, listo para planificación
**Spec previo:** `2026-05-12-dashboard-design.md` (el dashboard sobre el que se monta)

## Objetivo

Agregar al dashboard admin la capacidad de crear torneos de ajedrez tipo Swiss para la comunidad de techess, asignar jugadores manualmente, generar pairings por elo de chess.com automáticamente, cargar resultados ronda por ronda, y ver la tabla de posiciones con tiebreakers. Todo dentro del dashboard, sin vista pública por ahora.

## Decisiones clave

| Decisión | Elegido | Por qué |
|---|---|---|
| Scope MVP | Pairings + resultados ronda por ronda + standings | El admin quiere correr el torneo completo desde el dashboard, no solo emparejar |
| Inscripción | Solo admin asigna jugadores | Más simple, sin RLS extra ni UI pública |
| Concurrencia | Múltiples torneos simultáneos | El admin puede tener "Rapid de Mayo" y "Blitz de Mayo" en paralelo |
| Elo usado | El que corresponde al `tiempo` del torneo | Lo que la gente espera |
| Sin elo chess.com | Default 1200 manual, editable antes del start | Permite incluir gente sin chess.com sin bloquearlos |
| Formato | Solo Swiss | Es el estándar amateur 20-50 jugadores; mantener una sola implementación |
| Algoritmo | Implementación propia, ~200 LOC | Control total, sin dependencias, suficiente para amateur |
| Rondas | `ceil(log2(N))`, admin puede override | Estándar FIDE-compatible para amateur |
| Lifecycle | draft → ongoing → finished | Permite preparar el torneo antes de arrancar |
| Bye | 1 punto | Más amigable amateur, lo usan chess.com/lichess casual |
| Tiebreakers | Buchholz + Wins | Lo que la comunidad reconoce |
| Colores | Soft: alternar con cap ±2 | Pragmático, sin reglas Dutch estrictas |
| Vista pública | No (MVP) | Futura extensión |
| Navegación | Tabs en header + state interno | El dashboard es chico, no justifica router |
| Detalle de torneo | Single page con secciones | Sin tabs internos, todo a la vista |

## Arquitectura

### Routing y navegación

`Dashboard.jsx` ya tiene el auth gate. Adentro, `DashboardView.jsx` deja de ser una sola vista y pasa a renderizar uno de dos componentes según una tab interna:

- `DashboardRegistrations.jsx` — la tabla de inscriptos actual (extraída del DashboardView monolítico).
- `DashboardTournaments.jsx` — la lista de torneos.

El estado de la tab vive en `DashboardView.jsx` (`useState('tournaments')`). Default al recargar: `tournaments`. La tab activa se refleja en `data-tab` para el botón "Recargar" (cada tab gestiona su propio fetch + reload).

`DashboardTournaments.jsx` maneja también el estado de "qué torneo estoy viendo" via `useState`. Si es `null`, renderiza la lista; si tiene id, renderiza `TournamentDetail.jsx`.

No se agrega routing real (`react-router-dom` u otra solución). Bookmarkear `/dashboard` lleva siempre a la tab Torneos / lista; no hay deep-link a un torneo específico. Esto es una decisión consciente: el dashboard es admin-only y el back button se reemplaza con el botón "← Volver" en la vista detalle.

### Archivos nuevos

```
src/
  components/
    DashboardRegistrations.jsx       # extraído del actual DashboardView
    DashboardTournaments.jsx         # lista + new tournament + dispatch a detail
    TournamentDetail.jsx             # vista detalle: meta, jugadores, standings, rondas
    TournamentPlayerPicker.jsx       # modal multi-select para agregar inscriptos
  lib/
    pairing.js                       # algoritmo Swiss puro, testeable sin React
    standings.js                     # cálculo de standings + tiebreakers
    tournaments.js                   # helpers Supabase (load/create/update)
```

### Archivos modificados

- `src/components/DashboardView.jsx` — pasa a ser un layout con tabs. La lógica de fetch/stats/search/table se mueve a `DashboardRegistrations.jsx`. Más chico y enfocado.
- `src/Dashboard.css` — agrega estilos para tabs, cards de torneo, formularios de torneo, pickers, tabla de pairings, standings. Se reutilizan tokens existentes.

### Capa de datos

Toda la interacción con Supabase ocurre en `src/lib/tournaments.js`, que exporta funciones puras y asincrónicas:

```js
listTournaments()
getTournament(id)
createTournament({ name, tiempo })
updateTournament(id, patch)
deleteTournament(id)

listParticipants(tournamentId)
addParticipants(tournamentId, [{ registration_id, seed_rating }])
updateParticipantRating(participantId, seedRating)
withdrawParticipant(participantId)
removeParticipant(participantId)   // solo válido en draft

listMatches(tournamentId)
saveRound(tournamentId, roundNumber, matches)
updateMatchResult(matchId, result)

startTournament(id)                 // pasa draft → ongoing, computa total_rounds, genera ronda 1
generateNextRound(id)               // computa la siguiente ronda usando pairing.js
finishTournament(id)                // pasa ongoing → finished
```

El algoritmo de pairing y el cálculo de standings son **funciones puras** en `lib/pairing.js` y `lib/standings.js`. No hablan con Supabase; reciben datos, devuelven datos. Esto las hace testeables y portables si en algún momento se mueven a una edge function.

## Modelo de datos

### `public.tournaments`

| col | tipo | not null | default | notas |
|---|---|---|---|---|
| `id` | uuid | ✓ | `gen_random_uuid()` | PK |
| `name` | text | ✓ | | 1..120 chars |
| `slug` | text | ✓ | | unique, lowercase, generado del name |
| `tiempo` | text | ✓ | | check `tiempo in ('rapid','blitz','bullet')` |
| `status` | text | ✓ | `'draft'` | check `status in ('draft','ongoing','finished')` |
| `total_rounds` | int | | | null en draft, set al pasar a ongoing |
| `current_round` | int | ✓ | `0` | sube cuando se completa una ronda |
| `created_by` | uuid | ✓ | | FK `auth.users(id)`. Solo informativo |
| `created_at` | timestamptz | ✓ | `now()` | |
| `updated_at` | timestamptz | ✓ | `now()` | trigger lo refresca en UPDATE |

Index: `(status, created_at desc)` para la lista.

### `public.tournament_participants`

| col | tipo | not null | default | notas |
|---|---|---|---|---|
| `id` | uuid | ✓ | `gen_random_uuid()` | PK |
| `tournament_id` | uuid | ✓ | | FK `tournaments(id)` ON DELETE CASCADE |
| `registration_id` | uuid | ✓ | | FK `techess_registrations(id)` ON DELETE RESTRICT |
| `seed_rating` | int | ✓ | | snapshot del elo (chess_rating_<tiempo>) o 1200 manual |
| `withdrawn` | bool | ✓ | `false` | |
| `created_at` | timestamptz | ✓ | `now()` | |

Constraints:
- `unique (tournament_id, registration_id)`
- `check (seed_rating between 0 and 4000)`

Index: `(tournament_id)`.

### `public.tournament_matches`

| col | tipo | not null | default | notas |
|---|---|---|---|---|
| `id` | uuid | ✓ | `gen_random_uuid()` | PK |
| `tournament_id` | uuid | ✓ | | FK `tournaments(id)` ON DELETE CASCADE |
| `round_number` | int | ✓ | | 1..total_rounds |
| `white_id` | uuid | | | FK `tournament_participants(id)`, null si bye |
| `black_id` | uuid | | | FK `tournament_participants(id)`, null si bye |
| `result` | text | | | check `result in ('white','black','draw','bye') or null`, null = pendiente |
| `created_at` | timestamptz | ✓ | `now()` | |
| `updated_at` | timestamptz | ✓ | `now()` | trigger |

Constraints:
- `check (white_id is not null or black_id is not null)` — no puede ser todo null
- `check (result <> 'bye' or (white_id is not null and black_id is null) or (white_id is null and black_id is not null))` — bye implica un solo jugador
- `unique (tournament_id, round_number, white_id)` parcial donde white_id is not null
- `unique (tournament_id, round_number, black_id)` parcial donde black_id is not null

Index: `(tournament_id, round_number)`.

### RLS

Todas las tablas con RLS habilitada. Una policy por tabla, solo para rol `authenticated`, sobre las cuatro operaciones (SELECT, INSERT, UPDATE, DELETE), `using/with_check (true)`. Como `techess_registrations`, el rol `authenticated` tiene además `GRANT SELECT, INSERT, UPDATE, DELETE` a nivel tabla.

Justificación: el único usuario `authenticated` es el admin. No hace falta granularidad mayor. Si en el futuro se agregan más admins o vista pública, se ajusta acá.

### Migración

Un solo archivo de migración aplicado vía MCP de Supabase. Crea las tres tablas, índices, constraints, triggers de `updated_at`, y las policies. Lo ejecutamos al inicio de la implementación.

## Algoritmo de pairing

### Función pública

```js
generateNextRound(participants, previousMatches, options)
```

- `participants`: array de `{ id, seed_rating, withdrawn }`. Solo se considera quienes `withdrawn === false`.
- `previousMatches`: array de matches de rondas anteriores, con `{ white_id, black_id, result, round_number }`.
- `options`: `{ roundNumber }` para distinguir round 1 (split-half puro) de las siguientes (Swiss agrupado por puntaje).

Devuelve un array de matches sin `id` ni `tournament_id`, listos para INSERT:

```js
[
  { round_number, white_id, black_id, result: null },
  { round_number, white_id: null, black_id: byeParticipantId, result: 'bye' },   // el bye
]
```

### Ronda 1 (split-half)

1. Filtrar `participants` con `!withdrawn`.
2. Ordenar por `seed_rating` desc, desempate por nombre alfabético (estable).
3. Si `len` es impar: el participante de menor rating sin bye previo recibe bye. Lo sacamos del lote.
4. Dividir el lote en S1 (mitad superior, índices `0..len/2 - 1`) y S2 (mitad inferior, `len/2..len`).
5. Para `i = 0..S1.length - 1`: emparejar `S1[i]` vs `S2[i]`.
6. Asignar colores alternados: `S1[0] → white`, `S1[1] → black`, `S1[2] → white`, etc.

### Rondas 2..N

1. Calcular `points[participantId]` desde `previousMatches`. W=1, D=0.5, L=0, bye=1. Withdrawn no se considera.
2. Calcular `colorHistory[participantId]` = array de colores jugados (`'W'`/`'B'`).
3. Calcular `previousOpponents[participantId]` = Set de oponentes ya enfrentados.
4. Calcular `hadBye[participantId]` = bool.
5. Agrupar participantes activos por `points`, ordenados de mayor a menor. Dentro de cada grupo, ordenar por `seed_rating` desc.
6. Si el total de activos es impar, asignar bye al jugador del grupo de menor puntaje, menor rating, sin bye previo. Sacarlo.
7. Para cada grupo (de mayor a menor):
   a. Si quedó un participante "flotado" del grupo superior, agregarlo al inicio del grupo actual.
   b. Si el grupo tiene tamaño impar, sacar el último (menor rating) y "flotearlo" al grupo siguiente.
   c. Split-half del grupo: S1 vs S2.
   d. Para cada par `(S1[i], S2[i])`:
      - Si ya jugaron antes, intentar permutaciones: swap `S2[i]` con `S2[i+1]`, etc. Probar todas las permutaciones de S2.
      - Si ninguna permutación produce todos pares válidos, marcar el grupo como "fallback" y permitir el pair repetido (con warning en UI).
   e. Una vez que tenemos pares válidos, asignar colores (sección siguiente).

### Asignación de colores

Para cada par `(a, b)`:

1. Calcular `colorDiff[x]` = (whites count) - (blacks count) sobre `colorHistory[x]`.
2. "Color preferido" de `x`: `'B'` si `colorDiff > 0`, `'W'` si `colorDiff < 0`, `null` si `colorDiff == 0`.
3. Casos:
   - Si `a` y `b` tienen preferencias opuestas → dar a cada uno su preferido.
   - Si solo uno tiene preferencia → ese juega su preferido, el otro el contrario.
   - Si ninguno tiene preferencia → si en la ronda anterior `a` jugó negras y `b` blancas, esta vez `a → white, b → black` (alternancia simple). Default: `a → white`.
   - Si ambos tienen la misma preferencia ("clash") → al que tiene mayor `|colorDiff|` se le da su preferido. Si empatan, decisión arbitraria pero determinística (por id).
4. **Cap absoluto**: ningún jugador puede llegar a `|colorDiff| ≥ 3` después de esta asignación. Si la lógica anterior lo violaría, forzar el color opuesto incluso si genera "clash". Si ambos chocan el cap, dejar que el más senior (mayor id alfabético) reciba la asignación impuesta.

### Casos borde

- `N == 0` o `N == 1`: `startTournament` rechaza con error.
- `N == 2`: `total_rounds = 1`. La UI no permite "Generar próxima ronda" después de la primera.
- `total_rounds > N - 1`: rechazar; en Swiss no tiene sentido tener más rondas que `N - 1` (round-robin completo).
- Participante retira a mitad de torneo (`withdrawn = true`):
   - Sus matches pasados quedan con su resultado.
   - No se le asignan futuros pairings.
   - Para `colorHistory` y `previousOpponents` de los demás, sus matches pasados siguen contando.
- Resultados de bye: `white_id = participant_id, black_id = null, result = 'bye'`. La columna `white_id` se elige convencionalmente; no significa que haya jugado de blancas.
- Si después de agotar permutaciones y floats una ronda no se puede armar sin repetir, el algoritmo arma con repetidos y devuelve un flag `{ warnings: ['repeated pairing'] }` que la UI muestra como banner amarillo encima del listado de pairings.

## Standings

`computeStandings(participants, matches)` → array ordenado.

Para cada participante (no withdrawn):

```js
{
  participantId,
  points,             // suma de resultados
  buchholz,           // suma de points de todos los oponentes en partidos jugados (excluye byes)
  wins,               // count de victorias (no incluye byes para el conteo de wins)
  seedRating,
}
```

Notas:
- **Bye y Buchholz**: el bye no aporta oponente al Buchholz. Suma 1 punto al jugador pero no afecta su tiebreaker. Esto es una de las decisiones documentadas en el research (GOTCHA #2).
- **Bye y wins**: el bye no cuenta como win en el conteo de victorias para el tiebreaker. Suma punto pero no win.

Orden final:
```
points DESC, buchholz DESC, wins DESC, seedRating DESC
```

En la UI se renderiza con posición 1, 2, 3... aplicando el orden anterior.

## UI

### Navegación y tabs

En el header de `DashboardView`, al lado del nombre del admin, dos botones tabs:

```jsx
<div className="dashboard__tabs">
  <button data-active={tab === 'tournaments'}>Torneos</button>
  <button data-active={tab === 'registrations'}>Inscriptos</button>
</div>
```

Estilo: pill shape, color activo con `--ink`, inactivo con `--muted`. Tap target ≥ 36px.

### Lista de torneos

`DashboardTournaments.jsx` en modo lista. Header con título + botón "+ Nuevo torneo". Debajo, grid de cards verticales (1 col mobile, 2 cols ≥720px).

Cada card:
```
┌─────────────────────────────────────────┐
│ Nombre del torneo            <STATUS>   │
│ N jugadores · tiempo rapid · creado 12 may
└─────────────────────────────────────────┘
```

Status badge con color: draft = gris/muted, ongoing = verde (acento), finished = neutro/light.

Click en la card → setea `selectedTournamentId` y renderiza `TournamentDetail`.

Empty state: "Todavía no hay torneos. Creá el primero." + CTA grande.

Loading: 3 skeleton cards.

### Modal "Nuevo torneo"

Inline modal centrado, fondo oscurecido. Inputs:
- Nombre (required, 1..120 chars).
- Tiempo (select: Rapid / Blitz / Bullet).

Botones: "Cancelar" / "Crear". Al crear, el torneo queda en `draft` sin jugadores, y la UI navega directo a su detalle.

El `slug` se genera client-side del name (lowercase, NFD strip de tildes, reemplazar todo non-alfanum por `-`, colapsar `-` repetidos, trim de `-` al inicio/fin). Si choca con uno existente, suma `-2`, `-3`, etc.

### Detalle del torneo (TournamentDetail.jsx)

Layout single-page con scroll. Secciones, en orden:

**1. Meta**
```
[← Volver]

Rapid de Mayo 2026                                draft
Tiempo: rapid · 0 jugadores

[Empezar torneo]   [Eliminar torneo]
```

Botones varían por estado:
- `draft`: "Empezar torneo" + "Eliminar torneo". El "Empezar" deshabilitado si N < 2; tooltip explica.
- `ongoing`: "Generar próxima ronda" + "Cerrar torneo". El "Generar" deshabilitado si la ronda actual tiene resultados pendientes.
- `finished`: ningún botón de acción, solo "Volver".

"Eliminar torneo" pide confirmación: "¿Eliminar 'Rapid de Mayo 2026'? Esta acción no se puede deshacer."

"Empezar torneo": calcula `total_rounds = ceil(log2(activeParticipants))`, persiste, llama `generateNextRound` para ronda 1, inserta los matches, actualiza status. UI navega al estado `ongoing`.

"Cerrar torneo": confirm + UPDATE status. Idempotente; si ya está finished no hace nada.

**2. Jugadores**

Lista de participantes ordenada por seed_rating desc. Cada fila:

```
Ana Pérez            @ana123        rapid 1640        [Quitar]
Beto Gómez           —              sin chess · 1200 [Editar][Quitar]
```

En `draft`: botón "Quitar" hace DELETE del participant; botón "Editar" (solo si sin chess) abre input inline para cambiar el rating manual.

En `ongoing`/`finished`: botón "Retirar" en lugar de "Quitar" — setea `withdrawn=true`. No se borra para preservar histórico.

Botón "+ Agregar inscriptos" abre el picker (solo visible en `draft`).

**3. Standings**

Solo visible si `status` es `ongoing` o `finished`. Tabla:

```
#   Jugador          Pts    Buchholz   Wins   Elo
1   Carla Soto       3.0    7.5        3      1820
2   Ana Pérez        2.5    7.0        2      1640
...
```

Si hay un participante retirado, se muestra al final con badge "Retirado".

**4. Ronda actual**

Solo visible si `status` es `ongoing`. Header con título "Ronda N" + botón "Generar ronda N+1" (deshabilitado si quedan matches sin resultado).

Tabla de pairings con result picker inline:

```
# │ Blancas         │ Negras          │ Resultado
1 │ Carla Soto      │ Ana Pérez       │ [1-0] [½] [0-1] ✓
2 │ Beto Gómez      │ Damián Costa    │ [1-0] [½] [0-1]
3 │ Edu Ruiz        │ BYE             │ — 1 punto
```

Los 3 botones de resultado son toggles. Click en uno → UPDATE optimistic + revalidación. El botón activo se queda highlighted. ✓ aparece junto al que está guardado.

Bye se renderiza distinto: "BYE" en gris en la columna del que no juega, "— 1 punto" en la columna de resultado.

**5. Rondas pasadas (accordion)**

Solo si hay rondas anteriores a la actual. Accordion con headers "Ronda N (completa)". Click → expande la tabla read-only de pairings + resultados de esa ronda.

### Picker de inscriptos

Modal con buscador (mismo NFD-normalize que el de la lista de inscriptos) y multi-select por checkboxes:

```
Agregar inscriptos                                      [×]

🔍 [Buscar por nombre, email, chess.com…]

□ Ana Pérez           @ana123      rapid 1640
☑ Beto Gómez          —            sin chess
☑ Carla Soto          @carla       rapid 1820

                                  [Cancelar] [Agregar 2]
```

Solo lista inscriptos que NO están ya asignados al torneo. El rating mostrado es el del `tiempo` del torneo. Inscriptos sin chess.com muestran "sin chess" en lugar del rating; al agregarse, su `seed_rating` se setea a 1200 (editable después desde la lista de jugadores).

Botón "Agregar N" hace un INSERT batch + cierra el modal + refresca la lista.

### Estados de error

- Fetch falla → mensaje genérico "No pudimos cargar el torneo" + botón "Reintentar".
- INSERT/UPDATE falla → toast efímero (3s) "No pudimos guardar. Probá de nuevo." + rollback del cambio optimistic.
- Session expira (PGRST301) → mismo flow que el resto del dashboard (signOut + hint en login).
- "Generar próxima ronda" detecta repeated pairings → banner amarillo arriba de la tabla: "Algunos pares ya se enfrentaron. Reglas relajadas para completar la ronda."

## Lo que NO se incluye (YAGNI)

- Vista pública / `/torneos/<slug>`.
- Auto-pull de resultados desde chess.com API.
- Multi-admin / roles.
- Round Robin / Single Elimination / Arena.
- Notificaciones por email/whatsapp.
- Exportación CSV de standings.
- Edición de matches después de cerrar la ronda.
- Drag-and-drop de pairings para edición manual.
- Tiebreaker Sonneborn-Berger (queda Buchholz + Wins).
- Color cap configurable (queda fijo en ±2).
- Aceleración de Swiss (accelerated pairings).
- i18n / multi-language (todo en español).

## Verificación

Antes de cerrar la implementación:

1. **Migración aplicada** — las tres tablas existen con sus constraints y RLS.
2. **Crear/editar/eliminar torneo en draft** — funciona end-to-end.
3. **Agregar jugadores** — el picker muestra inscriptos, multi-select, snapshea rating; los sin chess.com quedan con 1200 editable.
4. **Empezar torneo** — pasa a ongoing, calcula total_rounds correctamente, genera ronda 1 con split-half por elo. Verificar manualmente con 6 y 7 jugadores que el pairing sea coherente.
5. **Cargar resultados** — los 3 botones funcionan, el resultado persiste, el ✓ aparece, no se puede "generar próxima ronda" hasta cargar todos.
6. **Generar ronda N+1** — usa puntajes de las rondas anteriores, agrupa correctamente, evita repetidos.
7. **Bye con N impar** — un jugador recibe bye, suma 1 punto, no recibe dos byes seguidos.
8. **Colores balanceados** — después de 5 rondas, nadie tiene `|colorDiff| ≥ 3`.
9. **Standings** — los puntos suman bien, Buchholz no incluye byes, el orden respeta los tiebreakers.
10. **Retirar jugador a mitad de torneo** — el flag `withdrawn` excluye sus futuros pairings; sus matches pasados siguen en standings.
11. **Cerrar torneo** — el detalle queda read-only, no se puede generar más rondas.
12. **Múltiples torneos en paralelo** — crear 2 simultáneos, cargar resultados en ambos, no se cruzan.
13. **Mobile** — la tabla de pairings scrollea horizontal, el picker es usable, las cards de la lista entran en 1 col.
14. **Tab "Inscriptos"** — sigue funcionando igual que antes (regression check).
