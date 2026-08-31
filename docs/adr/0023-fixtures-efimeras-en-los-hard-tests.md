# ADR-0023 — Los hard-tests crean sus cuentas y las borran; no hay cuentas QA permanentes

- Estado: aceptada · Fecha: 2026-08-31 · Sustituye: —
- Alcance: `supabase/tests/_fixtures.mjs`, `encuestas_rls.mjs`,
  `policy_services_posiciones.mjs`, la variable `KETZAL_QA_PASS`

## Contexto

Los hard-tests de RLS por HTTP necesitan **una cuenta por posición** (admin de
agencia, agente raso, viajero, embajador, proveedor, agente libre): suplantar
solo posiciones altas esconde los huecos de las de abajo, y ese fue exactamente
el error que dejó pasar la fuga de PII de m002 — el harness SQL salió 13/13
verde suplantando admins mientras el HTTP con un agente no-admin encontraba el
agujero.

Esas cuentas eran **permanentes**, con la contraseña compartida en
`KETZAL_QA_PASS`. Eso no tiene una salida buena:

- **Dejarlas vivas** = credenciales de prueba con rol alto en producción.
  Pasó: `qa.ui@ketzal.local` vivió seis días (2026-08-24 → 30) con
  `role='superadmin'`, o sea acceso a toda la plataforma con una contraseña de
  QA. Nadie la echó de menos porque nada la vigilaba.
- **Borrarlas** = los harness dejan de correr **en silencio**. Pasó dos veces:
  `policy_services_posiciones.mjs` murió con la limpieza del 2026-08-23 y
  `encuestas_rls.mjs` con la del 2026-08-30. El de encuestas incluso tenía una
  rama que *saltaba* las posiciones inexistentes e imprimía un aviso: en la
  práctica, un test que se auto-desactiva.

La segunda repetición es la que obliga al ADR. No fue mala suerte: cualquier
limpieza futura vuelve a matarlos, y cualquier decisión de conservarlos vuelve
a dejar credenciales colgadas.

## Decisión

**Las cuentas de prueba viven lo que dura la corrida.** Un módulo compartido
`supabase/tests/_fixtures.mjs` expone `crearPosiciones([...])`, que por cada
posición crea la cuenta de Auth **por Admin API** (nunca INSERT directo a
`auth.users`), inserta su fila de `profiles` con `active: true` (no hay trigger
de signup) y devuelve el JWT ya logueado. El harness la usa dentro de un
`try` y llama `destruir()` en el `finally`.

- **La contraseña es aleatoria por corrida** (`randomUUID()` doble), nunca se
  imprime ni se persiste. `KETZAL_QA_PASS` desaparece del `.env.local`: ya no
  hay ninguna credencial de QA que guardar, rotar ni filtrar.
- **`destruir()` verifica, no supone.** Borra, relee la lista de usuarios y
  falla el harness si quedó alguna viva. Un borrado que falla en silencio
  reproduce el problema que este ADR cierra.
- **Barrido al arrancar.** Si una corrida anterior murió sin `finally`
  (`kill -9`, un `| head` que cierra el pipe), la siguiente borra los restos por
  prefijo `qa.efimero.` antes de empezar. El prefijo es exclusivo por diseño:
  ninguna cuenta real puede llevarlo.
- **Si la creación falla a medias, se destruye lo ya creado** antes de
  propagar el error. Nada queda colgado en producción por una excepción.
- **Se acabó el modo "saltada".** Antes, sin cuentas, el harness imprimía un
  aviso y salía; ahora no puede: si no puede crear las posiciones, revienta.

**Las cifras del catálogo se derivan, no se clavan.**
`policy_services_posiciones.mjs` tenía `TOTAL = 13, PUBLICADOS = 2` en el
código; el catálogo real ya iba en 14 y 6. Un harness resucitado que falla por
números viejos entrena a ignorarlo igual que un check siempre rojo
(ver [ADR-0020](0020-security-review-diferida.md)). Ahora se leen con service
role al arrancar, y la agencia de prueba se elige por ser la que más servicios
internos tiene — que es donde una fuga se notaría.

## Consecuencias

- **Las fixtures se crean contra producción**, porque no hay staging. Lo que
  cambia no es dónde viven sino cuánto: segundos en vez de días, con limpieza
  verificada. Correr un harness ya no deja residuo.
- Cualquier harness nuevo que necesite una posición usa `_fixtures.mjs`. Meter
  otra cuenta permanente reabre exactamente este agujero.
- `supabase/tests/qa_m002_setup.sql` se borra: documentaba cómo recrear a mano
  lo que ahora es automático.
- Sigue siendo cierto que el barrido **borra por prefijo** con service role. Es
  una operación destructiva sobre Auth de producción, acotada a un prefijo que
  ninguna cuenta real usa. Si algún día alguien crea una cuenta real que empiece
  con `qa.efimero.`, la pierde.

## Verificación

Ambos harness corridos en vivo contra la BD real:
`encuestas_rls.mjs` **23/23 sin fugas** (3 posiciones efímeras, siembra
verificada, limpieza en 0) y `policy_services_posiciones.mjs` **12/12**
(4 posiciones, cifras derivadas 14/6/7). `superficie_anonima.mjs` sigue en
30 pruebas · 0 expuestas.

El barrido se probó **con un crash real, no simulado**: un `| head -6` cerró el
pipe y mató el proceso antes del `finally`, dejando 4 cuentas vivas. La corrida
siguiente imprimió `⚠ barridos 4 restos de una corrida anterior` y terminó con
0. Confirmado aparte contra `auth.users`: 6 usuarios, 0 con prefijo `qa.`,
0 profiles huérfanos, y la encuesta real del fundador intacta.

## Fuentes
b059 (`services_read` acotada), ADR-0018 (harness HTTP que cazó la fuga de PII),
ADR-0020 (un check que siempre falla entrena a ignorar los checks).
