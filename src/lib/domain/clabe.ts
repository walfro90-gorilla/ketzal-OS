// CLABE interbancaria (18 dígitos) — validación con dígito de control.
// Una CLABE mal capturada = transferencia del comprador a una cuenta equivocada,
// por eso se valida con checksum (pesos 3-7-1 cíclicos, módulo 10) y no solo
// con la longitud. Usada por el form de proveedor (alta de datos SPEI).

const PESOS = [3, 7, 1]

/** Quita espacios y guiones (la gente pega la CLABE formateada del banco). */
export function normalizarClabe(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

/** ¿CLABE válida? 18 dígitos y dígito de control correcto. */
export function validarClabe(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false
  let suma = 0
  for (let i = 0; i < 17; i++) {
    suma += (Number(clabe[i]) * PESOS[i % 3]) % 10
  }
  return (10 - (suma % 10)) % 10 === Number(clabe[17])
}

/** ¿Tarjeta válida? 16 dígitos + Luhn. Para depósitos en efectivo en cajero:
 *  una tarjeta mal capturada manda el efectivo del comprador a otra cuenta. */
export function validarTarjeta(tarjeta: string): boolean {
  if (!/^\d{16}$/.test(tarjeta)) return false
  let suma = 0
  for (let i = 0; i < 16; i++) {
    // Desde la derecha: posiciones pares se duplican (Luhn).
    let d = Number(tarjeta[15 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    suma += d
  }
  return suma % 10 === 0
}
