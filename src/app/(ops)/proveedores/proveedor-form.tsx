'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ImageIcon, XIcon } from 'lucide-react'
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
import { NativeSelect } from '@/components/ui/native-select'
import { PhoneInput } from '@/components/ui/phone-input'
import { Textarea } from '@/components/ui/textarea'
import {
  actualizarProveedor,
  crearProveedor,
  setProveedorFotos,
  setProveedorLogo,
  type ProveedorInfo,
  type ProveedorInput,
} from './actions'
import { subirImagenProveedor } from './subir-imagen'

type ProveedorTipo = 'agency' | 'transporte' | 'hotel' | 'otro'

/** Acota el supplier_type de la BD a las opciones del select. */
function normalizarTipo(tipo: string | null | undefined): ProveedorTipo {
  if (tipo === 'agency' || tipo === 'tour_operator') return 'agency'
  if (tipo === 'transporte' || tipo === 'hotel') return tipo
  return 'otro'
}

export type ProveedorFormInitial = {
  name: string
  contact_email: string
  phone_number: string
  address: string
  description: string
  supplier_type: string | null
  commission_rate: number
  /** Logo (img_logo), o null. */
  img_logo: string | null
  /** Fotos del perfil público (hasta 12). */
  photos: string[]
  /** Perfil público (info jsonb). */
  info: ProveedorInfo
}

export function ProveedorForm({
  proveedorId,
  initial,
}: {
  /** Si viene, el formulario edita (actualizarProveedor); si no, crea (crearProveedor). */
  proveedorId?: string
  initial?: ProveedorFormInitial
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(initial?.name ?? '')
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? '')
  const [phoneNumber, setPhoneNumber] = useState(initial?.phone_number ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tipo, setTipo] = useState<ProveedorTipo>(
    initial ? normalizarTipo(initial.supplier_type) : 'agency'
  )
  const [commissionRate, setCommissionRate] = useState(
    String(initial?.commission_rate ?? 0)
  )

  // Perfil público (info jsonb).
  const info = initial?.info
  const [about, setAbout] = useState(info?.about ?? '')
  const [cityZone, setCityZone] = useState(info?.city_zone ?? '')
  const [foundedYear, setFoundedYear] = useState(
    info?.founded_year != null ? String(info.founded_year) : ''
  )
  const [website, setWebsite] = useState(info?.website ?? '')
  const [instagram, setInstagram] = useState(info?.instagram ?? '')
  const [facebook, setFacebook] = useState(info?.facebook ?? '')
  const [specialties, setSpecialties] = useState(
    (info?.specialties ?? []).join(', ')
  )

  // Logo y fotos: suben directo a Storage y persisten al instante (modo edición).
  const [logo, setLogo] = useState(initial?.img_logo ?? null)
  const [subiendoLogo, startLogo] = useTransition()
  const logoRef = useRef<HTMLInputElement>(null)
  const [fotos, setFotos] = useState<string[]>(initial?.photos ?? [])
  const [subiendoFotos, startFotos] = useTransition()
  const fotosRef = useRef<HTMLInputElement>(null)
  const MAX_FOTOS = 12

  function elegirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !proveedorId) return
    startLogo(async () => {
      const subida = await subirImagenProveedor(proveedorId, file, 'logo')
      if ('error' in subida) {
        toast.error(subida.error)
        return
      }
      const res = await setProveedorLogo(proveedorId, subida.url)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setLogo(subida.url)
      toast.success('Logo actualizado')
    })
  }

  function quitarLogo() {
    if (!proveedorId) return
    startLogo(async () => {
      const res = await setProveedorLogo(proveedorId, null)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setLogo(null)
      toast.success('Logo quitado')
    })
  }

  function agregarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length || !proveedorId) return
    const espacio = MAX_FOTOS - fotos.length
    if (espacio <= 0) {
      toast.error(`Máximo ${MAX_FOTOS} fotos.`)
      return
    }
    startFotos(async () => {
      const nuevas: string[] = []
      for (const f of files.slice(0, espacio)) {
        const r = await subirImagenProveedor(proveedorId, f, 'foto')
        if ('error' in r) toast.error(r.error)
        else nuevas.push(r.url)
      }
      if (!nuevas.length) return
      const lista = [...fotos, ...nuevas]
      const res = await setProveedorFotos(proveedorId, lista)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setFotos(lista)
      toast.success(
        nuevas.length === 1 ? 'Foto agregada' : `${nuevas.length} fotos agregadas`
      )
    })
  }

  function quitarFoto(url: string) {
    if (!proveedorId) return
    const lista = fotos.filter((u) => u !== url)
    startFotos(async () => {
      const res = await setProveedorFotos(proveedorId, lista)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setFotos(lista)
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Escribe el nombre del proveedor.')
      return
    }
    if (!contactEmail.trim()) {
      setError('Escribe el correo de contacto.')
      return
    }

    let rate = 0
    if (tipo === 'agency') {
      rate = Number(commissionRate)
      if (
        commissionRate.trim() === '' ||
        !Number.isFinite(rate) ||
        rate < 0 ||
        rate > 100
      ) {
        setError('El porcentaje de comisión debe estar entre 0 y 100.')
        return
      }
    }

    const infoInput: ProveedorInfo = {
      about: about.trim() || undefined,
      city_zone: cityZone.trim() || undefined,
      founded_year: foundedYear.trim() ? Number(foundedYear) : undefined,
      website: website.trim() || undefined,
      instagram: instagram.trim() || undefined,
      facebook: facebook.trim() || undefined,
      specialties: specialties
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    const input: ProveedorInput = {
      name: name.trim(),
      contact_email: contactEmail.trim(),
      phone_number: phoneNumber.trim() || undefined,
      address: address.trim() || undefined,
      description: description.trim() || undefined,
      supplier_type: tipo,
      commission_rate: tipo === 'agency' ? rate : undefined,
      info: infoInput,
    }

    startTransition(async () => {
      if (proveedorId) {
        const result = await actualizarProveedor(proveedorId, input)
        if ('error' in result) setError(result.error)
        else toast.success('Proveedor actualizado')
      } else {
        // En éxito la acción redirige a /proveedores/[id]; solo llega aquí con error.
        const result = await crearProveedor(input)
        if (result?.error) setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Datos del proveedor</CardTitle>
          <CardDescription>
            El nombre y el correo de contacto son obligatorios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="proveedor-nombre">Nombre *</Label>
              <Input
                id="proveedor-nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Wanderlust Travels"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proveedor-email">Correo de contacto *</Label>
              <Input
                id="proveedor-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Ej. contacto@proveedor.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proveedor-telefono">Teléfono</Label>
              <PhoneInput
                id="proveedor-telefono"
                value={phoneNumber}
                onChange={setPhoneNumber}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proveedor-tipo">Tipo</Label>
              <NativeSelect
                id="proveedor-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ProveedorTipo)}
              >
                <option value="agency">Agencia</option>
                <option value="transporte">Transporte</option>
                <option value="hotel">Hotel</option>
                <option value="otro">Otro</option>
              </NativeSelect>
            </div>
            {tipo === 'agency' && (
              <div className="space-y-2">
                <Label htmlFor="proveedor-comision">Comisión %</Label>
                <Input
                  id="proveedor-comision"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.5"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  placeholder="Ej. 10"
                />
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="proveedor-direccion">Dirección</Label>
              <Input
                id="proveedor-direccion"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, ciudad… (opcional)"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="proveedor-descripcion">Notas internas (privado)</Label>
              <Textarea
                id="proveedor-descripcion"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notas internas del proveedor (no se muestran al cliente)"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Se usa en los documentos (cotización, recibo) y en el perfil
            público. PNG, SVG o WebP, idealmente con fondo transparente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {proveedorId ? (
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-lg border bg-muted/40 p-2">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt="Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="size-7 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={elegirLogo}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={subiendoLogo}
                  onClick={() => logoRef.current?.click()}
                >
                  {subiendoLogo ? 'Subiendo…' : logo ? 'Cambiar logo' : 'Subir logo'}
                </Button>
                {logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={subiendoLogo}
                    onClick={quitarLogo}
                  >
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Guarda el proveedor primero; después podrás subir su logo.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Perfil público</CardTitle>
          <CardDescription>
            Información que verá el cliente en el perfil de la agencia. Todo
            opcional. Se guarda con &ldquo;Guardar cambios&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prov-about">Acerca de</Label>
            <Textarea
              id="prov-about"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Qué hace la agencia, su historia, su sello…"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prov-zona">Ciudad / zona</Label>
              <Input
                id="prov-zona"
                value={cityZone}
                onChange={(e) => setCityZone(e.target.value)}
                placeholder="Ej. Ciudad Juárez, Chihuahua"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-anio">Año de fundación</Label>
              <Input
                id="prov-anio"
                type="number"
                inputMode="numeric"
                min={1900}
                max={2100}
                step="1"
                value={foundedYear}
                onChange={(e) => setFoundedYear(e.target.value)}
                placeholder="Ej. 2017"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-web">Sitio web</Label>
              <Input
                id="prov-web"
                type="url"
                inputMode="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-ig">Instagram</Label>
              <Input
                id="prov-ig"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@usuario o link"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-fb">Facebook</Label>
              <Input
                id="prov-fb"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="Usuario o link"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prov-esp">Especialidades</Label>
              <Input
                id="prov-esp"
                value={specialties}
                onChange={(e) => setSpecialties(e.target.value)}
                placeholder="Separadas por coma. Ej. Ecoturismo, Aventura, Playa"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fotos</CardTitle>
          <CardDescription>
            Galería del perfil público (hasta {MAX_FOTOS}). JPG, PNG o WebP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {proveedorId ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {fotos.length}/{MAX_FOTOS}
                </span>
                <input
                  ref={fotosRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={agregarFotos}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={subiendoFotos || fotos.length >= MAX_FOTOS}
                  onClick={() => fotosRef.current?.click()}
                >
                  {subiendoFotos ? 'Subiendo…' : 'Agregar fotos'}
                </Button>
              </div>
              {fotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {fotos.map((url) => (
                    <div
                      key={url}
                      className="group relative overflow-hidden rounded-md border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => quitarFoto(url)}
                        disabled={subiendoFotos}
                        aria-label="Quitar foto"
                        className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground shadow-sm transition-colors hover:bg-background disabled:opacity-50"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin fotos. Puedes subir hasta {MAX_FOTOS}.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Guarda el proveedor primero; después podrás subir fotos.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? 'Guardando…'
            : proveedorId
              ? 'Guardar cambios'
              : 'Guardar proveedor'}
        </Button>
      </div>
    </form>
  )
}
