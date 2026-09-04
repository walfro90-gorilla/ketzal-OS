'use client'

/**
 * El asistente del OS: chat flotante sobre las herramientas del MCP.
 *
 * Solo lo monta el shell para superadmin (ADR-0044). Sin estado en el servidor:
 * `mensajes` es la conversación en formato OpenAI que devuelve `/api/agente` en
 * cada evento `fin`; se guarda en `localStorage` (ver `lib/agente/historial.ts`)
 * para poder releer lo ya trabajado después de cerrar la pestaña.
 * Una operación de dinero llega como tarjeta `confirmar`: la persona la aprueba
 * con un clic (se re-manda con `aprobados`) o la cancela (se inserta el mensaje
 * `tool` de cancelación y el modelo solo contesta).
 */
import { useEffect, useRef, useState } from 'react'
import { SparklesIcon, SendIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Evento } from '@/lib/agente/conversacion'
import { CLAVE, desempacar, empacar, etiquetaDeFecha } from '@/lib/agente/historial'
import type { Mensaje } from '@/lib/agente/llm'
import { cn } from '@/lib/utils'

type Item =
  | { k: 'user'; texto: string }
  | { k: 'asistente'; texto: string }
  | { k: 'tool'; id: string; titulo: string; args: Record<string, unknown>; estado: 'corriendo' | 'ok' | 'error'; resumen?: string }
  | { k: 'confirmar'; id: string; titulo: string; herramienta: string; args: Record<string, unknown>; resuelto?: 'si' | 'no' }
  | { k: 'error'; texto: string }

const CANCELADO = 'La persona canceló esta operación. No la repitas a menos que lo pida.'

/** Un navegador puede tener el almacenamiento bloqueado: eso no tumba el chat. */
function leerGuardado() {
  try {
    return desempacar<Item>(localStorage.getItem(CLAVE))
  } catch {
    return null
  }
}

export function Agente() {
  const [abierto, setAbierto] = useState(false)
  // Inicializador perezoso: el Sheet cerrado no pinta nada en SSR, así que
  // leer el almacenamiento aquí no desincroniza la hidratación.
  const [items, setItems] = useState<Item[]>(() => leerGuardado()?.items ?? [])
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => leerGuardado()?.mensajes ?? [])
  // Cuándo se guardó el hilo que se está viendo. Sirve para avisar que sus
  // montos son de otro día; se limpia en cuanto la persona escribe algo nuevo.
  const [guardadoEn, setGuardadoEn] = useState<number>(() => leerGuardado()?.guardadoEn ?? 0)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, empacar(items, mensajes))
    } catch {}
  }, [items, mensajes])
  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ block: 'end' })
  }, [items, abierto])

  const agregar = (it: Item) => setItems((xs) => [...xs, it])
  const actualizar = (id: string, patch: Partial<Item>) =>
    setItems((xs) => xs.map((it) => ('id' in it && it.id === id ? ({ ...it, ...patch } as Item) : it)))

  async function pedir(historial: Mensaje[], aprobados: string[] = []) {
    setOcupado(true)
    // Si el servidor no llega a `fin`, el historial mandado se conserva tal cual:
    // la persona puede pedir "intenta de nuevo" sin perder lo dicho.
    setMensajes(historial)
    try {
      const r = await fetch('/api/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: historial, aprobados }),
      })
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => null)
        agregar({ k: 'error', texto: j?.error ?? `El asistente no respondió (HTTP ${r.status}).` })
        return
      }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) {
          const linea = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          if (linea) manejar(JSON.parse(linea) as Evento)
        }
      }
    } catch {
      agregar({ k: 'error', texto: 'Se perdió la conexión con el asistente.' })
    } finally {
      setOcupado(false)
    }
  }

  function manejar(e: Evento) {
    switch (e.tipo) {
      case 'texto':
        return agregar({ k: 'asistente', texto: e.texto })
      case 'tool':
        return agregar({ k: 'tool', id: e.id, titulo: e.titulo, args: e.args, estado: 'corriendo' })
      case 'resultado':
        return actualizar(e.id, { estado: e.ok ? 'ok' : 'error', resumen: e.resumen })
      case 'confirmar':
        return agregar({ k: 'confirmar', id: e.id, titulo: e.titulo, herramienta: e.herramienta, args: e.args })
      case 'error':
        return agregar({ k: 'error', texto: e.texto })
      case 'fin':
        return setMensajes(e.mensajes)
    }
  }

  function enviar() {
    const t = texto.trim()
    if (!t || ocupado) return
    setTexto('')
    setGuardadoEn(0)
    agregar({ k: 'user', texto: t })
    void pedir([...mensajes, { role: 'user', content: t }])
  }

  function resolver(id: string, ok: boolean) {
    actualizar(id, { resuelto: ok ? 'si' : 'no' })
    if (ok) void pedir(mensajes, [id])
    else void pedir([...mensajes, { role: 'tool', tool_call_id: id, content: CANCELADO }])
  }

  function limpiar() {
    setItems([])
    setMensajes([])
    setGuardadoEn(0)
  }

  const pendiente = items.some((it) => it.k === 'confirmar' && !it.resuelto)
  const aviso = etiquetaDeFecha(guardadoEn)

  return (
    <>
      <Button
        type="button"
        size="icon"
        aria-label="Abrir asistente"
        onClick={() => setAbierto(true)}
        className="fixed right-4 bottom-20 z-40 size-12 rounded-full shadow-lg md:bottom-6"
      >
        <SparklesIcon className="size-5" />
      </Button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full sm:max-w-md">
          <SheetHeader className="border-b">
            <div className="flex items-center justify-between gap-2 pr-8">
              <SheetTitle className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-primary" /> Asistente
              </SheetTitle>
              {items.length > 0 && (
                <Button type="button" variant="ghost" size="xs" onClick={limpiar} disabled={ocupado}>
                  <Trash2Icon data-icon="inline-start" /> Nueva
                </Button>
              )}
            </div>
            <SheetDescription>
              Opera Ketzal OS en tus palabras. Lo que mueve dinero te lo pide confirmar.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {items.length > 0 && aviso && (
              <p className="rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
                {aviso}
              </p>
            )}
            {items.length === 0 && (
              <p className="text-muted-foreground">
                Prueba: &ldquo;¿qué quedó por cobrar esta semana?&rdquo;, &ldquo;dame las salidas de
                octubre&rdquo; o &ldquo;registra un abono de 500 a la venta de Juan&rdquo;.
              </p>
            )}
            {items.map((it, i) => (
              <Burbuja key={i} it={it} onResolver={resolver} ocupado={ocupado} />
            ))}
            {ocupado && <p className="animate-pulse text-xs text-muted-foreground">Pensando…</p>}
            <div ref={finRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault()
              enviar()
            }}
          >
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviar()
                }
              }}
              placeholder={pendiente ? 'Resuelve la tarjeta de arriba…' : 'Escribe o dicta…'}
              rows={2}
              disabled={ocupado || pendiente}
              className="min-h-0 resize-none"
              aria-label="Mensaje para el asistente"
            />
            <Button type="submit" size="icon" aria-label="Enviar" disabled={ocupado || pendiente || !texto.trim()}>
              <SendIcon className="size-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * Pinta `**así**` en negritas. El prompt pide texto plano y los modelos igual
 * meten markdown; insistirle al modelo es menos confiable que renderizarlo.
 * Solo negritas a propósito: es lo único que sale en la práctica.
 */
function ConNegritas({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/\*\*(.+?)\*\*/g).map((parte, i) =>
        i % 2 ? <strong key={i}>{parte}</strong> : parte,
      )}
    </>
  )
}

function Args({ args }: { args: Record<string, unknown> }) {
  const pares = Object.entries(args).filter(([k]) => k !== 'confirmar')
  if (!pares.length) return null
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
      {pares.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-all">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

function Burbuja({
  it,
  onResolver,
  ocupado,
}: {
  it: Item
  onResolver: (id: string, ok: boolean) => void
  ocupado: boolean
}) {
  switch (it.k) {
    case 'user':
      return (
        <p className="ml-8 whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">
          {it.texto}
        </p>
      )
    case 'asistente':
      return (
        <p className="mr-8 whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
          <ConNegritas texto={it.texto} />
        </p>
      )
    case 'error':
      return <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">{it.texto}</p>
    case 'tool':
      return (
        <details className="rounded-lg border px-3 py-1.5 text-xs">
          <summary className="cursor-pointer select-none">
            <span
              className={cn(
                'mr-1.5 inline-block size-2 rounded-full',
                it.estado === 'corriendo' && 'animate-pulse bg-amber-500',
                it.estado === 'ok' && 'bg-emerald-500',
                it.estado === 'error' && 'bg-destructive',
              )}
            />
            {it.titulo}
          </summary>
          <Args args={it.args} />
          {it.resumen && <p className="mt-1 break-all text-muted-foreground">{it.resumen}</p>}
        </details>
      )
    case 'confirmar':
      return (
        <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 px-3 py-2">
          <p className="font-medium">{it.titulo}</p>
          <Args args={it.args} />
          {it.resuelto ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {it.resuelto === 'si' ? 'Confirmado.' : 'Cancelado.'}
            </p>
          ) : (
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" onClick={() => onResolver(it.id, true)} disabled={ocupado}>
                Confirmar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onResolver(it.id, false)} disabled={ocupado}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )
  }
}
