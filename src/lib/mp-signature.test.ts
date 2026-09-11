import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verificarFirmaMp } from './mp-signature'

const SECRET = 'secreto-de-prueba-no-es-de-produccion'
const REQ = 'req-abc-123'
const TS = '1757500000000'

/** Firma como lo hace Mercado Pago: HMAC-SHA256 hex sobre el manifest. */
function firmar(manifest: string, secret = SECRET) {
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  return `ts=${TS},v1=${v1}`
}

describe('verificarFirmaMp', () => {
  it('acepta la firma del webhook moderno (data.id en el query)', () => {
    const r = verificarFirmaMp({
      signatureHeader: firmar(`id:178047162986;request-id:${REQ};ts:${TS};`),
      requestId: REQ,
      dataIds: ['178047162986', null, '178047162986'],
      secret: SECRET,
    })
    expect(r.valido).toBe(true)
    expect(r.idUsado).toBe('178047162986')
  })

  it('acepta el IPN legacy, donde el id viene en `id` y NO en `data.id`', () => {
    // El bug: el código sólo miraba `data.id`, así que armaba el manifest sin
    // `id:` y esta notificación se rechazaba siempre.
    const r = verificarFirmaMp({
      signatureHeader: firmar(`id:178047162986;request-id:${REQ};ts:${TS};`),
      requestId: REQ,
      dataIds: [null, '178047162986', '178047162986'],
      secret: SECRET,
    })
    expect(r.valido).toBe(true)
    expect(r.idUsado).toBe('178047162986')
  })

  it('acepta cuando el id sólo viene en el body', () => {
    const r = verificarFirmaMp({
      signatureHeader: firmar(`id:999;request-id:${REQ};ts:${TS};`),
      requestId: REQ,
      dataIds: [null, null, '999'],
      secret: SECRET,
    })
    expect(r.valido).toBe(true)
  })

  it('acepta el manifest sin id cuando la notificación no trae ninguno', () => {
    const r = verificarFirmaMp({
      signatureHeader: firmar(`request-id:${REQ};ts:${TS};`),
      requestId: REQ,
      dataIds: [null, null, null],
      secret: SECRET,
    })
    expect(r.valido).toBe(true)
    expect(r.idUsado).toBe(null)
  })

  it('minusculiza el id alfanumérico, como documenta MP', () => {
    const r = verificarFirmaMp({
      signatureHeader: firmar(`id:abc123;request-id:${REQ};ts:${TS};`),
      requestId: REQ,
      dataIds: ['ABC123'],
      secret: SECRET,
    })
    expect(r.valido).toBe(true)
  })

  // ── Los motivos: sin ellos el rechazo es mudo y no se puede arreglar ──────
  it('un secret equivocado se distingue de un header ausente', () => {
    const conOtroSecret = verificarFirmaMp({
      signatureHeader: firmar(`id:1;request-id:${REQ};ts:${TS};`, 'otro-secreto'),
      requestId: REQ,
      dataIds: ['1'],
      secret: SECRET,
    })
    expect(conOtroSecret).toMatchObject({ valido: false, motivo: 'no_cuadra' })

    expect(
      verificarFirmaMp({ signatureHeader: null, requestId: REQ, dataIds: ['1'], secret: SECRET })
    ).toMatchObject({ valido: false, motivo: 'sin_header' })

    expect(
      verificarFirmaMp({ signatureHeader: `ts=${TS}`, requestId: REQ, dataIds: ['1'], secret: SECRET })
    ).toMatchObject({ valido: false, motivo: 'header_sin_ts_o_v1' })

    expect(
      verificarFirmaMp({ signatureHeader: firmar('x'), requestId: REQ, dataIds: ['1'], secret: '' })
    ).toMatchObject({ valido: false, motivo: 'sin_secret' })
  })

  it('un v1 de otro largo no revienta la comparación en tiempo constante', () => {
    const r = verificarFirmaMp({
      signatureHeader: `ts=${TS},v1=abc`,
      requestId: REQ,
      dataIds: ['1'],
      secret: SECRET,
    })
    expect(r).toMatchObject({ valido: false, motivo: 'no_cuadra' })
  })

  it('no prueba el mismo id dos veces: candidatos únicos más el caso sin id', () => {
    const r = verificarFirmaMp({
      signatureHeader: `ts=${TS},v1=${'0'.repeat(64)}`,
      requestId: REQ,
      dataIds: ['7', '7', '7'],
      secret: SECRET,
    })
    expect(r.candidatos).toBe(2) // '7' y null
  })
})
