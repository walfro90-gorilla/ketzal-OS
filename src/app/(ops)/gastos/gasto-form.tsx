'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { crearGasto } from './actions'
import { CATEGORIAS } from './constants'

const CATEGORIA_LABELS: Record<string, string> = {
  operacion: 'Operación',
  transporte: 'Transporte',
  hospedaje: 'Hospedaje',
  alimentos: 'Alimentos',
  mayorista: 'Pago a mayorista',
  embajador: 'Pago a embajador',
  marketing: 'Marketing',
  otro: 'Otro',
}

const METODOS = ['efectivo', 'transferencia', 'deposito', 'tarjeta', 'otro']

function hoyIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function GastoForm({
  proveedores,
  defaultCategory,
  defaultProvider,
}: {
  proveedores: { id: string; name: string }[]
  defaultCategory?: string
  defaultProvider?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [concept, setConcept] = useState('')
  const [category, setCategory] = useState(
    defaultCategory && (CATEGORIAS as readonly string[]).includes(defaultCategory)
      ? defaultCategory
      : 'operacion'
  )
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [spentAt, setSpentAt] = useState(hoyIso())
  const [provider, setProvider] = useState(defaultProvider ?? '')
  const [notes, setNotes] = useState('')

  // Mayorista y embajador exigen proveedor (para netear su cuenta por pagar).
  const requiereProveedor = category === 'mayorista' || category === 'embajador'
  const proveedorLabel = category === 'embajador' ? 'Embajador' : 'Proveedor mayorista'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!concept.trim()) {
      setError('Escribe el concepto del gasto.')
      return
    }
    const monto = Number(amount)
    if (!Number.isFinite(monto) || monto <= 0) {
      setError('El monto debe ser mayor que cero.')
      return
    }
    if (requiereProveedor && !provider) {
      setError(`Elige el ${proveedorLabel.toLowerCase()}.`)
      return
    }
    startTransition(async () => {
      const res = await crearGasto({
        concept: concept.trim(),
        category,
        amount: monto,
        method: method || undefined,
        spent_at: spentAt,
        provider_supplier_id: requiereProveedor ? provider : null,
        notes: notes.trim() || undefined,
      })
      // En éxito la acción redirige a /gastos; solo se llega aquí con error.
      if (res?.error) {
        setError(res.error)
        toast.error(res.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gasto-concepto">Concepto *</Label>
        <Input
          id="gasto-concepto"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Ej. Gasolina del tour a Creel"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gasto-categoria">Categoría *</Label>
          <NativeSelect
            id="gasto-categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABELS[c] ?? c}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="gasto-monto">Monto (MXN) *</Label>
          <Input
            id="gasto-monto"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ej. 1500"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gasto-metodo">Método</Label>
          <NativeSelect
            id="gasto-metodo"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">— Sin especificar</option>
            {METODOS.map((m) => (
              <option key={m} value={m}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="gasto-fecha">Fecha</Label>
          <Input
            id="gasto-fecha"
            type="date"
            value={spentAt}
            onChange={(e) => setSpentAt(e.target.value)}
          />
        </div>
        {requiereProveedor && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="gasto-proveedor">{proveedorLabel} *</Label>
            <NativeSelect
              id="gasto-proveedor"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="">— Elige el {proveedorLabel.toLowerCase()}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="gasto-notas">Notas</Label>
          <Textarea
            id="gasto-notas"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Registrando…' : 'Registrar gasto'}
      </Button>
    </form>
  )
}
