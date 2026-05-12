# Dashboard de inscriptos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la ruta `/dashboard` que muestra los inscriptos en `techess_registrations` a un único admin autenticado vía Supabase Auth, con stats agregadas, buscador y tabla.

**Architecture:** Single-page Vite/React 19 app sin router. `main.jsx` hace path check sobre `window.location.pathname` y renderiza `<Dashboard />` o `<App />`. `<Dashboard />` envuelve un gate de Supabase Auth: muestra `<DashboardLogin />` o `<DashboardView />` según `supabase.auth.getSession()`. La vista autenticada hace un único `select * from techess_registrations` y filtra/ordena en memoria.

**Tech Stack:** React 19, Vite 8, @supabase/supabase-js 2.x. CSS plano usando tokens `--glass-*` / `--ink-*` ya existentes en `src/App.css`. Sin librerías nuevas.

**Verification:** El proyecto no tiene framework de tests configurado y agregarlo está fuera de scope. La verificación es manual en el browser (el dev server ya corre — el usuario lo mantiene). Cada paso de verificación abre `http://localhost:5173/dashboard` o `/` y confirma el comportamiento esperado.

**Spec:** `docs/superpowers/specs/2026-05-12-dashboard-design.md`

---

## Pre-requisito (acción manual del usuario)

Antes de la Task 5 (login flow), el usuario tiene que:

1. **Crear usuario admin en Supabase:**
   Panel Supabase → Authentication → Users → "Add user" → email + password. Recordá las credenciales para el login.

2. **Agregar policy de SELECT** ejecutando en Supabase SQL editor:

   ```sql
   create policy "authenticated can read registrations"
   on public.techess_registrations
   for select
   to authenticated
   using (true);
   ```

   Verificar después con `select * from pg_policies where tablename = 'techess_registrations';` — debería listar la nueva policy + la de INSERT existente.

El plan recuerda esto al inicio de Task 5.

---

## File Structure

```
src/
  main.jsx                       (modify: path check)
  Dashboard.jsx                  (create: auth gate wrapper)
  Dashboard.css                  (create: dashboard styles, dark tokens scoped)
  components/
    DashboardLogin.jsx           (create: login form)
    DashboardView.jsx            (create: stats + search + table — fetch + render)
  lib/
    supabase.js                  (modify: persistSession + autoRefreshToken to true)
```

Responsabilidades:
- `main.jsx`: decide qué root renderizar.
- `Dashboard.jsx`: maneja sesión y auth state changes. Renderiza login o view.
- `DashboardLogin.jsx`: form controlado. Llama `signInWithPassword`. Solo UI + submit.
- `DashboardView.jsx`: fetch de registros, estado de loading/error/empty, computación de stats, búsqueda, tabla, sort. Es el archivo más grande del feature (~250 líneas estimadas). Si crece más, se splittea en `DashboardStats.jsx` + `DashboardTable.jsx` — por ahora cabe junto.
- `Dashboard.css`: estilos. Scope `.dashboard` con los tokens dark heredados de `.page` default.
- `lib/supabase.js`: única edición — activar persistencia.

---

## Task 1: Habilitar persistencia de sesión en Supabase client

**Files:**
- Modify: `src/lib/supabase.js`

- [ ] **Step 1: Cambiar opciones de auth**

Reemplazar el bloque actual:

```js
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
```

por:

```js
// Persistencia activada para que la sesión del admin del dashboard sobreviva
// al reload. El form anon de inscripción en / no usa sesión, así que no se
// ve afectado.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})
```

- [ ] **Step 2: Verificar que el form de inscripción sigue andando**

Abrir `http://localhost:5173/`, recorrer flujo hasta el form, completar con email único de prueba, submit. Confirmar que pasa a stage `board` sin error.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.js
git commit -m "Habilitar persistSession en Supabase para el dashboard admin"
```

---

## Task 2: Routing — path check en main.jsx

**Files:**
- Modify: `src/main.jsx`
- Create (stub): `src/Dashboard.jsx`

- [ ] **Step 1: Crear stub de Dashboard**

`src/Dashboard.jsx`:

```jsx
export default function Dashboard() {
  return (
    <div style={{ padding: 24, color: '#f4f3ef', background: '#050505', minHeight: '100vh' }}>
      Dashboard stub
    </div>
  )
}
```

- [ ] **Step 2: Modificar main.jsx para hacer path check**

Reemplazar el contenido entero de `src/main.jsx` por:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Dashboard from './Dashboard.jsx'

const isDashboard = window.location.pathname === '/dashboard'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isDashboard ? <Dashboard /> : <App />}
  </StrictMode>,
)
```

- [ ] **Step 3: Verificar ambas rutas**

- `http://localhost:5173/` → la app normal (boot → intro → selecting).
- `http://localhost:5173/dashboard` → texto "Dashboard stub" sobre fondo negro.

- [ ] **Step 4: Commit**

```bash
git add src/main.jsx src/Dashboard.jsx
git commit -m "Agregar routing por pathname para /dashboard"
```

---

## Task 3: Estilos base del dashboard

**Files:**
- Create: `src/Dashboard.css`

- [ ] **Step 1: Escribir CSS base con tokens y layout shell**

`src/Dashboard.css`:

```css
.dashboard {
  --ink: #f4f3ef;
  --ink-soft-08: rgba(244, 243, 239, 0.08);
  --ink-soft-14: rgba(244, 243, 239, 0.14);
  --ink-soft-16: rgba(244, 243, 239, 0.16);
  --muted: rgba(244, 243, 239, 0.6);
  --bg: #050505;
  --glass-bg: rgba(20, 20, 22, 0.55);
  --glass-border: var(--ink-soft-14);
  --glass-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.7);
  --input-bg: rgba(15, 15, 17, 0.7);
  --input-border: var(--ink-soft-16);
  --btn-bg: rgba(244, 243, 239, 0.92);
  --btn-ink: #0a0a0c;

  min-height: 100svh;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  padding: 24px;
}

.dashboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.dashboard__brand {
  font-size: 14px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.dashboard__user {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--muted);
}

.dashboard__btn {
  background: var(--btn-bg);
  color: var(--btn-ink);
  border: 0;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}

.dashboard__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dashboard__btn--ghost {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--ink-soft-16);
}

/* Login */
.dashboard-login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100svh;
  background: var(--bg);
  padding: 24px;
}

.dashboard-login__card {
  width: 100%;
  max-width: 360px;
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--glass-shadow);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-login__title {
  font-size: 20px;
  margin-bottom: 4px;
}

.dashboard-login__eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.dashboard-login label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.dashboard-login input {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  padding: 10px 12px;
  color: var(--ink);
  font-size: 14px;
}

.dashboard-login input:focus {
  outline: none;
  border-color: var(--ink);
}

.dashboard-login__error {
  font-size: 12px;
  color: #ff8a80;
  letter-spacing: 0.05em;
}

/* Stats */
.dashboard__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.dashboard__stat {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dashboard__stat-label {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}

.dashboard__stat-value {
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}

.dashboard__stat-sub {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.dashboard__stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

/* Search */
.dashboard__search {
  width: 100%;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  padding: 12px 14px;
  color: var(--ink);
  font-size: 14px;
  margin-bottom: 12px;
}

.dashboard__search:focus {
  outline: none;
  border-color: var(--ink);
}

/* Table */
.dashboard__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--glass-bg);
}

.dashboard__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.dashboard__table th,
.dashboard__table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ink-soft-08);
  white-space: nowrap;
}

.dashboard__table th {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}

.dashboard__table th:hover {
  color: var(--ink);
}

.dashboard__table tr:last-child td {
  border-bottom: 0;
}

.dashboard__chess {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
  text-decoration: none;
}

.dashboard__chess:hover {
  text-decoration: underline;
}

.dashboard__chess-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

.dashboard__link {
  color: var(--ink);
  text-decoration: none;
}

.dashboard__link:hover {
  text-decoration: underline;
}

.dashboard__muted {
  color: var(--muted);
}

.dashboard__footer {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}

.dashboard__state {
  padding: 32px;
  text-align: center;
  color: var(--muted);
}

.dashboard__skeleton-row {
  height: 36px;
  background: var(--ink-soft-08);
  border-radius: 6px;
  margin-bottom: 6px;
  animation: shimmer 1.2s ease-in-out infinite;
}

@keyframes shimmer {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@media (max-width: 720px) {
  .dashboard {
    padding: 16px;
  }
  .dashboard__stats {
    grid-template-columns: 1fr 1fr;
  }
  .dashboard__stats-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Import en el stub para verificar que carga**

Editar `src/Dashboard.jsx`:

```jsx
import './Dashboard.css'

export default function Dashboard() {
  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">techess · dashboard</span>
      </div>
      Dashboard shell
    </div>
  )
}
```

- [ ] **Step 3: Verificar visualmente**

Abrir `http://localhost:5173/dashboard`. Confirmar:
- Fondo negro `#050505`.
- "techess · dashboard" en gris claro arriba a la izquierda, en mayúsculas con letter-spacing.
- "Dashboard shell" en blanco abajo.

- [ ] **Step 4: Commit**

```bash
git add src/Dashboard.css src/Dashboard.jsx
git commit -m "Agregar estilos base del dashboard"
```

---

## Task 4: Componente DashboardLogin (solo UI, sin auth)

**Files:**
- Create: `src/components/DashboardLogin.jsx`

- [ ] **Step 1: Crear DashboardLogin con form controlado**

`src/components/DashboardLogin.jsx`:

```jsx
import { useState } from 'react'

export default function DashboardLogin({ onSignIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onSignIn({ email: email.trim().toLowerCase(), password })
    } catch (err) {
      setError(err.message ?? 'No pudimos entrar. Probá de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <div className="dashboard-login">
      <form className="dashboard-login__card" onSubmit={handleSubmit}>
        <span className="dashboard-login__eyebrow">techess · dashboard</span>
        <h1 className="dashboard-login__title">Entrar</h1>

        <label>
          Email
          <input
            required
            type="email"
            autoComplete="email"
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button
          type="submit"
          className="dashboard__btn"
          disabled={submitting}
        >
          {submitting ? 'ENTRANDO…' : 'ENTRAR'}
        </button>

        {error && <span className="dashboard-login__error">{error}</span>}
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Renderizar provisorio desde Dashboard.jsx para ver el form**

Editar `src/Dashboard.jsx`:

```jsx
import DashboardLogin from './components/DashboardLogin'
import './Dashboard.css'

export default function Dashboard() {
  const fakeSignIn = async () => {
    throw new Error('Stub: auth no implementado todavía')
  }
  return <DashboardLogin onSignIn={fakeSignIn} />
}
```

- [ ] **Step 3: Verificar el form**

- `http://localhost:5173/dashboard` muestra la card centrada con eyebrow, título "Entrar", inputs de email y password, botón "ENTRAR".
- Submit con cualquier valor → muestra error en rojo "Stub: auth no implementado todavía".
- Botón se deshabilita durante el submit y muestra "ENTRANDO…" un instante (en el stub el error vuelve casi inmediato).

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardLogin.jsx src/Dashboard.jsx
git commit -m "Agregar UI del login del dashboard"
```

---

## Task 5: Wiring de Supabase Auth en Dashboard.jsx

**Pre-requisito (verificar antes de empezar):**
- [ ] Usuario admin creado en Supabase Auth.
- [ ] Policy de SELECT para `authenticated` aplicada (ver bloque de SQL al inicio del plan).

**Files:**
- Modify: `src/Dashboard.jsx`
- Create (stub): `src/components/DashboardView.jsx`

- [ ] **Step 1: Crear stub de DashboardView**

`src/components/DashboardView.jsx`:

```jsx
export default function DashboardView({ session, onSignOut }) {
  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">techess · dashboard</span>
        <div className="dashboard__user">
          <span>{session.user.email}</span>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onSignOut}>
            Salir
          </button>
        </div>
      </div>
      <div className="dashboard__state">Vista autenticada — datos pendientes.</div>
    </div>
  )
}
```

- [ ] **Step 2: Reescribir Dashboard.jsx con auth gate**

Reemplazar el contenido entero de `src/Dashboard.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import DashboardLogin from './components/DashboardLogin'
import DashboardView from './components/DashboardView'
import './Dashboard.css'

export default function Dashboard() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSignIn = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message?.toLowerCase().includes('invalid login')) {
        throw new Error('Email o password incorrectos.')
      }
      throw new Error('No pudimos entrar. Probá de nuevo.')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  if (!ready) {
    return <div className="dashboard-login" />
  }

  if (!session) {
    return <DashboardLogin onSignIn={handleSignIn} />
  }

  return <DashboardView session={session} onSignOut={handleSignOut} />
}
```

- [ ] **Step 3: Verificar login completo**

1. `http://localhost:5173/dashboard` → muestra el form (sin sesión).
2. Entrar con credenciales inválidas → mensaje "Email o password incorrectos.".
3. Entrar con las credenciales del admin → pasa a la vista autenticada con el email del admin arriba a la derecha y "Vista autenticada — datos pendientes." en el body.
4. Reload de la página estando logueado → sigue mostrando la vista autenticada (sesión persistida).
5. Click "Salir" → vuelve al login sin reload.

- [ ] **Step 4: Commit**

```bash
git add src/Dashboard.jsx src/components/DashboardView.jsx
git commit -m "Conectar Supabase Auth al dashboard"
```

---

## Task 6: Fetch de registros y estados base (loading / error / empty)

**Files:**
- Modify: `src/components/DashboardView.jsx`

- [ ] **Step 1: Agregar fetch y estados**

Reemplazar el contenido entero de `src/components/DashboardView.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function DashboardView({ session, onSignOut }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [rows, setRows] = useState([])

  const load = useCallback(async () => {
    setStatus('loading')
    const { data, error } = await supabase
      .from('techess_registrations')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      // 401/403 → sesión expirada
      if (error.code === '401' || error.code === '403' || error.status === 401 || error.status === 403) {
        await supabase.auth.signOut()
        return
      }
      console.warn('dashboard load failed', error)
      setStatus('error')
      return
    }
    setRows(data ?? [])
    setStatus('ready')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <span className="dashboard__brand">techess · dashboard</span>
        <div className="dashboard__user">
          <span>{session.user.email}</span>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={load}>
            Recargar
          </button>
          <button type="button" className="dashboard__btn dashboard__btn--ghost" onClick={onSignOut}>
            Salir
          </button>
        </div>
      </div>

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
        <pre style={{ color: 'var(--muted)', fontSize: 12, overflow: 'auto' }}>
          {JSON.stringify(rows, null, 2)}
        </pre>
      )}
    </div>
  )
}
```

(El `<pre>` con JSON es temporal — se reemplaza en Task 7.)

- [ ] **Step 2: Verificar estados**

1. Entrar al dashboard logueado → ve los registros como JSON crudo (asumiendo que hay registros en la tabla).
2. Click "Recargar" → ve los skeletons un instante y vuelve al JSON.
3. (Opcional, si está fácil simular) Cortar internet o equivalente → muestra "No pudimos cargar los registros." con botón "Reintentar".
4. Si la tabla está vacía: muestra "Todavía no se anotó nadie." (si no, hay registros, lo confirmás más adelante en Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardView.jsx
git commit -m "Cargar registros desde Supabase en el dashboard"
```

---

## Task 7: Stats agregadas

**Files:**
- Modify: `src/components/DashboardView.jsx`

- [ ] **Step 1: Agregar computación de stats y render**

En `src/components/DashboardView.jsx`:

1. Después del `import` de supabase, agregar:

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
```

(reemplaza la línea de import existente — añade `useMemo`).

2. Dentro de `DashboardView`, después de `const [rows, setRows] = useState([])`, agregar:

```jsx
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
```

3. Reemplazar el bloque `{status === 'ready' && rows.length > 0 && (<pre>…</pre>)}` por:

```jsx
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

    <pre style={{ color: 'var(--muted)', fontSize: 12, overflow: 'auto' }}>
      {JSON.stringify(rows, null, 2)}
    </pre>
  </>
)}
```

(El `<pre>` sigue ahí, se quita en Task 8 cuando la tabla lo reemplaza.)

- [ ] **Step 2: Verificar stats**

Abrir el dashboard. Confirmar:
- 4 cards arriba (Total, Rapid, Blitz, Bullet) con números coherentes con los registros que tenés.
- Card "Rating prom · {tiempo}" muestra el promedio del tiempo más popular (o "—" si nadie tiene rating en ese tiempo).
- Card "Con chess.com" muestra `N / Total` y el % abajo.
- Los números suman: rapid + blitz + bullet = total.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardView.jsx
git commit -m "Agregar stats agregadas al dashboard"
```

---

## Task 8: Tabla de registros con sort

**Files:**
- Modify: `src/components/DashboardView.jsx`

- [ ] **Step 1: Helpers para formato y tiempo**

En la parte superior de `DashboardView.jsx`, fuera del componente, agregar:

```jsx
const TIEMPO_LABEL = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet' }

const COLUMNS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'tiempo', label: 'Tiempo' },
  { key: 'chess_username', label: 'Chess.com' },
  { key: 'rating', label: 'Rating' },
  { key: 'twitter_handle', label: 'Twitter' },
  { key: 'created_at', label: 'Fecha' },
]

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
  if (va == null) return 1 // null al final
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'es')
}
```

- [ ] **Step 2: Agregar estado de sort y filas ordenadas**

Dentro de `DashboardView`, después del `useMemo` de stats:

```jsx
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
```

- [ ] **Step 3: Reemplazar el `<pre>` por la tabla**

Reemplazar el bloque `<pre>{JSON.stringify(rows…)}</pre>` por:

```jsx
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
      {sortedRows.map((r) => {
        const rating = ratingOf(r)
        return (
          <tr key={r.id ?? `${r.email}-${r.created_at}`}>
            <td>{r.nombre}</td>
            <td>{r.email}</td>
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
  {sortedRows.length} registro{sortedRows.length === 1 ? '' : 's'} · ordenado por {COLUMNS.find((c) => c.key === sort.key)?.label}
</div>
```

- [ ] **Step 4: Verificar la tabla**

- Tabla con headers en mayúsculas. La columna activa muestra ▲ o ▼.
- Default: ordenada por Fecha descendente (más nuevos primero).
- Click en "Nombre" → ordena alfabéticamente ascendente. Click de vuelta → descendente.
- Click en "Rating" → ordena por rating del tiempo de cada fila, nulls al final.
- Avatares de chess.com se ven; click abre el perfil en tab nueva.
- Twitter linkeado a `x.com/handle` en tab nueva.
- Sin chess.com / sin twitter / sin rating muestran "—" en gris.
- Footer muestra "N registros · ordenado por X".

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardView.jsx
git commit -m "Agregar tabla de registros con sort por columna"
```

---

## Task 9: Buscador

**Files:**
- Modify: `src/components/DashboardView.jsx`

- [ ] **Step 1: Agregar estado y filtrado**

Dentro de `DashboardView`, después de `const [sort, …] = useState(…)`:

```jsx
const [query, setQuery] = useState('')

const filteredRows = useMemo(() => {
  const q = query.trim().toLowerCase()
  if (!q) return sortedRows
  return sortedRows.filter((r) => {
    const haystack = [r.nombre, r.email, r.chess_username].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(q)
  })
}, [sortedRows, query])
```

- [ ] **Step 2: Reemplazar el render de filas para usar `filteredRows`**

En el JSX:

- `sortedRows.map(...)` → `filteredRows.map(...)`.
- En el footer, `{sortedRows.length}` → `{filteredRows.length}`.

- [ ] **Step 3: Agregar el input de búsqueda**

Justo arriba de `<div className="dashboard__table-wrap">`, agregar:

```jsx
<input
  className="dashboard__search"
  type="search"
  placeholder="Buscar por nombre, email, chess.com…"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
/>
```

- [ ] **Step 4: Empty state cuando el filtro no matchea**

Antes de `<div className="dashboard__table-wrap">`, envolver así:

```jsx
{filteredRows.length === 0 ? (
  <div className="dashboard__state">Nada coincide con esa búsqueda.</div>
) : (
  <>
    <div className="dashboard__table-wrap">
      … (la tabla)
    </div>
    <div className="dashboard__footer">
      {filteredRows.length} registro{filteredRows.length === 1 ? '' : 's'} · ordenado por {COLUMNS.find((c) => c.key === sort.key)?.label}
    </div>
  </>
)}
```

(Y mover el footer dentro del `else` como muestra arriba.)

- [ ] **Step 5: Verificar buscador**

- Input visible arriba de la tabla.
- Escribir un substring del nombre de un registro → la tabla se filtra en vivo.
- Search no afecta las cards de stats (siguen mostrando totales).
- Búsqueda que no matchea nada → muestra "Nada coincide con esa búsqueda.".
- Limpiar el input → vuelven todas las filas.
- Búsqueda es case-insensitive (probar mayúsculas).
- Funciona contra email y chess_username además de nombre.

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardView.jsx
git commit -m "Agregar buscador al dashboard"
```

---

## Task 10: Pulido — sesión expirada y mobile

**Files:**
- Modify: `src/components/DashboardView.jsx` (verificación 401/403)
- Modify: `src/Dashboard.css` (verificación responsive)

- [ ] **Step 1: Revisar manejo de 401/403 en `load`**

Mirar el bloque `if (error.code === '401'…)` agregado en Task 6. Si el formato real del error de Supabase es distinto (por ejemplo `error.message?.includes('JWT')` o `error.status`), ajustar la condición. Para verificar el formato real:

1. En el browser estando logueado, abrir DevTools → Application → IndexedDB → `supabase.auth.token` (o LocalStorage según versión).
2. Borrar la sesión a mano (o esperar a que expire).
3. Click "Recargar" en el dashboard.
4. Inspeccionar en Network el response de la query que falla. Confirmar el código de status y el `error.code` que devuelve el SDK.
5. Ajustar la condición si hace falta.

Si el manejo actual no captura el caso, agregar también:

```jsx
if (error.message?.toLowerCase().includes('jwt') || error.message?.toLowerCase().includes('not authenticated')) {
  await supabase.auth.signOut()
  return
}
```

Si funciona como está, no tocar nada.

- [ ] **Step 2: Verificar responsive mobile**

- Abrir DevTools → modo responsive → 375px.
- Stats: las 4 cards arriba en grid 2×2. Las 2 cards de abajo (rating prom, con chess.com) en 1 columna apilada.
- Tabla: scrollea horizontal si no entra. No hay overflow del layout entero.
- Login (cerrar sesión y mirar el form en mobile): la card ocupa el ancho con padding y se ve centrada verticalmente.

Si algo se rompe, ajustar `@media (max-width: 720px)` en `Dashboard.css`.

- [ ] **Step 3: Verificar flujo end-to-end**

Hacer una pasada completa:
1. `/` → form de inscripción funciona (inscribir uno de prueba).
2. `/dashboard` → login.
3. Credenciales mal → error.
4. Credenciales OK → vista con stats, buscador, tabla. El nuevo inscripto aparece arriba.
5. Click columna "Nombre" → reordena.
6. Buscar por algo del nuevo inscripto → queda solo esa fila.
7. Limpiar búsqueda → vuelven todas.
8. Reload → sigue logueado, datos cargan de nuevo.
9. "Salir" → vuelve al login.
10. Reload → sigue desautenticado.

- [ ] **Step 4: Commit (si hubo cambios)**

```bash
git add -A
git commit -m "Pulir manejo de sesión expirada y responsive del dashboard"
```

(Si no hubo cambios en Step 1 ni 2, saltar el commit.)

---

## Self-Review (interno, post-escritura)

Verificado:

1. **Spec coverage:**
   - Routing path check → Task 2 ✓
   - Setup Supabase (manual) + policy → pre-requisito + Task 5 ✓
   - Auth flow (getSession + onAuthStateChange + signInWithPassword + signOut) → Task 5 ✓
   - `persistSession: true` → Task 1 ✓
   - Fetch + loading/error/empty → Task 6 ✓
   - Stats (4 cards + 2 cards) → Task 7 ✓
   - Buscador → Task 9 ✓
   - Tabla con columnas y sort → Task 8 ✓
   - Estados: empty total, empty filtrado, error con retry, skeleton → Task 6 + Task 9 ✓
   - Visual: tokens `--glass-*`, fondo `#050505`, tabular-nums → Task 3 ✓
   - Responsive: stats 2×2, tabla overflow-x → Task 3 (CSS) + Task 10 (verif) ✓
   - Sesión expirada → Task 6 (handling) + Task 10 (verif) ✓

2. **Placeholder scan:** Sin TBD/TODO. Todos los pasos con código tienen código completo. No hay "similar to Task N".

3. **Type consistency:** `onSignIn`, `onSignOut`, `session`, `status`, `rows`, `sort`, `query` se nombran igual en todas las tasks donde aparecen. `COLUMNS` y `ratingOf` se definen en Task 8 y se usan en Task 9. `compareRows` solo se usa dentro de Task 8 y queda local al archivo.

4. **No tests:** Asumido. El proyecto no tiene framework de tests y no está en scope agregar uno. La verificación es manual en el dev server.
