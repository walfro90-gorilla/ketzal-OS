# Estado del deploy — WhatsApp auto-envío (retomar aquí)

> ## ⏸️ PAUSADO A PROPÓSITO (2026-07-23)
> **Motivo:** aún no tenemos el número de WhatsApp definitivo/dedicado. Se retoma cuando lo haya.
>
> **Estado verificado al pausar (nada corriendo, cero fugas):**
> - `app_settings.wa_auto_enabled = false` (gate maestro OFF ⇒ el poller no manda nada).
> - `clawbot_reminders`: 0 en vuelo (`enviando`), 0 nuevos enviados por el bot. La box **nunca terminó de arrancar** (falta el service key final + parear QR).
> - **Cero efecto en el resto del OS:** las funciones del auto-envío (`clawbot_claim_pendientes`/`clawbot_marcar_bot`) solo las invoca el poller de la box (apagado) y están tras el gate. El **Clawbot in-app** (el agente manda a 1 clic desde `/clawbot`), la cobranza, el dinero y el cron que llena el outbox siguen **intactos** — NO se tocan al pausar.
> - Código, BD (en el ledger, migración `ketzal_wa_autosend`), allowlist `saldo_sin_plan` y el matcher de STOP/BAJA quedaron **listos y verificados**; solo esperan el número.
>
> **Para retomar:** no hay que deshacer nada. Consigue el número dedicado y sigue el runbook de abajo desde *Checkpoint 1*. ⚠️ **Antes de prender el gate (Paso 7), revisa/limpia los pendientes viejos del outbox** (al pausar había ~116 `pendiente` acumulados por el cron in-app; algunos pueden ser recordatorios ya vencidos — no conviene mandar "tu viaje es mañana" de un viaje que ya pasó). El cap 30/24h + ventana hábil + jitter amortiguan, pero conviene depurar los stale primero.

> Handoff para continuar en otra sesión. Última actualización: sesión del 2026-07-22/23.

## Qué es
Auto-envío de los recordatorios de Ketzal (`ketzal.clawbot_reminders`) por WhatsApp
**sin API oficial**, con Baileys + PM2 en una box. Patrón reusado de
`gorilla-labs-openclaw`. Número **dedicado** Ketzal. Detalle en `README.md` y en el
plan `~/.claude/plans/imperative-jumping-moon.md`.

## ✅ Hecho (en prod / commiteado)
- **BD Supabase** (proyecto `wnujoyzdpdyxblgdtxjw`, **en el ledger** desde 2026-07-23 — migración
  `ketzal_wa_autosend` — + espejo `db/proposed/016_wa_autosend.sql`):
  - `clawbot_claim_pendientes(limit)` — claim atómico `FOR UPDATE SKIP LOCKED` → `enviando`,
    **solo kinds al comprador**: `abono_por_vencer, abono_vencido, viaje_proximo, cotizacion_seguimiento,
    saldo_sin_plan` (este último agregado 2026-07-23, F7).
  - `clawbot_marcar_bot(id, status)` — marca `enviado`/`error`/`descartado`/`pendiente`.
  - Tabla `wa_optout(phone)` · `app_settings.wa_auto_enabled` (gate, **OFF**) + `wa_daily_cap` (30).
  - `clawbot_reminders.status` admite `enviando` + `error`.
- **Código** en repo (`wa-sender/`), commit en `main` (pusheado): `bridge.mjs` (incl. **matcher de
  opt-out entrante STOP/BAJA → `wa_optout`**), `poller.mjs`, `package.json`, `.env.example`,
  `ecosystem.config.cjs`, `README.md`. Excluido de Vercel (`.vercelignore`).
- **Box** = `clawbot`/`orion` (mismo host `ubuntu-2cpu-4gb-us-sjo1`, node v20.20.2, pm2 6.0.14):
  - Código copiado a **`/opt/ketzal-wa-sender/`** (scp; la box NO tiene git-access al repo Ketzal).
  - `npm install` hecho (195 paquetes, baileys resuelve).
  - Auth dir creado: **`/opt/ketzal-wa-session/`** (chmod 700).
  - `.env` creado (chmod 600): `SUPABASE_URL`, `KETZAL_WA_TOKEN` (generado), `KETZAL_WA_PORT=3101`,
    `KETZAL_WA_URL=http://127.0.0.1:3101`, `KETZAL_WA_AUTH_DIR=/opt/ketzal-wa-session/baileys-state`.

## ⏳ Pendiente (retomar exactamente aquí)

### Checkpoint 1 — service role key (falta) 🔴
`.env` en la box tiene `SUPABASE_SERVICE_ROLE_KEY=` **vacío**. El usuario debe pegarlo a mano
(Supabase → Project Settings → API → `service_role`):
```bash
ssh clawbot ; nano /opt/ketzal-wa-sender/.env   # pega en SUPABASE_SERVICE_ROLE_KEY=
```

### Paso 4 — arrancar bridge + parear QR
```bash
ssh clawbot 'cd /opt/ketzal-wa-sender && pm2 start ecosystem.config.cjs'
ssh clawbot 'pm2 logs ketzal-wa-bridge --lines 40 --nostream'   # muestra el QR
```
**Checkpoint 2:** escanear el QR con el WhatsApp del **número dedicado** (warmearlo antes).

### Paso 5 — verificar sesión
```bash
ssh clawbot 'source /opt/ketzal-wa-sender/.env 2>/dev/null; curl -s -H "Authorization: Bearer $KETZAL_WA_TOKEN" 127.0.0.1:3101/health'
# espera {"ok":true,"session_state":"CONNECTED",...}
```

### Paso 6 — prueba SIN spamear
```bash
ssh clawbot 'cd /opt/ketzal-wa-sender && node poller.mjs --dry-run'                    # lista, no manda
ssh clawbot 'cd /opt/ketzal-wa-sender && node poller.mjs --test-phone <MI_NUMERO> --force'  # todo a mi tel
```

### Paso 7 — prender producción (cuando el usuario decida)
```sql
update ketzal.app_settings set wa_auto_enabled = true where id = 1;   -- gate ON
```
El cron PM2 (`*/30 9-18 * * 1-5`) ya corre el poller; con el gate ON envía en horario hábil.
Luego `pm2 save` en la box.

## Follow-ups
- ✅ **`saldo_sin_plan`** (2026-07-23): agregado al allowlist de `clawbot_claim_pendientes` (BD + espejo
  + DRY-RUN del poller). Los otros 2 de F7 (`viaje_manana_operativo`, `pago_sin_recibo`) son **internos**,
  se quedan fuera a propósito.
- ✅ **Inbound STOP/BAJA → `wa_optout` automático** (2026-07-23): matcher en `bridge.mjs`
  (`messages.upsert`, solo 1-a-1, mensaje = `STOP|BAJA|ALTO|CANCELAR|UNSUBSCRIBE|NO MORE`), guarda el
  teléfono a 10 dígitos vía service-role. Best-effort: sin `SERVICE_ROLE_KEY` en la box es no-op y el
  bridge sigue enviando. **Toma efecto al reiniciar el bridge en la box tras pegar el service key.**
- Opt-out manual mientras tanto: `insert into ketzal.wa_optout(phone,reason) values ('55...','STOP');`

## Notas de riesgo
- Envío no-oficial = **riesgo de ban** del número. Número dedicado + warmeado + cap + jitter + gate.
- La box es compartida con Gorilla (prometheus/orion). El bridge Ketzal es proceso PM2 aparte,
  puerto 3101 loopback, número/ sesión propios (aislado del número de Gorilla).
