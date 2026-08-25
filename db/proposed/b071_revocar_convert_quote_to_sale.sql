-- b071: cierra el último camino de "venta con $0 cobrado". b070 quitó los
-- botones de la app (Guardar venta / Convertir a venta) y el primer abono ya
-- asciende la cotización solo — pero convert_quote_to_sale seguía ejecutable
-- por cualquier `authenticated` vía PostgREST (y era la base del tool
-- ketzal_convertir_cotizacion del MCP, que se elimina en el mismo cambio).
-- Se REVOCA en vez de dropear: la función queda para service_role como
-- override de emergencia consciente, nunca como camino cotidiano.
revoke execute on function ketzal.convert_quote_to_sale(uuid) from public, anon, authenticated;
grant execute on function ketzal.convert_quote_to_sale(uuid) to service_role;
