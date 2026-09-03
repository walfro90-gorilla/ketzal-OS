/**
 * Un solo camino a los LLM.
 *
 * Groq, Gemini y DeepSeek hablan el dialecto OpenAI (`/chat/completions` con
 * `tools`), así que basta `fetch`, igual que el lector de volantes. El fallback
 * Groq → Gemini → DeepSeek salta SOLO por fallas de transporte (red, 429, 5xx):
 * un 4xx es una petición mal armada por nosotros y se reporta, no se enmascara
 * probando con otro proveedor. Los mensajes viajan en formato OpenAI, así que la
 * conversación puede cambiar de proveedor a media charla sin traducir nada.
 */

export type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type Mensaje = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export type ToolSpec = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type Proveedor = {
  nombre: string
  url: string
  key: string | undefined
  modelo: string
  /** Parámetros que solo entiende ese proveedor. */
  extra?: Record<string, unknown>
}

/** Solo los que tienen llave: el orden ES la prioridad. */
export function proveedores(env: Record<string, string | undefined> = process.env): Proveedor[] {
  return [
    {
      nombre: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: env.GROQ_API_KEY,
      // Modelo aparte del lector de volantes: elegir herramientas y leer un PDF
      // no siempre quieren el mismo modelo.
      modelo: env.GROQ_AGENT_MODEL || 'qwen/qwen3.6-27b',
      // Mismo apagador que el lector: con el razonamiento activo qwen3.6 gasta
      // la generación pensando y `content` vuelve vacío.
      extra: { reasoning_effort: 'none' },
    },
    {
      nombre: 'gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: env.GEMINI_API_KEY,
      modelo: env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
    {
      nombre: 'deepseek',
      url: 'https://api.deepseek.com/chat/completions',
      key: env.DEEPSEEK_API_KEY,
      modelo: env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
  ].filter((p) => p.key)
}

/** Error que sí se le puede enseñar a la persona (sin eco del request). */
export class LlmError extends Error {}

/** Se salta al siguiente proveedor solo con fallas de transporte. */
export function esRecuperable(status: number): boolean {
  return status === 429 || status >= 500
}

export type Completar = (
  mensajes: Mensaje[],
  tools: ToolSpec[],
) => Promise<{ mensaje: Mensaje; proveedor: string }>

export async function completar(
  mensajes: Mensaje[],
  tools: ToolSpec[],
  lista: Proveedor[] = proveedores(),
  fetchFn: typeof fetch = fetch,
): Promise<{ mensaje: Mensaje; proveedor: string }> {
  if (!lista.length) {
    throw new LlmError('Ningún LLM configurado (GROQ_API_KEY, GEMINI_API_KEY o DEEPSEEK_API_KEY).')
  }
  const fallas: string[] = []
  for (const p of lista) {
    let r: Response
    try {
      r = await fetchFn(p.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: p.modelo,
          temperature: 0.2,
          messages: mensajes,
          ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
          ...p.extra,
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (e) {
      console.error('[agente] red', p.nombre, (e as Error)?.message ?? e)
      fallas.push(`${p.nombre}: red`)
      continue
    }
    if (!r.ok) {
      // El detalle solo al log del servidor: puede traer eco del request.
      console.error('[agente]', p.nombre, r.status, (await r.text().catch(() => '')).slice(0, 500))
      if (esRecuperable(r.status)) {
        fallas.push(`${p.nombre}: HTTP ${r.status}`)
        continue
      }
      throw new LlmError(`${p.nombre} rechazó la petición (HTTP ${r.status}).`)
    }
    const j = (await r.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]
    } | null
    const m = j?.choices?.[0]?.message
    if (!m) {
      fallas.push(`${p.nombre}: sin respuesta`)
      continue
    }
    return {
      proveedor: p.nombre,
      mensaje: {
        role: 'assistant',
        content: m.content ?? null,
        ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
      },
    }
  }
  throw new LlmError(`Ningún LLM respondió (${fallas.join(', ')}).`)
}
