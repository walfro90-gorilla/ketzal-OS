import { describe, expect, it } from 'vitest'
import { KetzalError } from '../errors.js'
import {
  armarProveedor,
  armarTarifas,
  esquemaCrear,
  mismoNombre,
  normalizarNombre,
  type Tarifa,
} from './proveedores.js'

describe('normalizarNombre / mismoNombre', () => {
  it('ignora acentos, mayúsculas y signos', () => {
    expect(normalizarNombre('  Cabañas Rancho San Lorenzo, S.A. ')).toBe('cabanas rancho san lorenzo s a')
  })
  it('detecta el mismo proveedor aunque uno traiga prefijo', () => {
    expect(mismoNombre('Cabañas Rancho San Lorenzo', 'rancho san lorenzo')).toBe(true)
    expect(mismoNombre('Quinta Bonita', 'Quinta Bonita Norte')).toBe(true)
    expect(mismoNombre('Quinta Bonita', 'Sprinter Van')).toBe(false)
    expect(mismoNombre('', 'x')).toBe(false)
  })
})

describe('armarProveedor', () => {
  const base = esquemaCrear.parse({
    nombre: ' Cabañas Rancho San Lorenzo ',
    tipo: 'hotel',
    subtipo: 'cabañas y camping',
    telefono: '55.54.59.82.88',
    ciudad: 'Basaseachi',
    estado: 'Chihuahua',
    condiciones: 'Anticipo 50%; liquidación 5 días antes; no reembolsable.',
    especialidades: ['senderismo', ' camping ', ''],
    pago: { titular: 'Ana Gabriela Domínguez', clabe: '0143-2060-5884-8187-70', cuenta: '6058-8481-877' },
  })
  it('arma la fila con teléfono en dígitos, país México por default y la info compacta', () => {
    const fila = armarProveedor(base, 'ag-1')
    expect(fila).toMatchObject({
      name: 'Cabañas Rancho San Lorenzo',
      supplier_type: 'hotel',
      supplier_sub_type: 'cabañas y camping',
      phone_number: '5554598288',
      contact_email: null,
      city: 'Basaseachi',
      state: 'Chihuahua',
      country: 'México',
      owner_supplier_id: 'ag-1',
      commission_rate: 0,
    })
    expect(fila.info).toEqual({
      condiciones: 'Anticipo 50%; liquidación 5 días antes; no reembolsable.',
      specialties: ['senderismo', 'camping'],
      spei_titular: 'Ana Gabriela Domínguez',
      spei_clabe: '014320605884818770',
      spei_cuenta: '60588481877',
    })
  })
  it('exige teléfono o correo (el CHECK de la BD lo pide; aquí el error llega en español)', () => {
    expect(() => armarProveedor({ ...base, telefono: undefined }, 'ag-1')).toThrow(KetzalError)
    expect(armarProveedor({ ...base, telefono: undefined, email: ' Info@RSL.mx ' }, 'ag-1')).toMatchObject({
      contact_email: 'info@rsl.mx',
      phone_number: null,
    })
  })
  it('fuera de México no hay estado', () => {
    expect(() => armarProveedor({ ...base, pais: 'Colombia' }, 'ag-1')).toThrow(/estado/)
    expect(armarProveedor({ ...base, estado: undefined, pais: 'Colombia', ciudad: 'Medellín' }, 'ag-1')).toMatchObject({
      state: null,
      country: 'Colombia',
    })
  })
  it('el esquema rechaza agencia como tipo y un estado inventado', () => {
    expect(esquemaCrear.safeParse({ nombre: 'X', tipo: 'agency', telefono: '1' }).success).toBe(false)
    expect(esquemaCrear.safeParse({ nombre: 'X', tipo: 'hotel', estado: 'Antioquia' }).success).toBe(false)
  })
})

describe('armarTarifas', () => {
  const previas: Tarifa[] = [
    { key: 'sprinter', label: 'Sprinter', unit: 'grupo', cost: 8000, cap: 15 },
    { key: 'entrada', label: 'Entrada al parque', unit: 'pax', cost: 65 },
  ]
  it('deriva la key del label, redondea y guarda el cupo en las unidades que lo aceptan', () => {
    const t = armarTarifas(
      [
        { label: 'Cabaña 8 pax sin cocineta', unidad: 'noche', costo: 1900.005, cupo: 8 },
        { label: 'Acceso al parque', unidad: 'pax', costo: 65, cupo: 99 },
      ],
      [],
      true,
    )
    expect(t).toEqual([
      { key: 'cabana-8-pax-sin-cocineta', label: 'Cabaña 8 pax sin cocineta', unit: 'noche', cost: 1900.01, cap: 8 },
      { key: 'acceso-al-parque', label: 'Acceso al parque', unit: 'pax', cost: 65 }, // pax no lleva cupo
    ])
  })
  it('mezcla por default: conserva las previas y pisa la misma key', () => {
    const t = armarTarifas([{ key: 'sprinter', label: 'Sprinter 20', unidad: 'grupo', costo: 9000, cupo: 20 }], previas)
    expect(t.map((x) => x.key).sort()).toEqual(['entrada', 'sprinter'])
    expect(t.find((x) => x.key === 'sprinter')).toMatchObject({ label: 'Sprinter 20', cost: 9000, cap: 20 })
  })
  it('reemplazar deja solo lo mandado', () => {
    expect(armarTarifas([{ label: 'Camping', unidad: 'noche', costo: 600, cupo: 5 }], previas, true)).toHaveLength(1)
  })
  it('habitación exige costo_por_pack con packs conocidos; el resto exige costo', () => {
    expect(() => armarTarifas([{ label: 'Hotel', unidad: 'habitacion' }], [])).toThrow(/costo_por_pack/)
    expect(() => armarTarifas([{ label: 'Hotel', unidad: 'habitacion', costo_por_pack: { quintuple: 1 } }], [])).toThrow(/pack desconocido/)
    expect(() => armarTarifas([{ label: 'Guía', unidad: 'dia' }], [])).toThrow(/costo/)
    expect(armarTarifas([{ label: 'Hotel', unidad: 'habitacion', costo_por_pack: { doble: 1200 } }], [], true)[0]).toEqual({
      key: 'hotel',
      label: 'Hotel',
      unit: 'habitacion',
      cost_by_pack: { doble: 1200 },
    })
  })
  it('sin tarifas no hay nada que guardar', () => {
    expect(() => armarTarifas([], previas)).toThrow(KetzalError)
  })
})
