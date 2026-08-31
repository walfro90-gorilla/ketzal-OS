# ADR-0024 — Rotar una credencial de tercero se hace desde la app, no desde la BD

- Estado: aceptada · Fecha: 2026-08-31 · Sustituye: —
- Alcance: `ketzal.mp_accounts`, `/api/mp/oauth/*`, la tarjeta "Cobros en línea"
  de `/proveedores/[id]`

## Contexto

b053 guardó los tokens OAuth del vendedor en `ketzal.mp_accounts`, una tabla
**deny-all**: RLS encendida, cero policies, sin GRANT a `anon` ni
`authenticated`. Solo `service_role` la toca. Esa decisión sigue siendo la
correcta y no se cambia aquí.

Lo que nadie previó es la otra mitad: **si la tabla es intocable, tampoco hay
forma de reemplazar un token desde el producto.** La tarjeta de "Cobros en
línea" mostraba el botón "Conectar mi Mercado Pago" *solo cuando no había
cuenta*; una vez conectada, la única salida decía `✓ Cuenta conectada` y punto.
Cambiar de cuenta MP, o rotar un token comprometido, obligaba a escribir en la
base de datos a mano con la service key.

El 2026-08-31 eso dejó de ser hipotético: un agente investigando por qué no
encontraba la conexión corrió `select m.*` sobre `mp_accounts` y el
`access_token` y el `refresh_token` de producción de Wanderlust quedaron
impresos en un transcript. Con un incidente en curso, el runbook era "edita la
BD" — que es exactamente lo que la tabla deny-all existe para impedir.

## Decisión

**La rotación es una acción del producto.** La tarjeta muestra **Reconectar**
también con la cuenta ya conectada, apuntando al mismo
`/api/mp/oauth/start?supplier=…` que ya existía. No hay backend nuevo: el guard
(superadmin o admin activo de esa agencia, con el `supplier` firmado HMAC en
`state`) y el `upsert` del callback sobre `supplier_id` ya hacían el trabajo —
solo faltaba la puerta. Reconectar reemplaza `access_token`, `refresh_token`,
`public_key` y `expires_at`.

**Reconectar NO revoca los tokens anteriores.** Mercado Pago emite uno nuevo en
cada intercambio de `authorization_code`, pero los ya emitidos siguen sirviendo
hasta expirar (los de Ketzal duran ~180 días). Para un token **expuesto** eso no
alcanza, así que el runbook es de dos pasos y en este orden:

1. En la cuenta de Mercado Pago del vendedor → **Aplicaciones autorizadas** →
   revocar el acceso de Ketzal. Eso sí mata todo lo emitido.
2. Volver a `/proveedores/[id]` y darle **Reconectar**.

Se descarta el atajo de "solo reconectar": deja viva la credencial filtrada y da
una falsa sensación de cierre. Se descarta también añadir un botón "revocar" en
el OS: la revocación vive del lado del vendedor, en su cuenta de MP, y darle un
botón nuestro insinuaría que Ketzal puede cancelar accesos que no controla.

**Una rotación que no se puede verificar no es una rotación.** El callback ya
volvía con `?mp=conectado|cancelado|error` desde b053 y **ningún componente leía
ese parámetro**. La pantalla se re-renderizaba idéntica en los tres casos: el
usuario percibía un refresh, y —lo grave— **un fallo se veía exactamente igual
que un éxito**. Durante un incidente eso te hace creer que rotaste cuando no.
La página ahora lee `searchParams` y pinta el resultado.

## Consecuencias

- Cualquier integración OAuth futura (Openpay, Stripe, lo que venga) nace con
  las dos piezas juntas: **camino de rotación en la UI** y **acuse visible del
  resultado**. Guardar el token bien y no poder cambiarlo es media solución.
- El estado "conectada" deja de ser terminal en la UI. Cambiar de cuenta MP —
  un caso legítimo, no solo el de incidente — ya no pasa por la BD.
- Sigue prohibido escribir `mp_accounts` desde la app con sesión de usuario. La
  única escritura es el callback con service role, y la única lectura del token
  es el checkout.
- **Regla operativa para quien depura:** una tabla que guarda secretos no se lee
  con `select *`. Las columnas se descubren en `information_schema.columns`, y
  del secreto solo se reporta un booleano. Aplica a `mp_accounts` y a lo que
  venga después.

## Verificación

Rotación real ejecutada por el fundador el 2026-08-31 y confirmada por tres
vías independientes: `system_log` (`source='mp_oauth'`) con dos eventos
`cuenta MP conectada` a las 07:07:21 y 07:07:27; `mp_accounts.updated_at` en
07:07:27 con `expires_at` movido de 2027-02-06 a 2027-02-27 —solo ocurre si MP
emitió token nuevo—; y el token resultante probado en vivo contra
`GET https://api.mercadopago.com/users/me` → 200, user `479630144`, coincidente
con el `mp_user_id` guardado. El valor del token no se imprimió en ningún paso:
el script lo lee de la BD y solo reporta el status.

Ruta reusada, contra producción: `307 → /login` sin sesión, `400` sin
`supplier`. `tsc` limpio y `pnpm build` OK en ambos PR (#83, #84).

## Fuentes
b053 (`mp_accounts` deny-all + `/api/mp/oauth/*`),
[ADR-0016](0016-pagos-solo-mp.md) (pagos solo MP),
`docs/FINANZAS_PLATAFORMA.md`.
