// Etiquetas de dominio de ventas (tipos de línea y de pasajero). Solo las usan
// las pantallas de ventas. Los helpers compartidos cross-feature (mxn,
// formatTravelDate, StatusBadge, BookingStatus) viven en components/data
// (@/components/data/format y @/components/data/status-badge).

export const ITEM_TYPE_LABELS: Record<string, string> = {
  passenger: 'Pasajero',
  room: 'Habitación',
  addon: 'Add-on',
  custom: 'Personalizado',
}

export const PASSENGER_TYPE_LABELS: Record<string, string> = {
  adult: 'Adulto',
  child: 'Niño',
  inapam: 'INAPAM',
}
