/**
 * Handshake MCP real contra el binario compilado.
 *
 * Es la única prueba que cubre lo que ninguna otra puede: que **stdout sea sólo
 * el protocolo**. Un `console.log` suelto en cualquier archivo inyecta basura
 * entre los mensajes JSON-RPC y tumba la sesión en todos los clientes a la vez —
 * un fallo que no se ve en typecheck ni en tests unitarios.
 *
 * No requiere sesión de Supabase: listar herramientas no las ejecuta.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const BIN = fileURLToPath(new URL('../dist/index.js', import.meta.url))

/** Manda las peticiones por stdin y devuelve las respuestas JSON-RPC de stdout. */
function handshake(peticiones: unknown[]): Promise<{ res: Record<string, unknown>[]; ruido: string[] }> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, [BIN], { stdio: ['pipe', 'pipe', 'pipe'] })
    const res: Record<string, unknown>[] = []
    const ruido: string[] = []
    let buffer = ''

    hijo.stdout.on('data', (chunk) => {
      buffer += String(chunk)
      const lineas = buffer.split('\n')
      buffer = lineas.pop() ?? ''
      for (const linea of lineas) {
        if (!linea.trim()) continue
        try {
          res.push(JSON.parse(linea))
        } catch {
          // Cualquier cosa en stdout que no sea JSON-RPC es exactamente el bug
          // que esta prueba existe para cazar.
          ruido.push(linea)
        }
      }
      if (res.length + ruido.length >= peticiones.length) {
        hijo.kill()
        resolve({ res, ruido })
      }
    })

    hijo.on('error', reject)
    const t = setTimeout(() => {
      hijo.kill()
      reject(new Error('El servidor no respondió el handshake en 10s'))
    }, 10_000)
    hijo.on('exit', () => clearTimeout(t))

    for (const p of peticiones) hijo.stdin.write(JSON.stringify(p) + '\n')
  })
}

describe.skipIf(!existsSync(BIN))('handshake MCP por stdio', () => {
  it('inicializa y expone herramientas, recursos y prompts sin ensuciar stdout', async () => {
    const { res, ruido } = await handshake([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2026-07-28',
          capabilities: {},
          clientInfo: { name: 'vitest', version: '0' },
        },
      },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'resources/list' },
      { jsonrpc: '2.0', id: 4, method: 'prompts/list' },
    ])

    expect(ruido, `stdout contaminado: ${ruido.join(' | ')}`).toEqual([])

    const porId = new Map(res.map((r) => [r.id, r]))
    const init = porId.get(1) as { result?: { serverInfo?: { name?: string } } }
    expect(init?.result?.serverInfo?.name).toBe('ketzal')

    const tools = (porId.get(2) as { result?: { tools?: { name: string }[] } })?.result?.tools ?? []
    expect(tools.length).toBeGreaterThan(20)
    expect(tools.map((t) => t.name)).toContain('ketzal_whoami')
    // Todas las herramientas llevan el prefijo del servidor: evita choques con
    // otros MCP montados en el mismo cliente.
    expect(tools.every((t) => t.name.startsWith('ketzal_'))).toBe(true)

    const resources = (porId.get(3) as { result?: { resources?: unknown[] } })?.result?.resources ?? []
    expect(resources.length).toBe(3)

    const prompts = (porId.get(4) as { result?: { prompts?: unknown[] } })?.result?.prompts ?? []
    expect(prompts.length).toBe(4)
  }, 15_000)
})
