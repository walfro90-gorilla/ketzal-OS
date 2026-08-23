# ketzal-mcp

Servidor [MCP](https://modelcontextprotocol.io) de **Ketzal OS**. Deja que cualquier
agente IA de terminal opere el back-office en lenguaje natural:

> *"¿a quién le tengo que cobrar esta semana?"*
> *"registra un abono de $2,000 a la venta de Meny y emite el recibo"*
> *"¿cuántos lugares quedan en la salida a Creel del sábado?"*

## Cómo funciona la seguridad

El servidor **se autentica como tú**, con tu propia cuenta de Ketzal, y opera con tu
JWT. La RLS por agencia y los guards de los RPCs deciden qué ves y qué puedes hacer —
exactamente lo mismo que en la app web. **Nunca usa la service role key**: el agente
no puede ver ni tocar nada que tú no puedas.

En disco sólo queda tu **refresh token**, en `~/.config/ketzal/session.json` con
permisos `0600`. La contraseña no se guarda nunca, y el archivo de configuración de tu
cliente MCP no lleva secretos.

## Instalación

```bash
# 1. Entra con tu correo (te llega un código de 6 dígitos)
npx ketzal-mcp login

# 2. Registra el servidor en tu cliente
claude mcp add ketzal -- npx -y ketzal-mcp
```

Verifica con `claude mcp list` (debe decir `ketzal ✔ Connected`) o con
`npx ketzal-mcp doctor`, que además te dice con qué cuenta y agencia estás operando.

<details>
<summary>Claude Desktop, Cursor y otros clientes</summary>

Mismo binario, distinto archivo de configuración:

```json
{
  "mcpServers": {
    "ketzal": {
      "command": "npx",
      "args": ["-y", "ketzal-mcp"]
    }
  }
}
```

- **Claude Desktop** → `claude_desktop_config.json`
- **Cursor** → `.cursor/mcp.json`
- **Windsurf / Zed / Codex** → su archivo equivalente de servidores MCP

Sólo lectura (recomendado en máquinas de consulta): agrega
`"env": { "KETZAL_MCP_READONLY": "1" }`.
</details>

## Subcomandos

| Comando | Qué hace |
|---|---|
| `npx ketzal-mcp login` | Entra con tu correo y guarda la sesión |
| `npx ketzal-mcp doctor` | Verifica sesión, conectividad, rol y agencia |
| `npx ketzal-mcp logout` | Borra la sesión local |
| `npx ketzal-mcp` | Arranca el servidor por stdio (lo llama tu cliente MCP) |

## Qué puede hacer

38 herramientas: 17 de lectura y 21 de escritura, de las cuales 8 mueven dinero.

| Área | Herramientas |
|---|---|
| Identidad | `whoami`, `agencias` |
| Buscar | `buscar` (el ⌘K de la app) |
| Ventas | `ventas`, `venta`, `crear_venta`, `convertir_cotizacion` |
| Clientes | `clientes`, `crear_cliente`, `editar_cliente` |
| Dinero | `registrar_abono`, `emitir_recibo`, `emitir_voucher`, `preview_plan_pagos`, `plan_pagos`, `preview_cancelacion`, `cancelar_venta`, `devolver_pago`, `creditos`, `aplicar_credito` |
| Cobranza | `cobranza` |
| Operación | `salidas`, `pasajeros`, `pasajero_agregar`, `pasajero_quitar`, `asiento` |
| Catálogo | `servicios`, `crear_servicio`, `editar_servicio`, `crear_salida`, `editar_salida`, `publicar_servicio` |
| Dirección | `panel`, `reportes`, `comisiones_cuentas`, `gastos`, `registrar_gasto`, `revertir_gasto` |

Todas van prefijadas con `ketzal_`.

**Recursos** (contexto que el cliente puede leer sin gastar una llamada):
`ketzal://me`, `ketzal://cobranza`, `ketzal://agenda`.

**Prompts** (en Claude Code son slash commands): `/mcp__ketzal__cierre_del_dia`,
`/mcp__ketzal__a_quien_cobrar`, `/mcp__ketzal__revisar_salida`,
`/mcp__ketzal__estado_del_negocio`.

## Frenos en las operaciones de dinero

El ledger de Ketzal es **append-only**: un abono mal registrado no se borra, se
contra-asienta. Por eso:

- Toda herramienta que mueve dinero exige `confirmar: true` explícito.
- `cancelar_venta` exige que le repitas la penalización que devolvió
  `preview_cancelacion`. La pena sube por tramos según los días que falten para el
  viaje, así que un preview de ayer puede estar en otro tramo hoy.
- Hay un tope de **20 escrituras de dinero por sesión** (`KETZAL_MCP_MAX_WRITES`)
  como freno anti-bucle. Al llegar, reinicia el servidor. Las ediciones que no
  mueven dinero (catálogo, clientes, pasajeros) llevan un cupo aparte y más ancho
  (`KETZAL_MCP_MAX_DATA_WRITES`, 100): se corrigen volviendo a editar, no con un
  contra-asiento, y cargar un catálogo completo agotaría el cupo del ledger.
- Los cobros de Mercado Pago **no se devuelven desde aquí**: el dinero tiene que
  salir primero en la API de MP, y eso vive en la app.

## Cargar un catálogo desde la terminal

`crear_servicio` / `editar_servicio` / `crear_salida` / `editar_salida` cubren el
alta y la corrección completas: nombre, destino, cupo, descripción, incluye / no
incluye, itinerario día por día, preguntas frecuentes, precios por tipo de
habitación, y las fechas de salida con su cupo, su ajuste de temporada y sus
precios especiales por paquete.

Dos reglas que conviene tener claras:

- **La edición es parcial.** Sólo se tocan los campos que mandas; el resto queda
  intacto. La excepción son las listas (`paquetes`, `incluye`, `itinerario`…): cada
  una se reemplaza completa, así que mándala con todos sus elementos.
- **El precio público "desde" se deriva** del paquete más barato (b046). No se
  escribe a mano: cambia solo al cambiar los paquetes.

Un servicio nace **sin publicar**. Se prende con `publicar_servicio` cuando esté
listo, y desde ese momento lo ve cualquier visitante de internet.

**Lo que sigue viviendo en la app web:** las fotos y el video del servicio, porque
hay que subir el archivo a Storage. Todo lo demás se puede dictar desde aquí.

## Lo que este servidor NO es

Autenticarse como usuario real te da la RLS, **pero no las restricciones de la
interfaz**. Las reglas de navegación de la app web (qué secciones ve cada rol) viven
sólo en TypeScript: no son una frontera de seguridad y nunca lo fueron — cualquier
usuario autenticado puede llamar la API de Postgres directo desde el navegador.

Por eso este servidor **no filtra herramientas por rol**: sería teatro. Las 38 se
listan siempre, y las que tu cuenta no puede usar responden con el mensaje del guard
en SQL, que explica por qué. La frontera real son la RLS y esos guards. Si vas a
repartir este MCP a agentes de agencia, audítalos primero.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `KETZAL_MCP_READONLY=1` | Esconde por completo las herramientas de escritura |
| `KETZAL_MCP_MAX_WRITES` | Tope de escrituras por sesión (default 20) |
| `KETZAL_EMAIL` / `KETZAL_PASSWORD` | Login sin interacción, para CI. Desaconsejado a diario: deja la contraseña en un archivo de configuración |
| `KETZAL_SUPABASE_URL` / `KETZAL_SUPABASE_KEY` | Apuntar a otro proyecto de Supabase |

## Desarrollo

```bash
pnpm install     # `mcp/` es su propio workspace: no toca el lockfile del repo
pnpm typecheck
pnpm build       # antes de test: el handshake arranca dist/index.js
pnpm test
```
