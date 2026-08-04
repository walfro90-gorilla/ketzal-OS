// Service worker de Ketzal OS (b036): recibe Web Push y muestra la
// notificación aunque la app esté cerrada (PWA instalada en PC/móvil).
// Sin caching offline a propósito — solo push (YAGNI hasta necesitarlo).

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Ketzal', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Ketzal'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon',
      badge: '/icon',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(url)
          return w.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
