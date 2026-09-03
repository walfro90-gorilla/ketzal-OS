# ADR-0041 — La confirmación de correo se pausa hasta Pro; el camino queda probado y listo para prenderse

- **Estado:** aceptada
- **Fecha:** 2026-09-03
- **Migración:** ninguna (configuración de Supabase Auth + harness)
- **Sustituye a:** ninguno
- **Toca:** Supabase Auth → Email → *Confirm email* (dashboard) ·
  `supabase/tests/confirmacion_email.mjs` (nuevo) · `supabase/tests/correr.mjs`
  (registro) · `supabase/templates/confirm-signup.html` (sin pegar)
- **Relacionadas:**
  [ADR-0039](0039-la-cotizacion-se-guarda-con-su-token.md) (`email_verificado`
  falla cerrado con auto-confirmación; el `token_hash` de `/auth/callback` nació
  ahí), [ADR-0034](0034-la-verificacion-nombra-su-prueba.md) (la verificación
  nombra su prueba), [ADR-0023](0023-fixtures-efimeras-en-los-hard-tests.md) (fixtures efímeras)

## Contexto

El 2026-09-03 el fundador prendió *Confirm email* en Auth. La suite siguió en
verde — y ese verde no decía nada: las 25 fixtures crean cuentas con
`email_confirm: true` por la Admin API, así que **ninguna tocaba el camino que
el switch cambió**: `registrarComprador` (`src/app/comprar/actions.ts`) llama
`signUp()`, y a partir de ahí el usuario solo entra si el enlace del correo
funciona.

Y ese enlace tiene dos formas que no son equivalentes:

- **PKCE (`?code=`)** — la que emite la plantilla POR DEFECTO. El código se
  canjea contra la cookie `code_verifier` del navegador **donde se pidió** el
  correo. Confirmar desde otro aparato no entra.
- **`token_hash`** — la que emite una plantilla propia con `{{ .TokenHash }}`.
  Se verifica en el servidor; no depende del navegador.

El canal real de este producto es WhatsApp: el prospecto se registra dentro del
webview de WhatsApp y abre el correo en la app de Gmail. Ese es justo el caso
que PKCE no cubre. La plantilla propia ya está escrita
(`supabase/templates/confirm-signup.html`) pero editar plantillas en este
proyecto quedó atado al plan **Pro**, que no se paga hasta que haya usuarios
pagando.

## Decisión

**La confirmación de correo se apaga (`Confirm email` OFF) hasta que el
proyecto esté en Pro y se pueda pegar la plantilla con `{{ .TokenHash }}`.
El código del camino de confirmación se queda como está y se verifica en cada
corrida de `pnpm hard-test`, apagado o prendido.**

Tres consecuencias que se aceptan a sabiendas:

1. **No abre un hueco de suplantación.** `email_verificado`
   ([ADR-0039](0039-la-cotizacion-se-guarda-con-su-token.md)) exige
   `email_confirmed_at is not null` **y** `confirmation_sent_at is not null`
   (o identidad Google con `email_verified`). Con auto-confirmación GoTrue no
   manda correo, así que `confirmation_sent_at` queda NULL y el guard **falla
   cerrado**: registrarse con el correo de otro no liga sus clientes ni sus
   ventas.
2. **A cambio, el barrido por correo queda dormido para el alta con
   contraseña.** Quien compró por WhatsApp con un agente y luego se registra
   con el mismo correo NO verá esas compras en `/mis-compras` por sí solo. Le
   quedan los otros dos caminos, que no dependen de esto: el `quote_token` del
   link de cotización (`claim_quote`) y entrar con Google (que sí llega
   verificado).
3. **Cualquiera puede registrarse con un correo que no es suyo.** Lo acota
   hCaptcha en el alta (b066) y el punto 1: la cuenta no hereda nada.

Se prende de vuelta cuando el proyecto pase a Pro **y** la plantilla esté
pegada, no antes: prenderla con la plantilla por defecto le rompe la
confirmación a los registros que llegan por WhatsApp, que son los que importan.

## Alternativas descartadas

- **Dejarla prendida con la plantilla por defecto.** Es el peor de los dos
  mundos: el registro por WhatsApp —el canal principal— cae en
  `/login?error=auth` al confirmar desde otro aparato, y a cambio solo se gana
  el barrido por correo, que hoy no tiene volumen.
- **SMTP propio para poder editar la plantilla sin Pro.** Es infra nueva
  (dominio, SPF/DKIM, reputación de envío) para una función que hoy no tiene
  usuarios. YAGNI hasta que haya con qué pagarla.
- **Pedir un código de 6 dígitos en vez del enlace.** Sirve y es
  independiente del aparato, pero cambia el alta y la plantilla por defecto no
  lo trae. Se guarda como salida si Pro se retrasa.

## Verificación

`supabase/tests/confirmacion_email.mjs` (10 casos; corre con
`pnpm hard-test confirmacion`, necesita `supabase` + la app viva). No manda un
solo correo: `admin/generate_link` fabrica el enlace y lo devuelve. Corre igual
con la confirmación ON u OFF y **reporta cuál está viva** leyendo
`mailer_autoconfirm` de `/auth/v1/settings`, en vez de suponerlo.

- **El camino que no depende del navegador:** `'el enlace por token_hash entra
  desde otro navegador'` pide `/auth/callback?type=signup&token_hash=…` **sin
  una sola cookie** y exige `307 → /mis-compras`; `'la cuenta queda confirmada
  en Auth'` lo confirma contra `email_confirmed_at`.
- **Un solo uso:** `'reusar el token no vuelve a abrir sesión'`
  (→ `/login?error=auth`).
- **PKCE degrada, no revienta:** `'un código PKCE que no sirve aterriza en
  /login?error=auth'` y `'y no emite cookie de sesión'`.
- **Sin open-redirect:** `'?next=//dominio-ajeno cae al destino interno, no al
  ajeno'` y su gemelo `https://`, ambos exigiendo `pathname === '/mis-compras'`.
- **Limpieza:** `'limpieza verificada: 0 cuentas efímeras vivas'` lista Auth
  después de borrar; el harness revienta si `generate_link` no devuelve el id
  del usuario, en vez de "borrar" `/admin/users/undefined` y leer el 404 como
  éxito.

**Probado por mutación** (2026-09-03), que es lo único que distingue un harness
de un adorno:

| Mutación en `src/app/auth/callback/route.ts` | Resultado |
|---|---|
| `const tokenHash = null` (matar el camino `token_hash`) | 2 rojos, salida 1 |
| `const explicitNext = raw` (quitar la sanitización del `?next`) | 2 rojos, salida 1 — `//evil.example.com` sale en el `Location` y el `https://` ajeno tira **500** |
| sin mutación | 10/10 |

La primera versión del caso del `?next` comparaba solo el **host** y pasaba con
la mutación puesta: la ruta se arma como `${origin}${next}`, así que hasta un
`next` sucio conserva el host. Por eso se compara el `pathname`.

El estado real de la configuración se midió contra los 8 usuarios de
producción: los 8 traen `confirmation_sent_at` NULL y solo los 3 de Google
pasan `email_verificado` — el guard del punto 1 está cerrado hoy.
