#!/usr/bin/env node
/**
 * ketzal-mcp — servidor MCP de Ketzal OS.
 *
 *   npx ketzal-mcp login     entra con tu correo (código de 6 dígitos)
 *   npx ketzal-mcp doctor    verifica sesión y conectividad
 *   npx ketzal-mcp logout    borra la sesión local
 *   npx ketzal-mcp           arranca el servidor MCP por stdio (lo llama el cliente)
 */
import { createInterface } from 'node:readline/promises'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { READ_ONLY, VERSION } from './config.js'
import { log } from './log.js'
import { registrarPrompts } from './prompts.js'
import { registrarRecursos } from './resources.js'
import { clearSession, readStored, sendOtp, sessionPath, verifyMagicLink, verifyOtp } from './session.js'
import { ALL_TOOLS } from './tools/index.js'
import { registrar } from './tools/registry.js'
import { whoami } from './tools/identidad.js'

// Los subcomandos hablan por stdout porque los corre una persona en su terminal.
// El servidor MCP nunca lo hace: ahí stdout es el cable del protocolo.
const say = (s = ''): void => {
  process.stdout.write(s + '\n')
}

async function confirmado(): Promise<void> {
  const yo = await whoami()
  say('')
  say(`✔ Sesión guardada en ${sessionPath()} (0600)`)
  say(`  ${yo.email} · ${yo.rol ?? 'sin rol'} · ${yo.agencia?.nombre ?? 'sin agencia'}`)
  say('')
  say('Regístralo en Claude Code:')
  say('  claude mcp add ketzal -- npx -y ketzal-mcp')
}

/**
 * Login en dos pasos, con o sin terminal interactiva.
 *
 *   ketzal-mcp login                      pregunta correo y código (necesita TTY)
 *   ketzal-mcp login <correo>             manda el código
 *   ketzal-mcp login <correo> <código>    lo canjea
 *
 * La forma con argumentos existe porque no siempre hay stdin: dentro de un
 * agente, de un script o de un contenedor, `readline` se queda colgado en el
 * prompt para siempre.
 */
async function cmdLogin(argEmail?: string, argCode?: string): Promise<void> {
  try {
    const previa = await readStored()

    // La plantilla de correo del proyecto es la de Magic Link (liga, no código),
    // así que se acepta pegar la liga en cualquiera de las dos posiciones.
    const liga = [argEmail, argCode].find((v) => v?.startsWith('http'))
    if (liga) {
      await verifyMagicLink(liga)
      return confirmado()
    }
    if (argEmail && argCode) {
      await verifyOtp(argEmail, argCode.trim())
      return confirmado()
    }
    if (argEmail) {
      await sendOtp(argEmail)
      say(`Te mandé un correo a ${argEmail}.`)
      say('')
      say('Si trae una liga "Log In": copia su DIRECCIÓN (no le des clic, se consume) y corre:')
      say(`  ketzal-mcp login "<liga>"`)
      say('Si trae un código de 6 dígitos:')
      say(`  ketzal-mcp login ${argEmail} <código>`)
      return
    }

    if (!process.stdin.isTTY) {
      say('Sin terminal interactiva. Pasa el correo como argumento:')
      say('  ketzal-mcp login tu@correo.com')
      process.exitCode = 1
      return
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const email = (await rl.question(`Correo${previa ? ` [${previa.email}]` : ''}: `)).trim() || previa?.email
      if (!email) { say('Necesito un correo.'); process.exitCode = 1; return }
      await sendOtp(email)
      say(`Te mandé un código de 6 dígitos a ${email}.`)
      const code = (await rl.question('Código: ')).trim()
      await verifyOtp(email, code)
      await confirmado()
    } finally {
      rl.close()
    }
  } catch (e) {
    say(`✘ ${(e as Error).message}`)
    process.exitCode = 1
  }
}

async function cmdDoctor(): Promise<void> {
  const previa = await readStored()
  if (!previa) {
    say(`✘ Sin sesión en ${sessionPath()}. Corre: npx ketzal-mcp login`)
    process.exitCode = 1
    return
  }
  say(`· sesión: ${previa.email} (${sessionPath()})`)
  try {
    const yo = await whoami()
    say(`✔ conectado como ${yo.email} · ${yo.rol ?? 'sin rol'} · ${yo.agencia?.nombre ?? 'sin agencia'}`)
    say(`  ${yo.alcance}`)
    say(`✔ ${ALL_TOOLS.filter((t) => !(READ_ONLY && t.write)).length} herramientas disponibles (modo ${yo.modo})`)
  } catch (e) {
    say(`✘ ${(e as Error).message}`)
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  if (cmd === 'login') return cmdLogin(process.argv[3], process.argv[4])
  if (cmd === 'doctor') return cmdDoctor()
  if (cmd === 'logout') { await clearSession(); return say('Sesión borrada.') }
  if (cmd === '--version' || cmd === '-v') return say(VERSION)

  serveStdio(() => {
    const server = new McpServer(
      { name: 'ketzal', version: VERSION },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    )
    const n = registrar(server, ALL_TOOLS)
    const r = registrarRecursos(server)
    const p = registrarPrompts(server)
    log(
      `v${VERSION} · ${n} herramientas, ${r} recursos, ${p} prompts · ` +
        `modo ${READ_ONLY ? 'solo lectura' : 'lectura y escritura'}`,
    )
    return server
  })
}

main().catch((e) => {
  log('fatal:', (e as Error).message)
  process.exit(1)
})
