# ketzal-wa-sender

Auto-envío de los recordatorios de Ketzal por **WhatsApp** (Baileys, sin API
oficial). Vive **en la box** (no en Vercel — Vercel no puede sostener el socket
WA). Mismo patrón probado que `gorilla-labs-openclaw`, con **número dedicado
Ketzal**.

```
Vercel Cron → /api/clawbot/tick → ketzal.clawbot_reminders (status 'pendiente')
                                            │ Supabase
   box:  ketzal-wa-poller ──claim──► clawbot_claim_pendientes
            │  POST /send (loopback)
            ▼
         ketzal-wa-bridge (Baileys, número Ketzal) ──► WhatsApp del comprador
            │  marca 'enviado' vía clawbot_marcar_bot
```

- **bridge.mjs** — micro-servicio loopback (`127.0.0.1:3101`, bearer). Sostiene
  el socket Baileys, `POST /send { phone, message }`. Auth persistida en disco.
- **poller.mjs** — lee el outbox, respeta gate + ventana hábil + cap + blocklist,
  llama al bridge con jitter, marca el resultado.
- **BD** (ya aplicada, espejo en `../db/proposed/016_wa_autosend.sql`):
  `clawbot_claim_pendientes`, `clawbot_marcar_bot`, `wa_optout`,
  `app_settings.wa_auto_enabled` / `wa_daily_cap`.

## Setup en la box (una vez)

```bash
# 1. Copiar esta carpeta a la box y instalar
cd /opt && git clone <repo> ketzal-app   # o rsync la carpeta wa-sender/
cd /opt/ketzal-app/wa-sender && npm install

# 2. Configurar
cp .env.example .env && nano .env         # SERVICE_ROLE_KEY + KETZAL_WA_TOKEN
mkdir -p /opt/ketzal-wa-session && chmod 700 /opt/ketzal-wa-session

# 3. Firewall: puerto solo loopback (como el 3100 de Gorilla)
ufw deny 3101

# 4. Arrancar + parear el NÚMERO DEDICADO (escanea el QR de los logs)
pm2 start ecosystem.config.cjs
pm2 logs ketzal-wa-bridge                 # muestra el QR — escanéalo con el WhatsApp de Ketzal
curl -s -H "Authorization: Bearer $KETZAL_WA_TOKEN" 127.0.0.1:3101/health   # {"ok":true,...} cuando conecte
pm2 save
```

> ⚠️ **Warmear el número** antes de automatizar (úsalo normal unos días). El
> envío no-oficial puede llevar a **ban** — número dedicado, volumen bajo, cap.

## Probar (sin spamear compradores)

```bash
node poller.mjs --dry-run                      # lista qué mandaría (no toca nada)
node poller.mjs --test-phone <TU_NÚMERO> --force  # manda TODO a tu teléfono
```

## Prender en producción

El gate está **apagado** por default. Cuando estés listo:

```sql
-- en Supabase (superadmin):
update ketzal.app_settings set wa_auto_enabled = true where id = 1;
-- tope diario (opcional):
update ketzal.app_settings set wa_daily_cap = 30 where id = 1;
```

El cron PM2 (`*/30 9-18 * * 1-5`) corre el poller; con el gate prendido envía en
horario hábil MX, con jitter 60-180s, respetando el cap y la blocklist.

## Opt-out

```sql
insert into ketzal.wa_optout(phone, reason) values ('5561234567', 'STOP');
```

**Pendiente (follow-up):** matcher de inbound STOP/BAJA → alta automática en
`wa_optout` (openclaw ya lo tiene; portarlo al bridge de Ketzal).

## Anti-ban (resumen)

Número dedicado y warmeado · gate off por default · ventana hábil · cap diario ·
jitter 60-180s · human-delay 3-7s en el bridge · dedupe del outbox (`dedupe_key`)
· solo kinds al comprador · blocklist.
