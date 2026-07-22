# Trabajar con varios agentes en paralelo (git worktrees)

> Cómo correr N agentes (Claude Code) sobre este repo **sin que se pisen**.
> Contexto del problema: hoy los agentes corren en **un solo árbol de trabajo
> sobre `main`**, lo que mezcla trabajo sin commitear y arriesga que un
> `git add -A` de cualquiera barra lo de otro. Los worktrees lo arreglan.

## Avisos entre agentes

> Bitácora corta de coordinación. Al abrir sesión, **lee esto primero** y aplica
> lo pendiente. Entrada nueva arriba.

- **2026-07-22 · del carril backend (Opus) → marketplace/viajero (Fable):**
  ya está fijada la convención de numeración de **`db/proposed/`** por carril.
  De aquí en adelante tus espejos usan prefijo **`mNNN_`** (marketplace/viajero);
  los míos usan `bNNN_`. Ambos carriles vienen en 016 → **tu siguiente espejo es
  `m017_`** (el mío `b017_`). Los `NNN_` sin prefijo (001–016, con los pares
  duplicados 011/013/014/015/016) quedan como legacy, **no se renumeran**. Regla
  completa en **`db/proposed/README.md`**. También: los `git add` de rutas con
  brackets (`app/x/[id]/…`) son glob en git — stagea por directorio y revisa
  `git status` (rompió el build de `main` una vez, ya reparado).

## Modelo mental

Un **worktree** = una carpeta extra que comparte el mismo `.git`.
N agentes = N carpetas, N ramas, **un solo repo**. Cada quien edita y commitea
en lo suyo sin tocar a los demás.

> ⚠️ El worktree aísla **archivos, no la base de datos**. Supabase es un solo
> proyecto compartido (ver Gotcha #1).

## Setup (una vez)

Los worktrees van **hermanos** del repo, nunca dentro (si los anidas, Next los
escanea en `dev`/`build`).

```bash
cd ~/codes/ketzal-app
git worktree add ../ketzal-fable    -b agent/fable    main
git worktree add ../ketzal-backend  -b agent/backend  main
git worktree add ../ketzal-cobranza -b agent/cobranza main
git worktree list   # verifica
```

Una **sesión de Claude Code por carpeta**:

```bash
cd ../ketzal-fable    && claude   # agente 1
cd ../ketzal-backend  && claude   # agente 2
cd ../ketzal-cobranza && claude   # agente 3
```

Git no deja checar la misma rama en dos worktrees a la vez — te protege solo.

## Reglas para CADA agente (pégalas en su primer prompt)

```
Trabajas en el worktree <ruta> sobre la rama agent/<tuyo>.
- Commitea SOLO aquí, nunca en main directo.
- NUNCA `git add -A`: agrega solo TUS rutas por nombre.
- Tu carril de archivos: <lista>. Fuera de ahí, no editas sin avisar.
- Archivos compartidos (src/lib/db/database.types.ts, migraciones,
  package.json, primitivos de UI): NO los tocas salvo que seas el dueño.
- Antes de integrar: `git fetch origin && git rebase origin/main`, resuelve, mergea.
- Verifica `tsc --noEmit` + `next build` antes de cada commit.
- BD Supabase es COMPARTIDA: si tu tarea cambia el esquema, coordínalo con
  el dueño de BD. No apliques migraciones en paralelo.
```

## Los 2 gotchas senior

**1. Los worktrees NO aíslan la base de datos.** Un solo proyecto Supabase.
Dos agentes aplicando migraciones a la vez chocan aunque sus archivos estén
separados.
- Regla mínima: **un solo "dueño de BD"** aplica migraciones; los demás piden.
- Nivel pro: **Supabase branching** — una BD de preview por rama git
  (`create_branch`), mergeas esquema al mergear código. Aísla código *y* datos.

**2. El conflicto no viene de los archivos de feature, viene de las SUPERFICIES
compartidas** (`database.types.ts`, migraciones, `package.json`, componentes
base). Eso no lo arregla el worktree — lo arregla la **propiedad única**: cada
superficie compartida tiene un dueño designado.

## Carriles de propiedad (convención del proyecto)

| Carril | Dueño típico | Archivos |
|---|---|---|
| Presentación / UI | Fable | `*.tsx` de componentes y pantallas |
| Backend / dinero | Opus | `actions.ts`, RPCs, RLS, migraciones, `database.types.ts` |
| Features puntuales | ad-hoc | su carpeta de feature (p. ej. `cobranza/`) |

Regla de oro: **el dueño de BD/tipos es uno solo.** Los demás usan un cast
puntual en su `data.ts` si necesitan un RPC nuevo, sin tocar `database.types.ts`.

### Espejos de migraciones (`db/proposed/`)

Ambos carriles escriben espejos de migraciones aquí. Para no chocar en la
numeración, **cada carril prefija con su letra y lleva su propio contador**:
`bNNN_` (backend / dinero) y `mNNN_` (marketplace / viajero). Como los prefijos
difieren, nunca coinciden aunque usen el mismo número. Detalle, próximo número y
tabla de legacy en **`db/proposed/README.md`**. Los `NNN_` sin prefijo (001–016)
son previos a la convención y **no se renumeran**.

> ⚠️ **`git add` con rutas dinámicas de Next.** Los paths con brackets
> (`app/servicio/[id]/…`) son *glob* en los pathspecs de git: `git add
> "app/x/[id]/page.tsx"` puede no stagear nada (el `[id]` se interpreta como
> clase de caracteres). Stagea **por directorio** (`git add src/app/servicio`) y
> **revisa `git status` antes de commitear** para confirmar que quedó staged.

## Integración (checkpoints)

```bash
cd ~/codes/ketzal-app          # worktree de main
git fetch origin
git merge --ff-only agent/backend    # o PR si quieres revisión
git merge --ff-only agent/fable
git push
```

Cada agente **rebasa sobre `origin/main` antes de mergear** → historia lineal,
sin merges cruzados.

**Bonus Vercel:** cada rama `agent/*` genera su **preview deploy** propio (no
toca prod). Solo el merge a `main` despliega producción. Pruebas aislado,
promueves mergeando.

## Limpieza

```bash
git worktree remove ../ketzal-fable
git worktree prune
git branch -d agent/fable
```

## ¿Equipo de agentes o un orquestador?

| Modelo | Cómo | Cuándo |
|---|---|---|
| **Equipo de agentes** | N sesiones manuales, 1 worktree c/u, tú integras | Trabajo paralelo e **independiente** (UI vs backend). Máximo control; tú eres el cuello de botella de integración. |
| **Un orquestador** | Una sesión que hace fan-out con el tool `Agent` (`isolation: "worktree"`) o el tool `Workflow` | Dividir **un** feature en N pedazos y unirlos. El harness crea/limpia worktrees y coordina; menos integración manual. |

No hay una skill dedicada a esto; los primitivos son el tool `Agent` con
`isolation: "worktree"` y el tool `Workflow`.
