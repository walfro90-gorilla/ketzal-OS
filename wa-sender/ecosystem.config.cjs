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
      cron_restart: '*/30 9-18 * * 1-5', // cada 30 min, L-V 9-18 (hora del server)
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
  ],
}
