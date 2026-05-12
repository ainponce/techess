# Dashboard de inscriptos — Diseño

**Fecha:** 2026-05-12
**Estado:** Aprobado, listo para planificación

## Objetivo

Crear una ruta `/dashboard` que permita al admin de techess (una sola persona) ver toda la información de los usuarios inscriptos en el primer torneo, almacenados en la tabla `public.techess_registrations` de Supabase.

## Decisiones clave

| Decisión | Elegido | Por qué |
|---|---|---|
| Acceso | Solo admin con clave | La data contiene PII (email, twitter). No es para público. |
| Auth | Supabase Auth real (signInWithPassword) | Es la única forma segura. Password en el cliente es teatro de seguridad. |
| Routing | Path check sin router | Solo 2 vistas. `react-router-dom` es overkill. |
| Features | Stats agregadas + buscador + tabla | Pedido explícito del usuario. No incluye CSV export. |

## Arquitectura

### Routing

En `src/main.jsx`, antes de `createRoot(...).render(...)`, leer `window.location.pathname`:

```js
const isDashboard = window.location.pathname === '/dashboard'
createRoot(...).render(
  <StrictMode>
    {isDashboard ? <Dashboard /> : <App />}
  </StrictMode>
)
```

Sin lazy-loading (la app entera es chica, no vale la pena el complejidad).

**Nota de hosting:** el host de producción tiene que tener SPA fallback configurado (cualquier path no-asset sirve `index.html`). Vercel, Netlify y `vite preview` ya lo hacen por default. Si en algún momento se aloja en un static host sin esa config, `/dashboard` da 404.

### Archivos nuevos

```
src/
  Dashboard.jsx                  # wrapper + gate de auth
  Dashboard.css                  # estilos del dashboard
  components/
    DashboardLogin.jsx           # formulario de login
    DashboardView.jsx            # stats + buscador + tabla (vista autenticada)
```

### Archivos modificados

- `src/main.jsx` — path check para decidir qué root renderizar.
- `src/lib/supabase.js` — cambiar `persistSession` y `autoRefreshToken` a `true` para que el login del admin sobreviva al reload. El form anon de inscripción no se ve afectado: no usa sesión.

## Setup en Supabase (manual, una vez)

1. **Crear usuario admin:** Panel Supabase → Authentication → Users → Add user → email + password. Se hace una sola vez.
2. **Confirmar RLS:** la tabla `techess_registrations` ya tiene RLS habilitada (sino el INSERT anon actual no funcionaría a través de policy).
3. **Agregar policy de SELECT:**

   ```sql
   create policy "authenticated can read registrations"
   on public.techess_registrations
   for select
   to authenticated
   using (true);
   ```

   La policy actual de INSERT para `anon` queda intacta.

## Auth flow

`Dashboard.jsx`:

1. Al montar, llamar `supabase.auth.getSession()`.
2. Si no hay sesión → renderizar `<DashboardLogin />`.
3. Si hay sesión → renderizar `<DashboardView session={session} />`.
4. Suscribir a `supabase.auth.onAuthStateChange((event, session) => ...)` para que login/logout se reflejen sin reload. Desuscribir en cleanup.

`DashboardLogin.jsx`:

- Formulario controlado: email, password, submit.
- En submit: `supabase.auth.signInWithPassword({ email, password })`.
- Si error: mostrar mensaje. Mapear errores conocidos:
  - `Invalid login credentials` → "Email o password incorrectos."
  - cualquier otro → "No pudimos entrar. Probá de nuevo."
- Mientras está pending: deshabilitar submit, mostrar "ENTRANDO…".

`DashboardView.jsx`:

- Header con el email del admin (`session.user.email`) y un botón "Salir" (`supabase.auth.signOut()`).
- Si una query devuelve 401/403 (sesión expirada), llamar `signOut()` y volver al login con un toast/hint "Tu sesión expiró".

## Data fetching

Un solo query al montar `DashboardView`:

```js
const { data, error } = await supabase
  .from('techess_registrations')
  .select('*')
  .order('created_at', { ascending: false })
```

- Sin paginación. Volúmenes esperados de la comunidad no la justifican; si llegamos a 500+ se revisa.
- Sin realtime / sin refetch automático. Botón discreto "Recargar" en el header alcanza si el admin abre el dashboard durante una inscripción activa.
- Estados: `loading | error | empty | ready`.

## UI

### Layout

```
┌──────────────────────────────────────────────────────┐
│  techess · dashboard          ponce.ain@…  [salir]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ Total ─┐ ┌─ Rapid ─┐ ┌─ Blitz ─┐ ┌─ Bullet ─┐   │
│  │   42    │ │   23    │ │   12    │ │    7     │   │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘   │
│                                                      │
│  ┌─ Rating prom (rapid) ─┐  ┌─ Con chess.com ─┐     │
│  │       1340            │  │   38 / 42 (90%)  │     │
│  └───────────────────────┘  └──────────────────┘     │
│                                                      │
│  [🔍 Buscar por nombre, email, chess.com…]          │
│                                                      │
│  ┌─────────────────────────────────────────────────┐│
│  │ Nombre▲│ Email │ Tiempo │ Chess.com │ Rating │…││
│  │────────┼───────┼────────┼───────────┼────────┼─││
│  │ Ana    │ a@…   │ rapid  │ @ana123   │ 1420   │@││
│  │ Beto   │ b@…   │ blitz  │ —         │ —      │ ││
│  └─────────────────────────────────────────────────┘│
│  42 registros · ordenado por nombre                  │
└──────────────────────────────────────────────────────┘
```

### Stats (top)

Calculadas client-side a partir del array completo de registros (no se re-calculan al filtrar — siempre reflejan el total):

- **Total inscriptos** — `registros.length`.
- **Distribución por tiempo** — 3 cards: rapid, blitz, bullet. Contador de cada uno.
- **Rating promedio** — del tiempo más popular (o rapid por default si hay empate). Calculado solo sobre los que tienen rating en ese tiempo (no incluir nulls).
- **Con chess.com vs sin** — formato `N / Total (P%)`.

### Buscador

- Input arriba de la tabla.
- Filtra por substring (case-insensitive) en `nombre`, `email`, `chess_username`.
- Sin debounce (es en memoria, instantáneo).
- Las stats NO se filtran — siguen mostrando el total.

### Tabla

Columnas (en orden):

| Columna | Fuente | Render |
|---|---|---|
| Nombre | `nombre` | texto |
| Email | `email` | texto |
| Tiempo | `tiempo` | label corto: Rapid / Blitz / Bullet |
| Chess.com | `chess_username`, `chess_avatar`, `chess_url` | avatar 20px + `@username` linkeado a `chess_url` (target="_blank" rel="noopener"). "—" si no hay. |
| Rating | `chess_rating_<tiempo>` (según `tiempo` de la fila) | número o "—" |
| Twitter | `twitter_handle` | `@handle` linkeado a `https://x.com/<handle>`. "—" si no. |
| Fecha | `created_at` | formato corto día+mes (ej. `12 may`) |

- Click en header → ordena asc/desc por esa columna.
- Default sort: `created_at` desc (más nuevos primero).
- `font-variant-numeric: tabular-nums` para que ratings y fechas se alineen.
- Footer: `N registros · ordenado por X`.

### Estados

- **Loading inicial:** skeleton de 5 filas con barras grises animadas.
- **Empty total** (0 registros): mensaje "Todavía no se anotó nadie."
- **Empty filtrado** (búsqueda sin matches): "Nada coincide con esa búsqueda."
- **Error de query:** mensaje "No pudimos cargar los registros." + botón "Reintentar".
- **Sesión expirada:** signOut + mensaje "Tu sesión expiró, volvé a entrar" en la vista de login.

### Visual

- Fondo `#050505` (mismo que la app).
- Cards de stats: usar tokens `--glass-*` de `index.css` / `App.css` para consistencia.
- Sin escena 3D. Es una herramienta admin.
- Tipografía: la misma de la app.
- Responsive:
  - Stats en grid 4-col en desktop, 2x2 en mobile.
  - Tabla con `overflow-x: auto` en mobile (preferimos ver todas las columnas a convertir a cards — es admin, la densidad importa).

## Lo que NO se incluye (YAGNI)

- CSV export (no lo pidió).
- Paginación (volumen no lo justifica).
- Realtime / auto-refresh (botón "Recargar" alcanza).
- Edición de registros (read-only).
- Múltiples admins / roles (un solo admin por ahora).
- Recuperación de password (un solo usuario, se hace manual desde el panel de Supabase si pasa).
- Audit log de logins.

## Verificación

Antes de cerrar la implementación:

1. `/dashboard` carga el login si no hay sesión.
2. Login con credenciales válidas pasa a `DashboardView` y muestra registros.
3. Login con credenciales inválidas muestra el mensaje de error.
4. Refresh estando logueado mantiene la sesión y muestra la vista.
5. "Salir" vuelve al login y limpia la sesión.
6. Form de inscripción en `/` sigue funcionando (no roto por el cambio de `persistSession`).
7. Buscador filtra en tiempo real sobre las 3 columnas indicadas.
8. Click en headers reordena.
9. Empty state cuando no hay registros (probar con tabla vacía si es factible, o con filtro que no matchea).
10. Mobile: stats apilan, tabla scrollea horizontal sin romper layout.
