# ADR-0027 — El acceso de quien no se registra solo se entrega con contraseña provisional, no con magic-link

- Estado: aceptada · Fecha: 2026-08-31 · Sustituye: —
- Alcance: `lib/auth/credenciales.ts`, alta y reemisión de acceso de embajador y
  proveedor, gate `must_change_password` en las tres superficies

## Contexto

Cuatro personas entran a Ketzal sin haberse registrado nunca: el admin de una
agencia recién creada, el miembro que perdió su acceso, el **embajador**
reclutado y el **proveedor**. Alguien las da de alta y les tiene que entregar la
llave.

El repo lo resolvía de dos maneras distintas sin haberlo decidido:

- Admin de agencia y miembro (`equipo/invitaciones-actions.ts`): contraseña
  provisional `Ketzal-NNNNNN` + `profiles.must_change_password`, que el
  back-office fuerza a cambiar en `/nueva-password`. Funciona.
- Embajador y proveedor: `admin.generateLink({type:'magiclink'})`, se copiaba el
  link y se mandaba por WhatsApp.

**El camino del magic-link nunca funcionó. Ni una vez.** Medido contra el
proyecto real con una cuenta efímera (2026-08-31):

```
1) action_link:   .../auth/v1/verify  query=[token,type,redirect_to]
2) GET  -> 303    Location: /auth/callback  query=[]  fragment=[access_token,refresh_token,…]
3) 2º GET -> 303  Location: /auth/callback  fragment=[error,error_code,error_description]
```

Dos fallas independientes, cada una suficiente:

1. **La sesión llega en el fragmento.** Un link generado por la Admin API no
   tiene `code_verifier` asociado, así que `/auth/v1/verify` responde en flujo
   implícito: `#access_token=…`. `app/auth/callback/route.ts` es un Route Handler
   de servidor y el fragmento no sale del navegador — leía `?code=` (PKCE), no lo
   encontraba, y mandaba a `/login?error=auth`.
2. **El token es de un solo uso y WhatsApp lo quema.** El crawler de vista previa
   abre la URL para armar la tarjeta del chat. Para cuando la persona lo toca, el
   segundo GET ya responde `#error=…`.

Nadie lo notó porque el fallo se ve como "me manda al login": indistinguible de
haberse equivocado, y quien lo sufre no es quien puede diagnosticarlo.

## Decisión

**Un solo mecanismo de entrega para las cuatro personas: contraseña provisional.**
Vive en `lib/auth/credenciales.ts` (`nuevaProvisional`,
`emitirCredencialProvisional`); cada llamador pone su propia puerta antes, porque
el service role no respeta RLS. Se emite, se muestra UNA vez para que el operador
la mande, y `must_change_password` obliga a fijar la propia al entrar.

Consecuencias que se aceptan a propósito:

- **El correo pasa a ser obligatorio también para el proveedor.** Antes se
  sintetizaba `<uuid>@proveedor.ketzal.local` cuando venía vacío; eso solo se
  sostenía mientras el acceso fuera un link. Nadie dicta un UUID por WhatsApp.
- **El gate `must_change_password` se extiende a `/embajador` y `/proveedor`.**
  Solo lo tenía el back-office: las cuentas de los dos portales se quedaban con
  la contraseña que les dictaron, para siempre. `debeCambiarPassword` en
  `lib/persona.ts` para que sea la misma línea en las tres superficies.
- **`/nueva-password` aterriza en `/` y no en `/dashboard`.** Ya no es una
  pantalla solo del agente; `/` resuelve el destino por persona.

## Alternativas descartadas

- **Arreglar el magic-link con una página cliente que lea el fragmento.** Sería
  código nuevo para volver a un mecanismo que igual muere con la vista previa de
  WhatsApp. Se arregla la mitad barata del problema y queda la cara.
- **`verifyOtp` server-side con nuestra propia ruta `/acceso/<token>`.** Resuelve
  el fragmento pero no el crawler: un GET del preview seguiría consumiendo el
  token de un solo uso.
- **Mandar el correo de invitación de Supabase.** No hay emisor de correo
  configurado y el negocio se opera por WhatsApp: una llave que llega a un buzón
  que nadie abre es la misma cuenta muerta con otro nombre.

## Lo que esto NO resuelve

- **El envío sigue siendo manual.** Los botones arman el mensaje y abren
  `wa.me` / `mailto` en el teléfono del operador; no hay correo transaccional en
  el repo y la caja de WhatsApp está pausada ([ADR-0017](0017-whatsapp-baileys-box.md)).
  El mensaje ya queda armado en un solo lugar para el día que haya un emisor.
- **`generarLinkInvitacion` (`/equipo` → "dar acceso" a una invitación pendiente)
  sigue roto, por la misma causa.** Medido: `type:'recovery'` también aterriza en
  `fragment=[access_token,…]` sin `?code=`, y el correo de `inviteUserByEmail`
  igual. No se convirtió a contraseña provisional aquí porque ese camino invita a
  una cuenta que aún no tiene `profiles`: el profile y el auto-join a la agencia
  los crea `accept_pending_invitation` desde `/auth/callback`, y un login por
  contraseña nunca pasa por ahí. Arreglarlo obliga a crear el profile por
  adelantado con su rol y agencia, que es tocar la máquina de estados de
  invitaciones — carril aparte, no un efecto colateral de este. Lo que sí
  funciona hoy para un agente: crear la agencia con su admin, o "Regenerar
  acceso" desde su fila si la cuenta ya existe.
- **Los links que inicia la persona desde el navegador NO están afectados**
  (magic-link de `/login`, recuperación de `/recuperar`): ahí el cliente guarda
  el `code_verifier`, el verify responde con `?code=` y el callback lo canjea. La
  línea es admin-generated vs. user-initiated, no "links sí, links no".
- **Una contraseña mandada por WhatsApp se queda en el chat.** No es peor que el
  link —que también era una credencial al portador en el mismo chat— y el cambio
  forzado acota la ventana, pero no la cierra. Si alguna vez importa de verdad,
  el paso siguiente es caducar la provisional, no volver al link.
