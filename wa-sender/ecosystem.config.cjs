// PM2 — 2 procesos en la box para el auto-envío de WhatsApp de Ketzal.
//   pm2 start ecosystem.config.cjs
//   pm2 logs ketzal-wa-bridge     # ver QR de pareo la primera vez
module.exports = {
  apps: [
    {
      // Bridge Baileys: socket WhatsApp persistente (número dedicado Ketzal).
      name: 'ketzal-wa-bridge',
      script: 'bridge.mjs',
      max_memory_restart: '512M',
      autorestart: true,
      env: { NODE_ENV: 'production' },
    },
    {
      // Poller del outbox: corre en horario hábil MX y sale (no daemon).
      // El gate app_settings.wa_auto_enabled decide si realmente manda.
      name: 'ketzal-wa-poller',
      script: 'poller.mjs',
      // OJO: el cron de PM2 usa la hora del SERVIDOR, que está en UTC, mientras
      // que el poller sólo envía dentro del horario hábil de MÉXICO (UTC-6).
      // Con `9-18` el cron corría 03:00-12:30 MX y la intersección con la
      // ventana hábil dejaba sólo 09:00-12:30: un tercio de lo previsto, y todo
      // lo encolado por la tarde esperaba al día siguiente.
      // 15-23 UTC = 09:00-17:30 MX, que es la ventana que el poller acepta.
      cron_restart: '*/30 15-23 * * 1-5',
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
  ],
}
