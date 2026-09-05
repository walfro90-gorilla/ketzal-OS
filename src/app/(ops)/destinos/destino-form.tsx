'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { borrarDestino, guardarDestino, type DestinoInput } from './actions'

// Formulario de un destino. Los campos son los que la página pública pinta, en
// el mismo orden en que se leen ahí, para que el que escribe vea lo que el
// visitante verá.

export type DestinoFila = DestinoInput & { huerfano: boolean; viajes: number }

function numeroONull(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function DestinoForm({ inicial }: { inicial: DestinoFila }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)

  const [nombre, setNombre] = useState(inicial.nombre ?? '')
  const [estado, setEstado] = useState(inicial.estado ?? '')
  const [pais, setPais] = useState(inicial.pais ?? 'México')
  const [lat, setLat] = useState(inicial.lat != null ? String(inicial.lat) : '')
  const [lng, setLng] = useState(inicial.lng != null ? String(inicial.lng) : '')
  const [ubicacion, setUbicacion] = useState(inicial.ubicacion ?? '')
  const [comoLlegar, setComoLlegar] = useState(inicial.como_llegar ?? '')
  const [porQue, setPorQue] = useState(inicial.por_que ?? '')
  const [cuandoIr, setCuandoIr] = useState(inicial.cuando_ir ?? '')
  const [queVisitar, setQueVisitar] = useState((inicial.que_visitar ?? []).join('\n'))
  const [publicado, setPublicado] = useState(Boolean(inicial.publicado))

  function guardar() {
    setError(null)
    setGuardado(false)
    startTransition(async () => {
      const r = await guardarDestino({
        slug: inicial.slug,
        nombre,
        estado,
        pais,
        lat: numeroONull(lat),
        lng: numeroONull(lng),
        ubicacion,
        como_llegar: comoLlegar,
        por_que: porQue,
        cuando_ir: cuandoIr,
        que_visitar: queVisitar.split('\n'),
        publicado,
      })
      if ('error' in r) {
        setError(r.error)
        return
      }
      setGuardado(true)
      router.refresh()
    })
  }

  function borrar() {
    setError(null)
    startTransition(async () => {
      const r = await borrarDestino(inicial.slug)
      if ('error' in r) {
        setError(r.error)
        setConfirmandoBorrado(false)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`nombre-${inicial.slug}`}>Nombre</Label>
          <Input
            id={`nombre-${inicial.slug}`}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`estado-${inicial.slug}`}>Estado o región</Label>
          <Input
            id={`estado-${inicial.slug}`}
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            placeholder="Chihuahua"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`pais-${inicial.slug}`}>País</Label>
          <Input
            id={`pais-${inicial.slug}`}
            value={pais}
            onChange={(e) => setPais(e.target.value)}
            placeholder="México"
          />
          <p className="text-xs text-muted-foreground">
            Los que no son México se muestran aparte, fuera del mapa.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor={`lat-${inicial.slug}`}>Latitud</Label>
            <Input
              id={`lat-${inicial.slug}`}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder="27.7511"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`lng-${inicial.slug}`}>Longitud</Label>
            <Input
              id={`lng-${inicial.slug}`}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              placeholder="-107.6353"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`ubicacion-${inicial.slug}`}>Dónde está</Label>
        <Textarea
          id={`ubicacion-${inicial.slug}`}
          rows={2}
          value={ubicacion}
          onChange={(e) => setUbicacion(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`llegar-${inicial.slug}`}>Cómo se llega</Label>
        <Textarea
          id={`llegar-${inicial.slug}`}
          rows={2}
          value={comoLlegar}
          onChange={(e) => setComoLlegar(e.target.value)}
          placeholder="Cuántas horas desde Ciudad Juárez, por dónde…"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`porque-${inicial.slug}`}>Por qué se visita</Label>
        <Textarea
          id={`porque-${inicial.slug}`}
          rows={3}
          value={porQue}
          onChange={(e) => setPorQue(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`visitar-${inicial.slug}`}>Qué visitar</Label>
        <Textarea
          id={`visitar-${inicial.slug}`}
          rows={4}
          value={queVisitar}
          onChange={(e) => setQueVisitar(e.target.value)}
          placeholder={'Un lugar por renglón'}
        />
        <p className="text-xs text-muted-foreground">Un lugar por renglón.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`cuando-${inicial.slug}`}>Cuándo ir</Label>
        <Input
          id={`cuando-${inicial.slug}`}
          value={cuandoIr}
          onChange={(e) => setCuandoIr(e.target.value)}
          placeholder="Mejor temporada, si la tiene"
        />
      </div>

      <label className="flex items-center gap-3 rounded-lg border p-3">
        <Switch checked={publicado} onCheckedChange={setPublicado} />
        <span className="text-sm">
          <span className="font-medium">Publicado</span>
          <span className="block text-muted-foreground">
            Apagado, el texto no sale en la página pública.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={guardar} disabled={isPending}>
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        {guardado && !isPending && (
          <span className="text-sm text-emerald-600 dark:text-emerald-500">Guardado.</span>
        )}
        {/* Borrar solo tiene sentido en un destino huérfano: si tiene viajes,
            la fila se vuelve a necesitar en cuanto alguien abra la página. */}
        {inicial.huerfano &&
          (confirmandoBorrado ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={borrar}
                disabled={isPending}
              >
                Sí, borrar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmandoBorrado(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmandoBorrado(true)}
            >
              Borrar destino huérfano
            </Button>
          ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
