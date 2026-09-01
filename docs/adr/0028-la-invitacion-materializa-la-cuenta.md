# ADR-0028 — La invitación de agente materializa la cuenta; el RPC deja de depender del camino de login

- Estado: aceptada · Fecha: 2026-08-31 · Sustituye: —
- Complementa: [ADR-0027](0027-acceso-por-contrasena-provisional.md) (que dejó este caso abierto a propósito)
- Alcance: `ketzal.accept_pending_invitation` (b078), `generarAccesoInvitado`,
  `/equipo` → "Invitar agentes"

## Contexto

ADR-0027 cambió la entrega de accesos a contraseña provisional para embajador,
proveedor, admin de agencia y miembro del equipo, y dejó **fuera** el cuarto
camino —"Enviar acceso" sobre una invitación pendiente en `/equipo`— por una
razón concreta: ese camino invita a una cuenta que todavía no tiene `profiles`.

Al abrirlo apareció que el problema era peor que el link roto. Reproducido en
vivo contra el proyecto real:

```
accept_pending_invitation (como lo llama /login) -> 200 "dd46052b-…"   ← dice que sí
profile                                          -> NO EXISTE
segundo intento tras ensure_profile              -> null (ya estaba quemada)
profile final                                    -> {"type":"viajero","supplier_id":null}
```

`accept_pending_invitation` hacía `update ketzal.profiles … where id = auth.uid()`
sobre una fila inexistente —0 filas, ningún error— y **a renglón seguido marcaba
la invitación `accepted`**. El agente invitado que entrara por contraseña quedaba
`type='viajero'` para siempre, aterrizando en `/mis-compras`, y su invitación
desaparecía de `/equipo` como si todo hubiera salido bien. Sin un solo error en
ningún lado, ni para él ni para quien lo invitó.

La causa de fondo: la función asumía que **alguien más** (`ensure_profile()`, que
solo llama `/auth/callback`) ya había creado la fila. `/login` la invoca después
de `signInWithPassword` sin ese paso previo, y ese orden nadie lo garantizaba.

## Decisión

**1. `accept_pending_invitation` se basta sola (b078).** Crea el perfil si no
existe, con el rol, la agencia y `type='agente'` de la invitación, y solo después
marca la invitación aceptada. El arreglo es estructural —un `insert … on conflict
do update`— y no un `if FOUND`: así el resultado no depende de por dónde entró la
persona, que es de donde salió el hueco. Se conservan los tres guards del DDL
vivo (sin sesión, sin correo, y "no arrebata a quien ya tiene agencia").

**2. "Enviar acceso" entrega credenciales y cumple la invitación.**
`generarAccesoInvitado` crea la cuenta con contraseña provisional, materializa el
profile con el rol y la agencia de la invitación, marca la invitación aceptada y
devuelve las credenciales. El profile se escribe **aquí y no en el login** porque
`must_change_password` solo se puede poner sobre una fila que ya exista: sin eso
el gate de ADR-0027 no dispararía en el primer acceso, que es justo cuando hace
falta. Exige que exista la invitación pendiente, así que el botón no sirve para
fabricar una cuenta con un correo cualquiera.

**3. Las credenciales se pintan FUERA de la lista de pendientes.** Al cumplirse
la invitación su fila desaparece con el `revalidatePath`. Con la tarjeta colgando
del `<li>` —como estaba— se iba con la fila y **la contraseña no se llegaba a ver
nunca**: quedaba una cuenta creada que nadie podía usar. Salió mirando la
pantalla; ni el tipado ni los harness de BD lo veían.

## Alternativas descartadas

- **Llamar `ensure_profile()` antes en `/login`.** Arregla ese camino y deja la
  bomba puesta para el siguiente que llame al RPC sin saber el orden. Además
  `ensure_profile` crea al usuario como **viajero**, así que dependeríamos de dos
  escrituras en secuencia para acabar en `agente`.
- **Un `if FOUND` que no queme la invitación.** Evita el daño permanente pero
  deja al invitado sin poder entrar, sin decírselo a nadie. Es cambiar un fallo
  silencioso por otro.

## Lo que esto NO resuelve

- **"Enviar acceso" sigue siendo solo del superadmin**, aunque un admin de
  agencia sí puede invitar. Queda la misma asimetría que m005 arregló para
  embajadores: quien recluta no puede entregar el acceso. No se amplió aquí para
  no meter un cambio de permisos dentro de un arreglo de bug; es un carril corto
  y explícito.
- **Un `viajero` invitado se convierte en agente** (comportamiento previo, se
  conserva). `crearAgenciaEInvitarAdmin` en cambio lo bloquea. La incoherencia es
  real y es una decisión de producto —¿un cliente con historial de compras puede
  pasar a vender en la agencia?— que merece resolverse a propósito, no de lado.
