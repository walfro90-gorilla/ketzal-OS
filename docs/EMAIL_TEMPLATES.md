# Correos de Auth — diseño Ketzal OS

> Plantillas HTML listas para pegar en Supabase. Vive en `docs/` porque es
> configuración del dashboard, no código de la app — nada de esto se
> despliega con `git push`.

## Qué se hizo

3 plantillas con marca Ketzal (logo, jade `#00805F`, tono directo en español)
para los 3 correos que la app realmente dispara hoy:

| Archivo | Reemplaza | Se usa en |
|---|---|---|
| `email-templates/confirm-signup.html` | "Confirm signup" | alta en `/entrar` y `/comprar` |
| `email-templates/magic-link.html` | "Magic Link" | login sin contraseña en `/login`; trae también el código `{{ .Token }}` (pendiente cerrado del MCP: `login "<liga>"` ya lo canjeaba por URL, ahora el correo además lo muestra en claro) |
| `email-templates/reset-password.html` | "Reset Password" | `/recuperar` |

No se tocó "Invite user"/"Change Email Address"/"Reauthentication" — la app
no los dispara hoy (invitación de agencia usa su propio flujo, `agency_invitations`,
no el invite nativo de Supabase).

## Cómo instalar (manual, dashboard — no hay API para esto)

1. Abre **Authentication → Emails → Templates**:
   `https://supabase.com/dashboard/project/uznqmmeqwbbjkotbxwsw/auth/templates`
2. Por cada plantilla: pestaña correspondiente (Confirm signup / Magic Link /
   Reset Password) → borra el HTML del cuadro "Message Body" → pega el
   contenido completo del archivo `.html` de aquí → **Save**.
3. Asunto sugerido (campo "Subject") para cada una:
   - Confirm signup: `Confirma tu cuenta en Ketzal OS`
   - Magic Link: `Tu enlace para entrar a Ketzal OS`
   - Reset Password: `Recupera tu contraseña de Ketzal OS`
4. Prueba de inmediato: pide un magic link o una recuperación real (como se
   hizo en vivo para validar el fix de hCaptcha) y revisa que el correo llegue
   con el diseño nuevo.

Nada de esto requiere deploy ni migración — toma efecto en cuanto guardas
cada plantilla en el dashboard.

## Dominio propio para el remitente (pendiente — no hay dominio aún)

Hoy el correo sale de la dirección genérica de Supabase
(`noreply@mail.app.supabase.io` o similar) — el HTML ya se ve con marca
Ketzal, pero el remitente no. Para que salga de algo como
`no-responder@ketzal.mx`:

1. **Comprar el dominio** (Namecheap/GoDaddy, ~$150–300 MXN/año). No hace
   falta que la app viva ahí — solo se usa para enviar correo.
2. **Cuenta en [Resend](https://resend.com)** (recomendado: encaja bien con
   Vercel/Next.js, tier gratis generoso, guía oficial de integración con
   Supabase). Alternativas: SendGrid, Postmark, AWS SES.
3. **Verificar el dominio en Resend** — agrega los registros DNS que te den
   (SPF, DKIM, y de preferencia DMARC) en el panel del registrador del
   dominio. Sin esto el correo cae a spam o Resend lo rechaza.
4. **Conectar Resend como SMTP custom en Supabase**: Authentication →
   Emails → SMTP Settings → activa "Enable Custom SMTP" con el host/puerto/
   usuario/API key que da Resend, y el remitente (`no-responder@tudominio`).
5. Probar de nuevo un correo real y confirmar que llega con el remitente
   correcto y sin ir a spam.

Cuando tengas el dominio, retómalo desde aquí — no hace falta rehacer las
plantillas, solo cambia por dónde sale el correo.
