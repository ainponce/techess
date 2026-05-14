# Feedback dashboard + Lichess — diseño

Fecha: 2026-05-14
Estado: aprobado por usuario

Conjunto de mejoras al dashboard y al form de inscripción de techess, derivadas de un round de feedback externo. Incluye: placeholders en login, logo en header, soporte para Lichess en form y dashboard, métricas nuevas, dedupe por username, y un acento de color sutil.

## 1. Login: placeholders

`src/components/DashboardLogin.jsx`

- Sumar `placeholder="vos@ejemplo.com"` al input de email.
- Sumar `placeholder="••••••••"` al input de password.

Sin más cambios.

## 2. Logo en dashboard

`src/components/DashboardView.jsx`

- Reemplazar el `<span className="dashboard__brand">techess · dashboard</span>` por un `<img src="/logo.svg" alt="techess" className="dashboard__brand-logo">` seguido del wordmark "dashboard" en texto.
- Asset: `public/logo.svg` (ya existe).
- CSS en `src/Dashboard.css`: definir `.dashboard__brand-logo` con altura fija (sugerencia ~28–32px) y `vertical-align: middle`.

## 3. Form: soportar Lichess (dos campos opcionales separados)

### 3.1 DB — nuevas columnas en `techess_registrations`

Migration agrega:

- `lichess_username text` (nullable)
- `lichess_name text` (nullable)
- `lichess_url text` (nullable)
- `lichess_rating_rapid int4` (nullable, check `IS NULL OR (>=0 AND <=4000)`)
- `lichess_rating_blitz int4` (nullable, mismo check)
- `lichess_rating_bullet int4` (nullable, mismo check)

No se agrega `lichess_country` ni `lichess_avatar` — la API pública de Lichess no expone avatar de forma estable y país es opcional. Si después se quieren, se suman.

### 3.2 DB — unique parciales (dedupe por username)

```sql
CREATE UNIQUE INDEX techess_registrations_chess_username_unique
  ON public.techess_registrations (lower(chess_username))
  WHERE chess_username IS NOT NULL;

CREATE UNIQUE INDEX techess_registrations_lichess_username_unique
  ON public.techess_registrations (lower(lichess_username))
  WHERE lichess_username IS NOT NULL;
```

**Prerequisito**: antes de aplicar, ejecutar query para listar duplicados existentes en `chess_username` (caso Manu Soria, Ain Ponce). Resolver uno-a-uno (borrar fila duplicada o NULL-ear el handle) antes de la migration. Si la migration falla por duplicado, no se aplica nada.

### 3.3 Form — UI

`src/components/RegistrationForm.jsx`

- Estado: agregar `form.lichessUsername`. Mantener `form.chessUsername`.
- Layout: input "Usuario de chess.com (opcional)" igual que hoy + input "Usuario de lichess (opcional)" debajo. Hint independiente debajo de cada uno.
- Helpers de normalización: `normalizeLichessHandle` análogo al de chess.com pero parseando URLs `lichess.org/@/handle` o `lichess.org/@/handle/...`.

### 3.4 Form — lookup de Lichess

- Endpoint: `GET https://lichess.org/api/user/{handle}` (un solo request, devuelve perfil + `perfs` con ratings).
- Estados: `chessLookup` (existente, sin cambios) y `lichessLookup` nuevo, idéntico shape: `{ status: 'idle' | 'loading' | 'notfound' | 'found' | 'error', profile, perfs }`.
- Debounce ~450ms con `AbortController`, igual que chess.com.
- 404 → `notfound`. Otro error de red → `error`. Sin rate-limit handling explícito (la API pública es generosa para 1 lookup por usuario).
- Extracción de ratings: `perfs.rapid.rating`, `perfs.blitz.rating`, `perfs.bullet.rating`.

### 3.5 Form — submit

- Payload incluye, además de las columnas chess existentes, las seis columnas lichess nuevas (nullables si no hay lookup found).
- Manejo de error 23505 diferenciado por `error.constraint` o por sniffing en `error.message`:
  - constraint email → "Ese email ya está anotado."
  - constraint chess username → "Ese usuario de chess.com ya está anotado."
  - constraint lichess username → "Ese usuario de Lichess ya está anotado."
  - fallback → mensaje genérico actual.

### 3.6 Hint visual

Componente `ChessComHint` existente queda. Crear `LichessHint` análogo (mismo styling, sin avatar — Lichess no provee avatar fiable). Ambos muestran nombre/handle y rating del tiempo seleccionado en el dropdown "Tiempo favorito".

## 4. Dashboard de inscriptos — stats

`src/components/DashboardRegistrations.jsx`

Reemplazar las dos filas de stats actuales por **tres filas**:

```
[ Total ] [ Rapid ] [ Blitz ] [ Bullet ]
[ Rating prom Rapid ] [ Rating prom Blitz ] [ Rating prom Bullet ]
[ Ratio online ] [ Torneos organizados ] [ Prom jugadores/torneo ]
```

### 4.1 Rating promedio por tiempo

Para cada inscripto, computar el rating "consolidado" para el tiempo T:

- Si tiene chess.com Y lichess en T → promediar los dos (uno por persona).
- Si tiene solo uno → ese valor.
- Si no tiene ninguno → no participa del promedio.

Luego promediar el set de personas. Esto evita que una persona con ambas plataformas pese el doble.

Repetir para rapid, blitz, bullet. Mostrar `—` si el set está vacío.

### 4.2 Ratio online

```
(# inscriptos con chess_username OR lichess_username) / total
```

Mostrar como `X / Y` con el porcentaje debajo (estilo de la tarjeta "Con chess.com" actual).

### 4.3 Torneos organizados + prom jugadores/torneo

- Query nueva al cargar el tab Inscriptos: `select id, status, tournament_participants(count) from tournaments where status != 'draft'`.
- **Torneos organizados**: `data.length`.
- **Prom jugadores/torneo**: `sum(participants_count) / data.length`, redondeado.
- Si no hay torneos no-draft, ambas muestran `—`.
- La query se hace una sola vez al montar y se cachea en estado local (no es info que cambie por keystroke).

## 5. Dashboard — columna de plataformas en la tabla

Hoy: columnas `Chess.com` (handle + avatar) + `Rating` separadas.

Cambio: dos columnas independientes **`Chess.com`** y **`Lichess`**, cada una mostrando handle + rating del tiempo favorito del inscripto en una sola celda:

```
@magnus · rapid 2839
```

- Sortable por handle (asc/desc alfabético) — el ratio numérico no se prioriza para sort en esta columna (ya hay tarjetas de rating prom para análisis).
- Si la celda está vacía (no tiene esa plataforma): `—` muted.
- La columna anterior `Rating` se elimina.

Resultado: columnas finales = `Nombre · Email · Teléfono · Tiempo · Chess.com · Lichess · Twitter · Fecha`.

## 6. Acento de color sutil

`src/Dashboard.css` y/o `src/index.css`

- Agregar variable `--accent` en `:root`. Sugerencia: `#a3e635` (verde lima frío que contrasta sobre fondo negro y se siente "techy"). Si preferís cian, `#7dd3fc`. **Default propuesto: lima `#a3e635`** — decisión final puede ajustarse en implementación si visualmente se ve mal.
- Aplicar el accent en:
  - `.dashboard__btn` (primario): borde y `:hover` background.
  - `.dashboard__tab[data-active=true]`: underline / border-bottom.
  - `.dashboard__tournament-status[data-status="ongoing"]`: fondo tenue con `color-mix` o `rgba`.
  - `th` con sort activo: color del header.

No tocar fondo negro ni los `--glass-*` existentes. Sigue siendo monocromático con un acento.

## Verificación al final

- Form: anotarse con chess.com solo / lichess solo / ambos / ninguno funciona.
- Dedupe: intentar anotar mismo chess handle dos veces → error claro. Mismo para lichess.
- Dashboard: stats se calculan bien con inscriptos que mezclan plataformas.
- Logo aparece en header en lugar del texto.
- Color: el accent se ve en los lugares listados, no rompe contraste.
- Dashboard sigue funcionando para inscriptos viejos (que no tienen lichess_*).

## Out of scope

- Mostrar avatar de Lichess (no hay endpoint estable).
- Dedupe por nombre o teléfono (sigue dependiendo de email + chess/lichess username).
- Pase estético completo (rediseño de paleta). Solo el acento.
- Migración de datos históricos para llenar lichess_* de inscriptos existentes.
