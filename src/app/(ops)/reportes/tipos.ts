// Forma del jsonb que devuelve ketzal.reports_summary(p_from, p_to).
// Los tipos generados a mano declaran `Returns: Json`, así que se
// estrecha con un cast en la página (mismo patrón que /dashboard y /comisiones).
// Compartido entre la página (server), las gráficas y el export CSV (client).

export type PorAgente = {
  agente: string
  num: number
  vendido: number
  comision: number
}

export type PorServicio = {
  servicio: string
  num: number
  vendido: number
}

export type PorMes = {
  mes: string // "YYYY-MM"
  num: number
  vendido: number
}

export type Reporte = {
  total_vendido: number
  total_cobrado: number
  saldo_por_cobrar: number
  total_comision: number
  num_ventas: number
  ticket_promedio: number
  por_agente: PorAgente[]
  por_servicio: PorServicio[]
  por_mes: PorMes[]
}
