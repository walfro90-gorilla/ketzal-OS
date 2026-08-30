// Pasos del tour para el EMBAJADOR y el VIAJERO. Los del back-office viven en
// `tour-steps.ts` (agentes y admins). Data pura, server-safe: la consume
// <ProductTour>.
//
// Regla de oro del copy: quien lo lee acaba de entrar por primera vez y no
// conoce el vocabulario del sistema. Nada de "payee", "basis" ni "atribución" —
// se dice qué gana, cuándo y qué tiene que hacer.
import {
  SparklesIcon,
  ShareIcon,
  CoinsIcon,
  ChartColumnIcon,
  TicketIcon,
  WalletIcon,
  QrCodeIcon,
} from 'lucide-react'
import type { TourStep } from './tour-steps'

export const EMBAJADOR_STEPS: TourStep[] = [
  {
    id: 'emb-bienvenida',
    icon: SparklesIcon,
    title: 'Bienvenido, embajador',
    body: 'Tú compartes viajes con tu gente y ganas por cada venta que traigas. No vendes tú: solo compartes tu link, la agencia cierra y cobra. En un minuto te enseño cómo.',
  },
  {
    id: 'emb-link',
    icon: ShareIcon,
    title: 'Tu link es tu herramienta',
    body: 'Todo empieza con tu link de referido. Cualquiera que entre por ahí y compre cuenta como tuyo — aunque tarde días en decidirse, y sea el viaje de la agencia que sea. Compártelo por WhatsApp, en tus historias, donde esté tu gente.',
  },
  {
    id: 'emb-ganas',
    icon: CoinsIcon,
    title: 'Cuánto ganas',
    body: 'Arriba, en “Cómo ganas”, ves cuánto pagas cada agencia: cada una pone su tarifa y tú cobras la de la agencia dueña del viaje que traigas. Se te abona cuando la venta se cierra, no cuando la persona da clic.',
  },
  {
    id: 'emb-ventas',
    icon: ChartColumnIcon,
    title: 'Tus ventas y tu saldo',
    body: 'Aquí ves cada venta que trajiste y tres números: lo ganado, lo que ya te pagaron y lo que falta por cobrar. Te paga la agencia dueña de cada viaje, y ella te dice cuándo corta.',
  },
]

export const VIAJERO_STEPS: TourStep[] = [
  {
    id: 'via-bienvenida',
    icon: SparklesIcon,
    title: 'Bienvenido a Ketzal',
    body: 'Aquí encuentras viajes de agencias locales de Juárez y alrededores. Apartas tu lugar con un anticipo y pagas el resto en abonos antes de la salida.',
  },
  {
    id: 'via-apartar',
    icon: TicketIcon,
    title: 'Aparta con el mínimo',
    body: 'No necesitas pagar todo de una vez: reservas con el anticipo y aseguras tu lugar. Antes de confirmar te mostramos la política de cancelación — léela, ahí dice qué pasa si algo cambia.',
    href: '/explora',
    label: 'Explora',
  },
  {
    id: 'via-abonos',
    icon: WalletIcon,
    title: 'Tus abonos y recibos',
    body: 'En “Mis compras” ves cuánto llevas pagado y cuánto falta. Cada abono genera su recibo, y el saldo se calcula solo: nunca tienes que sacar cuentas a mano.',
    href: '/mis-compras',
    label: 'Mis compras',
  },
  {
    id: 'via-voucher',
    icon: QrCodeIcon,
    title: 'Tu pase para el viaje',
    body: 'Cuando liquidas, recibes tu voucher con código QR. Es lo que te escanean al abordar — guárdalo en tu teléfono o descárgalo; funciona sin internet.',
  },
]
