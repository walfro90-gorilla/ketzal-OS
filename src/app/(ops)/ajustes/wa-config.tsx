'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BotIcon, MessageCircleIcon, RefreshCwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  comandoWhatsApp,
  estadoWhatsApp,
  generarRecordatorios,
  guardarEnvioAuto,
  type EstadoWa,
} from './wa-actions'

// Conexión del número de WhatsApp + arranque de Clawbot. Vive en /ajustes porque
// es plataforma, no agencia: hay UN número dedicado para todo Ketzal.
//
// El QR de Baileys rota cada ~20 s, así que mientras no hay sesión se relee cada
// 4 s; ya conectado basta cada 30. Se deja de sondear con la pestaña oculta:
// nadie está viendo y el QR se regenera igual cuando vuelva.
const CADA_ESPERANDO = 4000
const CADA_CONECTADO = 30000

const ETIQUETA: Record<EstadoWa['estado'], { texto: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  CONNECTED: { texto: 'Conectado', variant: 'success' },
  UNPAIRED: { texto: 'Esperando que escanees', variant: 'warning' },
  STARTING: { texto: 'Conectando…', variant: 'secondary' },
  STOPPED: { texto: 'Detenido', variant: 'destructive' },
  DESCONOCIDO: { texto: 'Sin reportar', variant: 'secondary' },
}

const hace = (iso: string | null) => {
  if (!iso) return 'nunca'
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seg < 60) return `hace ${seg} s`
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`
  return `hace ${Math.round(seg / 3600)} h`
}

export function WaConfig({ inicial }: { inicial: EstadoWa }) {
  const [wa, setWa] = useState(inicial)
  const [pendiente, start] = useTransition()
  const [confirmando, setConfirmando] = useState<'prender' | 'logout' | null>(null)
  const [tope, setTope] = useState(String(inicial.topeDiario))

  const refrescar = useCallback(async () => {
    const res = await estadoWhatsApp()
    if (!('error' in res)) setWa(res)
  }, [])

  useEffect(() => {
    if (document.visibilityState === 'hidden') return
    const cada = wa.estado === 'CONNECTED' ? CADA_CONECTADO : CADA_ESPERANDO
    const t = setInterval(refrescar, cada)
    return () => clearInterval(t)
  }, [wa.estado, wa.qr, refrescar])

  function correr(fn: () => Promise<{ error: string } | object>, exito: string) {
    start(async () => {
      const res = await fn()
      if ('error' in res) toast.error((res as { error: string }).error)
      else toast.success(exito)
      await refrescar()
    })
  }

  const etiqueta = ETIQUETA[wa.estado]

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleIcon className="size-4 text-muted-foreground" />
            Número de WhatsApp
          </CardTitle>
          <CardDescription>
            El número dedicado con el que Ketzal manda los recordatorios. Se liga
            escaneando un QR desde <strong>WhatsApp Business</strong> en el
            teléfono de ese número: Ajustes → Dispositivos vinculados → Vincular
            un dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={etiqueta.variant}>{etiqueta.texto}</Badge>
            {wa.numero && <span className="text-sm">+{wa.numero}</span>}
            <Badge variant={wa.viva ? 'outline' : 'destructive'}>
              {wa.viva ? `Servidor activo · ${hace(wa.ultimoLatido)}` : 'Servidor sin señal'}
            </Badge>
            {wa.comandoPendiente && (
              <Badge variant="secondary">Orden en camino: {wa.comandoPendiente}</Badge>
            )}
          </div>

          {!wa.viva && (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              El servidor de WhatsApp no está reportando. Corre en una máquina
              aparte (no en Vercel): arráncalo con <code>pm2 start</code> y vuelve
              aquí. Mientras no reporte, ningún botón de esta tarjeta tiene efecto.
            </p>
          )}

          {wa.qr && (
            <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
              {/* El QR cambia cada ~20 s; la vista se refresca sola. Mismo
                  patrón que el QR del voucher: <img> plano para un data URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wa.qr}
                alt="Código QR para vincular WhatsApp"
                width={280}
                height={280}
                className="rounded-lg bg-white p-2"
              />
              <p className="text-center text-xs text-muted-foreground">
                Escanéalo con el WhatsApp del número de Ketzal. Se renueva solo
                cada pocos segundos.
              </p>
            </div>
          )}

          {wa.nota && (
            <p className="text-xs text-muted-foreground">Último aviso: {wa.nota}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pendiente}
              onClick={() => correr(() => comandoWhatsApp('restart'), 'Pedido enviado al servidor')}
            >
              <RefreshCwIcon className="size-4" />
              {wa.estado === 'CONNECTED' ? 'Reconectar' : 'Generar QR'}
            </Button>

            {wa.estado === 'CONNECTED' &&
              (confirmando === 'logout' ? (
                <span className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-sm">
                  ¿Desligar +{wa.numero}? Habrá que escanear de nuevo.
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pendiente}
                    onClick={() => {
                      setConfirmando(null)
                      correr(() => comandoWhatsApp('logout'), 'Teléfono desligado')
                    }}
                  >
                    Desligar
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(null)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button type="button" variant="outline" onClick={() => setConfirmando('logout')}>
                  Desligar el teléfono
                </Button>
              ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BotIcon className="size-4 text-muted-foreground" />
            Envío automático de Clawbot
          </CardTitle>
          <CardDescription>
            Con esto apagado, los recordatorios se quedan en la bandeja de{' '}
            <code>/clawbot</code> y cada agente los manda con un clic. Prendido,
            el servidor los envía solo en horario hábil, respetando el tope diario
            y las bajas (quien contesta STOP o BAJA deja de recibir).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {wa.envioAuto ? 'Enviando automáticamente' : 'Apagado'}
              </p>
              <p className="text-xs text-muted-foreground">
                {wa.enEspera === 0
                  ? 'No hay recordatorios esperando.'
                  : `${wa.enEspera} recordatorio(s) esperando salir.`}
              </p>
            </div>
            <Switch
              checked={wa.envioAuto}
              disabled={pendiente}
              aria-label={wa.envioAuto ? 'Apagar el envío automático' : 'Prender el envío automático'}
              onCheckedChange={(on) => {
                // Prenderlo manda mensajes reales a clientes reales: se confirma.
                if (on) setConfirmando('prender')
                else correr(() => guardarEnvioAuto(false, Number(tope)), 'Envío automático apagado')
              }}
            />
          </div>

          {confirmando === 'prender' && (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p>
                Al prenderlo, el servidor va a mandar WhatsApps <strong>reales</strong>{' '}
                a clientes reales
                {wa.enEspera > 0 ? `, empezando por los ${wa.enEspera} que están esperando` : ''}
                . Revisa la bandeja de <code>/clawbot</code> antes si no estás seguro.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pendiente}
                  onClick={() => {
                    setConfirmando(null)
                    correr(() => guardarEnvioAuto(true, Number(tope)), 'Envío automático encendido')
                  }}
                >
                  Sí, prender
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="wa-tope">Tope de mensajes por día</Label>
            <div className="flex gap-2">
              <Input
                id="wa-tope"
                type="number"
                min={0}
                max={2000}
                value={tope}
                onChange={(e) => setTope(e.target.value)}
                className="max-w-32"
              />
              <Button
                type="button"
                variant="outline"
                disabled={pendiente || String(wa.topeDiario) === tope}
                onClick={() => correr(() => guardarEnvioAuto(wa.envioAuto, Number(tope)), 'Tope guardado')}
              >
                Guardar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Freno anti-baneo: WhatsApp castiga a un número que manda de más.
            </p>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium">Llenar la bandeja ahora</p>
            <p className="mt-1 mb-2 text-xs text-muted-foreground">
              Es lo que hace el cron a diario: revisa abonos por vencer, viajes
              próximos y cotizaciones sin cerrar, y arma los recordatorios que
              tocan. Correrlo dos veces no duplica nada.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={pendiente}
              onClick={() =>
                start(async () => {
                  const res = await generarRecordatorios()
                  if ('error' in res) toast.error(res.error)
                  else
                    toast.success(
                      `Motor: ${res.motor} · reglas operativas: ${res.operativas}`
                    )
                  await refrescar()
                })
              }
            >
              Generar recordatorios
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
