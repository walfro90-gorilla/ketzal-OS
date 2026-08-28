# ADR-0013 — El MCP se autentica como usuario real: la RLS decide, nunca el service key

- Estado: aceptada · Fecha: 2026-08-19 (v0.1) · Sustituye: —
- Alcance: paquete `mcp/` (ketzal-mcp en npm), cualquier integración de agentes IA futura

## Contexto
Exponer Ketzal OS a agentes de terminal requiere credenciales. Un service
role key en la máquina de cada agente = RLS apagada para quien lo tenga, y un
secreto imposible de rotar por persona.

## Decisión
- El MCP hace login como **usuario real** contra GoTrue y opera con su JWT:
  la RLS por agencia y los guards de los RPCs deciden qué ve y qué puede —
  **nunca service role key** en el MCP.
- Del disco solo sale el `refresh_token` (`~/.config/ketzal/session.json`,
  0600); la contraseña no se guarda; el config del cliente MCP queda sin
  secretos.
- **No se filtran tools por rol** — sería teatro: un JWT ya puede llamar
  PostgREST directo; la frontera es SQL (ADR-0004). El README lo dice
  textual.
- Frenos de dinero propios del canal LLM: `confirmar: true` obligatorio en
  tools de dinero, repetición de la penalización en cancelaciones, cupos
  anti-bucle separados (dinero=20, datos=100; default estricto).
- stdout es el cable JSON-RPC: TODO diagnóstico va a stderr.

## Consecuencias
- Repartir el MCP a un agente de agencia = crearle usuario; revocarlo =
  desactivar el usuario. Cero secretos compartidos.
- Con hCaptcha prendido en Auth, `ketzal-mcp login` se bloquea (protege
  /otp y /token, no /verify ni refresh) — las sesiones vivas siguen; el
  re-login exige bajar el captcha momentáneamente o resolver por liga.
- Sin fotos ni archivos que requieran service key: la subida usa el JWT y
  las policies del bucket (ADR-0015).

## Verificación
`grep -ri service_role mcp/src/` = 0; test de handshake stdio en CI; frenos
cubiertos por los tests del paquete.

## Fuentes
`mcp/README.md` (tesis de seguridad), CLAUDE.md MCP v0.1–v0.2, memoria
`mcp-ketzal`.
