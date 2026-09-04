// Contenido del tour de onboarding de Ketzal OS. Data pura (server-safe): el
// componente <ProductTour> la consume. Cada paso puede acotarse por rol para que
// el agente no vea secciones de admin. Reutiliza los mismos íconos del nav.
import type { ComponentType } from 'react'
import {
  SparklesIcon,
  LayoutDashboardIcon,
  BanknoteIcon,
  FileTextIcon,
  HandCoinsIcon,
  BotIcon,
  BusIcon,
  MapPinIcon,
  ReceiptTextIcon,
  ChartColumnIcon,
  UsersRoundIcon,
  ShieldCheckIcon,
  RocketIcon,
} from 'lucide-react'
import { isAdminRole } from '@/lib/access'

export type TourStep = {
  id: string
  title: string
  body: string
  icon: ComponentType<{ className?: string }>
  /** Enlace opcional "Ir a …" (cierra el tour y navega). */
  href?: string
  /** Etiqueta del enlace (nombre de la sección). */
  label?: string
  adminOnly?: boolean
  superadminOnly?: boolean
  /**
   * Solo para quien pertenece a una agencia (`profiles.supplier_id`). El
   * superadmin pasa `adminOnly` pero no tiene agencia propia, así que la
   * tarjeta del Panel de la que habla este paso no existe para él.
   */
  conAgencia?: boolean
}

const STEPS: TourStep[] = [
  {
    id: 'bienvenida',
    icon: SparklesIcon,
    title: 'Bienvenido a Ketzal OS',
    body: 'Es el back-office para vender tours: cierras la venta, controlas los abonos y emites el recibo — todo por agencia y aislado. Este tour te muestra las secciones clave en un minuto.',
  },
  {
    id: 'panel',
    icon: LayoutDashboardIcon,
    title: 'Panel',
    body: 'Tu tablero del día: dinero del mes, próximos viajes y una lista de "Requiere atención" con lo que urge. Es tu punto de partida cada mañana.',
    href: '/dashboard',
    label: 'Panel',
  },
  {
    id: 'ventas',
    icon: BanknoteIcon,
    title: 'Ventas — el corazón',
    body: 'Una venta lleva líneas (opciones × cantidad). Registras abonos y el saldo se calcula solo (total − pagos + reembolsos): nunca lo capturas a mano. Cada abono genera su recibo foliado.',
    href: '/ventas',
    label: 'Ventas',
  },
  {
    id: 'cotizaciones',
    icon: FileTextIcon,
    title: 'Cotizaciones',
    body: 'Arma una cotización con folio COT-n y compártela por link público. Cuando el cliente dice que sí, la conviertes en venta y conserva su mismo folio.',
    href: '/cotizaciones',
    label: 'Cotizaciones',
  },
  {
    id: 'cobranza',
    icon: HandCoinsIcon,
    title: 'Cobranza',
    body: 'A quién cobrar y quién va atrasado, cruzando el plan de pagos con los abonos reales. Para no perder ningún saldo pendiente.',
    href: '/cobranza',
    label: 'Cobranza',
  },
  {
    id: 'clawbot',
    icon: BotIcon,
    title: 'Clawbot',
    body: 'Recordatorios automáticos (abono por vencer, viaje próximo, cotización sin cerrar). Los envías al cliente por WhatsApp con un solo clic.',
    href: '/clawbot',
    label: 'Clawbot',
  },
  {
    id: 'salidas',
    icon: BusIcon,
    title: 'Salidas y manifiesto',
    body: 'Cada salida junta a todos los pasajeros del camión. Capturas los pasajeros en la venta y sacas el manifiesto (pase de abordar) para el día del viaje.',
    href: '/salidas',
    label: 'Salidas',
  },
  {
    id: 'servicios',
    icon: MapPinIcon,
    title: 'Servicios (catálogo)',
    body: 'El catálogo de viajes. Cada servicio lleva opciones (tipos de pasajero, habitación, add-ons). Publícalo para que aparezca en la vitrina pública.',
    href: '/servicios',
    label: 'Servicios',
    adminOnly: true,
  },
  {
    id: 'gastos',
    icon: ReceiptTextIcon,
    title: 'Gastos y utilidad',
    body: 'Registra egresos para ver tu utilidad real (vendido − gastos) y lo que le debes a las agencias mayoristas (cuentas por pagar). Es un ledger: las correcciones son contra-asientos.',
    href: '/gastos',
    label: 'Gastos',
    adminOnly: true,
  },
  {
    id: 'reportes',
    icon: ChartColumnIcon,
    title: 'Reportes',
    body: 'Gráficas de ventas por agente, servicio y mes; metas del equipo, conversión cotización→venta, y exportación a CSV.',
    href: '/reportes',
    label: 'Reportes',
    adminOnly: true,
  },
  {
    id: 'equipo',
    icon: UsersRoundIcon,
    title: 'Equipo y agencias',
    body: 'Invita agentes por correo y define sus roles; cada quien ve solo lo de su agencia. El superadmin crea agencias completas aquí. Ojo: la invitación no manda correo — avísale a la persona que entre con su correo.',
    href: '/equipo',
    label: 'Equipo',
    adminOnly: true,
  },
  {
    id: 'confianza',
    icon: ShieldCheckIcon,
    title: 'Tu dinero, a salvo',
    body: 'El registro de pagos es a prueba de manipulación: las correcciones son reembolsos, no borrados, y los folios de recibo son atómicos por agencia. Nada se pierde ni se duplica.',
  },
  // b064 — Cierre del tour: lo entrega al checklist del Panel. El tour explica
  // QUÉ es cada sección (y se ve una sola vez); el checklist dice QUÉ FALTA y
  // vive en el Panel hasta que la agencia queda lista. De ahí en adelante, la
  // guía es el checklist, no este tour.
  // Antes decía "si tu agencia es nueva" porque `adminOnly` también alcanza al
  // superadmin, que no tiene agencia y no ve la tarjeta. Con `conAgencia` el
  // paso solo le sale a quien SÍ la tiene, así que ya puede hablar en directo:
  // un tour que duda de lo que muestra enseña menos.
  {
    id: 'primeros-pasos',
    icon: RocketIcon,
    title: 'Empieza por aquí',
    body: 'En el Panel te espera "Primeros pasos": la lista de lo que falta para poder vender —cargar tu catálogo, invitar a tu equipo, poner tu CLABE— con un botón para resolver cada cosa. Se va tachando sola conforme avanzas y desaparece al terminar. Este tour puedes reabrirlo cuando quieras con el botón "?" de arriba.',
    href: '/dashboard',
    label: 'Panel',
    adminOnly: true,
    conAgencia: true,
  },
  {
    id: 'embajadores',
    icon: UsersRoundIcon,
    title: 'Embajadores',
    body: 'Gente de fuera que comparte tus viajes y gana por cada venta que trae. Los das de alta en Comisiones con su correo, les fijas la tarifa y les mandas su acceso por WhatsApp. Ojo: sin tarifa configurada no cobran nada, aunque vendan.',
    href: '/comisiones',
    label: 'Comisiones',
    adminOnly: true,
  },
]

/**
 * Pasos visibles según el rol (oculta los de admin a los agentes) y según si la
 * persona tiene agencia (oculta al superadmin lo que solo existe dentro de una).
 */
export function getTourSteps(role?: string | null, tieneAgencia = false): TourStep[] {
  return STEPS.filter((s) => {
    if (s.superadminOnly && role !== 'superadmin') return false
    if (s.conAgencia && !tieneAgencia) return false
    return !s.adminOnly || isAdminRole(role)
  })
}
