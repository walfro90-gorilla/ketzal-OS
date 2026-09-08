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
import { PaperclipIcon, SparklesIcon, SendIcon, Trash2Icon, XIcon } from 'lucide-react'
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
import {
  ACEPTA_ADJUNTO,
  MAX_BYTES_ADJUNTO,
  MENSAJE_PESO_ADJUNTO,
  mensajeConAdjuntos,
  tipoAdjunto,
} from '@/lib/agente/adjunto-texto'
import { MAX_BYTES_PDF_NAVEGADOR, MENSAJE_PESO_PDF, seLeeEnNavegador } from '@/lib/agente/pdf-cliente'
import { cn } from '@/lib/utils'

type Item =
  | { k: 'user'; texto: string; adjuntos?: string[] }
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
  // ADR-0059: los adjuntos ya vienen convertidos a texto por /api/agente/adjunto
  // y se pegan al siguiente mensaje; el archivo no se guarda en ningún lado.
  const [adjuntos, setAdjuntos] = useState<{ nombre: string; texto: string; recortado: boolean }[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
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

  /** Una foto de celular pesa 3-8 MB; a 1600 px JPEG cabe en el tope y el modelo la lee igual. */
  async function reducirImagen(f: File): Promise<File> {
    if (!f.type.startsWith('image/')) return f
    try {
      const bmp = await createImageBitmap(f)
      const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
      if (escala === 1 && f.size <= MAX_BYTES_ADJUNTO) return f
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * escala)
      c.height = Math.round(bmp.height * escala)
      c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85))
      return blob ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f
    } catch {
      return f
    }
  }

  async function adjuntar(lista: FileList | null) {
    if (!lista?.length) return
    setSubiendo(true)
    try {
      for (const original of Array.from(lista)) {
        // ADR-0060: el PDF se lee aquí mismo; el servidor corta el body en 4.5 MB
        // y un folleto de Canva pesa más aunque su texto sean dos párrafos.
        if (seLeeEnNavegador(tipoAdjunto(original.name, original.type))) {
          if (original.size > MAX_BYTES_PDF_NAVEGADOR) {
            agregar({ k: 'error', texto: `${original.name}: ${MENSAJE_PESO_PDF}` })
            continue
          }
          const { textoDePdfEnNavegador } = await import('@/lib/agente/pdf-cliente')
          const r = await textoDePdfEnNavegador(new Uint8Array(await original.arrayBuffer()))
          if ('error' in r) agregar({ k: 'error', texto: `${original.name}: ${r.error}` })
          else setAdjuntos((prev) => [...prev, { nombre: original.name, texto: r.texto, recortado: r.recortado }])
          continue
        }
        const f = await reducirImagen(original)
        if (f.size > MAX_BYTES_ADJUNTO) {
          agregar({ k: 'error', texto: `${f.name}: ${MENSAJE_PESO_ADJUNTO}` })
          continue
        }
        const fd = new FormData()
        fd.append('archivo', f)
        const r = await fetch('/api/agente/adjunto', { method: 'POST', body: fd })
        const j = (await r.json().catch(() => null)) as
          | { nombre?: string; texto?: string; recortado?: boolean; error?: string }
          | null
        if (!r.ok || !j?.texto) {
          agregar({ k: 'error', texto: `${f.name}: ${j?.error ?? `no se pudo leer (HTTP ${r.status}).`}` })
          continue
        }
        const texto = j.texto
        setAdjuntos((prev) => [...prev, { nombre: j.nombre ?? f.name, texto, recortado: Boolean(j.recortado) }])
      }
    } finally {
      setSubiendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function enviar() {
    const t = texto.trim()
    if ((!t && !adjuntos.length) || ocupado || subiendo) return
    const visible = t || 'Revisa lo adjunto.'
    const contenido = mensajeConAdjuntos(visible, adjuntos)
    setTexto('')
    setAdjuntos([])
    setGuardadoEn(0)
    agregar({ k: 'user', texto: visible, adjuntos: adjuntos.map((a) => a.nombre) })
    void pedir([...mensajes, { role: 'user', content: contenido }])
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
            className="flex flex-col gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault()
              enviar()
            }}
          >
            {adjuntos.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Adjuntos por enviar">
                {adjuntos.map((a, i) => (
                  <li key={i} className="flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
                    <PaperclipIcon className="size-3" />
                    <span className="max-w-40 truncate">{a.nombre}</span>
                    {a.recortado && <span className="text-muted-foreground">· recortado</span>}
                    <button
                      type="button"
                      aria-label={`Quitar ${a.nombre}`}
                      className="rounded-full p-0.5 hover:bg-background"
                      onClick={() => setAdjuntos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACEPTA_ADJUNTO}
                multiple
                hidden
                onChange={(e) => void adjuntar(e.target.files)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Adjuntar PDF, imagen o documento"
                disabled={ocupado || pendiente || subiendo}
                onClick={() => fileRef.current?.click()}
              >
                <PaperclipIcon className="size-4" />
              </Button>
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviar()
                  }
                }}
                placeholder={
                  pendiente ? 'Resuelve la tarjeta de arriba…' : subiendo ? 'Leyendo el archivo…' : 'Escribe o dicta…'
                }
                rows={2}
                disabled={ocupado || pendiente}
                className="min-h-0 resize-none"
                aria-label="Mensaje para el asistente"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Enviar"
                disabled={ocupado || pendiente || subiendo || (!texto.trim() && !adjuntos.length)}
              >
                <SendIcon className="size-4" />
              </Button>
            </div>
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
        <div className="ml-8 rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">
          <p className="whitespace-pre-wrap">{it.texto}</p>
          {it.adjuntos?.length ? (
            <p className="mt-1 flex flex-wrap gap-1 text-xs opacity-90">
              {it.adjuntos.map((n, i) => (
                <span key={i} className="rounded-full bg-primary-foreground/20 px-2 py-0.5">
                  📎 {n}
                </span>
              ))}
            </p>
          ) : null}
        </div>
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
