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
import { clearSession, readStored, sendOtp, sessionPath, verifyOtp } from './session.js'
import { ALL_TOOLS } from './tools/index.js'
import { registrar } from './tools/registry.js'
import { whoami } from './tools/identidad.js'

// Los subcomandos hablan por stdout porque los corre una persona en su terminal.
// El servidor MCP nunca lo hace: ahí stdout es el cable del protocolo.
const say = (s = ''): void => {
  process.stdout.write(s + '\n')
}

async function cmdLogin(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const previa = await readStored()
    const email = (await rl.question(`Correo${previa ? ` [${previa.email}]` : ''}: `)).trim() || previa?.email
    if (!email) { say('Necesito un correo.'); process.exitCode = 1; return }

    await sendOtp(email)
    say(`Te mandé un código de 6 dígitos a ${email}.`)
    const code = (await rl.question('Código: ')).trim()
    await verifyOtp(email, code)

    const yo = await whoami()
    say('')
    say(`✔ Sesión guardada en ${sessionPath()} (0600)`)
    say(`  ${yo.email} · ${yo.rol ?? 'sin rol'} · ${yo.agencia?.nombre ?? 'sin agencia'}`)
    say('')
    say('Regístralo en Claude Code:')
    say('  claude mcp add ketzal -- npx -y ketzal-mcp')
  } catch (e) {
    say(`✘ ${(e as Error).message}`)
    process.exitCode = 1
  } finally {
    rl.close()
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
  if (cmd === 'login') return cmdLogin()
  if (cmd === 'doctor') return cmdDoctor()
  if (cmd === 'logout') { await clearSession(); return say('Sesión borrada.') }
  if (cmd === '--version' || cmd === '-v') return say(VERSION)

  serveStdio(() => {
    const server = new McpServer(
      { name: 'ketzal', version: VERSION },
      { capabilities: { tools: {} } },
    )
    const n = registrar(server, ALL_TOOLS)
    log(`v${VERSION} · ${n} herramientas · modo ${READ_ONLY ? 'solo lectura' : 'lectura y escritura'}`)
    return server
  })
}

main().catch((e) => {
  log('fatal:', (e as Error).message)
  process.exit(1)
})
