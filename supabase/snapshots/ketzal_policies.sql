-- ============================================================================
-- Ketzal OS — SNAPSHOT de políticas RLS del schema `ketzal`
-- Generado 2026-07-09 desde pg_policies. Supabase es la FUENTE DE VERDAD;
-- esto es un respaldo VERSIONADO. Para un dump fiel/completo usar
-- `supabase db pull` (ver supabase/README.md).
-- RLS está ENABLED en todas estas tablas. Incluye tablas activas del OS y
-- las tablas "dormidas" del scaffold B2C (wallets, wishlists, planners, etc.).
-- ============================================================================

-- app_settings
CREATE POLICY app_settings_read ON ketzal.app_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY app_settings_write ON ketzal.app_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING (ketzal.is_superadmin())
  WITH CHECK (ketzal.is_superadmin());

-- booking_items
CREATE POLICY booking_items_ins ON ketzal.booking_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((ketzal.is_active() AND (EXISTS ( SELECT 1
   FROM ketzal.bookings b
  WHERE ((b.id = booking_items.booking_id) AND (ketzal.is_superadmin() OR (b.sold_by = auth.uid()) OR ((b.selling_supplier_id IS NOT NULL) AND (b.selling_supplier_id = ketzal.my_supplier_id()))))))));
CREATE POLICY booking_items_sel ON ketzal.booking_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ketzal.bookings b
  WHERE ((b.id = booking_items.booking_id) AND (ketzal.is_superadmin() OR (b.sold_by = auth.uid()) OR ((b.selling_supplier_id IS NOT NULL) AND (b.selling_supplier_id = ketzal.my_supplier_id())))))));

-- bookings
CREATE POLICY bookings_ins ON ketzal.bookings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((ketzal.is_active() AND (sold_by = auth.uid()) AND ((selling_supplier_id IS NULL) OR (selling_supplier_id = ketzal.my_supplier_id()) OR ketzal.is_superadmin())));
CREATE POLICY bookings_sel ON ketzal.bookings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((ketzal.is_superadmin() OR (sold_by = auth.uid()) OR ((selling_supplier_id IS NOT NULL) AND (selling_supplier_id = ketzal.my_supplier_id()))));
CREATE POLICY bookings_upd ON ketzal.bookings AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((ketzal.is_superadmin() OR (sold_by = auth.uid()) OR ((selling_supplier_id IS NOT NULL) AND (selling_supplier_id = ketzal.my_supplier_id()))))
  WITH CHECK ((ketzal.is_active() AND (ketzal.is_superadmin() OR (sold_by = auth.uid()) OR ((selling_supplier_id IS NOT NULL) AND (selling_supplier_id = ketzal.my_supplier_id())))));

-- categories (scaffold B2C)
CREATE POLICY categories_read ON ketzal.categories AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY categories_write ON ketzal.categories AS PERMISSIVE FOR ALL TO public
  USING (ketzal.is_superadmin())
  WITH CHECK (ketzal.is_superadmin());

-- customers
CREATE POLICY customers_ins ON ketzal.customers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((ketzal.is_active() AND (created_by = auth.uid()) AND ((supplier_id IS NULL) OR (supplier_id = ketzal.my_supplier_id()) OR ketzal.is_superadmin())));
CREATE POLICY customers_sel ON ketzal.customers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((ketzal.is_superadmin() OR (created_by = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id()))));
CREATE POLICY customers_upd ON ketzal.customers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((ketzal.is_superadmin() OR (created_by = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id()))))
  WITH CHECK ((ketzal.is_active() AND (ketzal.is_superadmin() OR (created_by = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id())))));

-- notifications (scaffold B2C)
CREATE POLICY notifications_delete ON ketzal.notifications AS PERMISSIVE FOR DELETE TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()));
CREATE POLICY notifications_select ON ketzal.notifications AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()));
CREATE POLICY notifications_update ON ketzal.notifications AS PERMISSIVE FOR UPDATE TO public
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

-- payment_intents (cobro en línea MP)
CREATE POLICY payment_intents_ins ON ketzal.payment_intents AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((ketzal.is_active() AND (created_by = auth.uid())));
CREATE POLICY payment_intents_sel ON ketzal.payment_intents AS PERMISSIVE FOR SELECT TO authenticated
  USING ((ketzal.is_superadmin() OR (created_by = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id()))));
CREATE POLICY payment_intents_upd ON ketzal.payment_intents AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((ketzal.is_superadmin() OR (created_by = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id()))))
  WITH CHECK (ketzal.is_active());

-- payment_schedule (plan de pagos)
CREATE POLICY ps_select ON ketzal.payment_schedule AS PERMISSIVE FOR SELECT TO public
  USING ((ketzal.is_superadmin() OR (booking_id IN ( SELECT bookings.id
   FROM ketzal.bookings
  WHERE ((bookings.sold_by = auth.uid()) OR (bookings.selling_supplier_id = ketzal.my_supplier_id()))))));

-- payments (ledger)
CREATE POLICY payments_scoped_ins ON ketzal.payments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((ketzal.is_active() AND (user_id = auth.uid()) AND ((supplier_id IS NULL) OR (supplier_id = ketzal.my_supplier_id()) OR ketzal.is_superadmin())));
CREATE POLICY payments_scoped_sel ON ketzal.payments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((ketzal.is_superadmin() OR (user_id = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id()))));
CREATE POLICY payments_scoped_upd ON ketzal.payments AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((ketzal.is_superadmin() OR (user_id = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id()))))
  WITH CHECK ((ketzal.is_active() AND (ketzal.is_superadmin() OR (user_id = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id())))));
CREATE POLICY payments_select ON ketzal.payments AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()));

-- planner_items (scaffold B2C)
CREATE POLICY planner_items_select ON ketzal.planner_items AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ketzal.travel_planners p
  WHERE ((p.id = planner_items.planner_id) AND ((p.user_id = auth.uid()) OR (p.is_public = true) OR ketzal.is_superadmin())))));
CREATE POLICY planner_items_write ON ketzal.planner_items AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM ketzal.travel_planners p
  WHERE ((p.id = planner_items.planner_id) AND ((p.user_id = auth.uid()) OR ketzal.is_superadmin())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ketzal.travel_planners p
  WHERE ((p.id = planner_items.planner_id) AND ((p.user_id = auth.uid()) OR ketzal.is_superadmin())))));

-- products (scaffold B2C)
CREATE POLICY products_read ON ketzal.products AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY products_write ON ketzal.products AS PERMISSIVE FOR ALL TO public
  USING (ketzal.is_superadmin())
  WITH CHECK (ketzal.is_superadmin());

-- profiles
CREATE POLICY profiles_select_own ON ketzal.profiles AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));
CREATE POLICY profiles_update_own ON ketzal.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

-- receipts
CREATE POLICY receipts_ins ON ketzal.receipts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((ketzal.is_active() AND (issued_by = auth.uid()) AND ((supplier_id IS NULL) OR (supplier_id = ketzal.my_supplier_id()) OR ketzal.is_superadmin())));
CREATE POLICY receipts_sel ON ketzal.receipts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((ketzal.is_superadmin() OR (issued_by = auth.uid()) OR ((supplier_id IS NOT NULL) AND (supplier_id = ketzal.my_supplier_id()))));

-- reviews (scaffold B2C)
CREATE POLICY reviews_delete ON ketzal.reviews AS PERMISSIVE FOR DELETE TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()));
CREATE POLICY reviews_insert ON ketzal.reviews AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY reviews_read ON ketzal.reviews AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY reviews_update ON ketzal.reviews AS PERMISSIVE FOR UPDATE TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()))
  WITH CHECK (((user_id = auth.uid()) OR ketzal.is_superadmin()));

-- service_departures (inventario: cupo por salida)
CREATE POLICY service_departures_owner ON ketzal.service_departures AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM ketzal.services s
  WHERE ((s.id = service_departures.service_id) AND ((s.supplier_id = ketzal.my_supplier_id()) OR ketzal.is_superadmin())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ketzal.services s
  WHERE ((s.id = service_departures.service_id) AND ((s.supplier_id = ketzal.my_supplier_id()) OR ketzal.is_superadmin())))));

-- services
CREATE POLICY services_delete ON ketzal.services AS PERMISSIVE FOR DELETE TO public
  USING ((ketzal.is_superadmin() OR (supplier_id = ketzal.my_supplier_id())));
CREATE POLICY services_insert ON ketzal.services AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((ketzal.is_superadmin() OR (supplier_id = ketzal.my_supplier_id())));
CREATE POLICY services_read ON ketzal.services AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY services_update ON ketzal.services AS PERMISSIVE FOR UPDATE TO public
  USING ((ketzal.is_superadmin() OR (supplier_id = ketzal.my_supplier_id())))
  WITH CHECK ((ketzal.is_superadmin() OR (supplier_id = ketzal.my_supplier_id())));

-- suppliers (agencias + proveedores)
CREATE POLICY suppliers_delete ON ketzal.suppliers AS PERMISSIVE FOR DELETE TO public
  USING (ketzal.is_superadmin());
CREATE POLICY suppliers_insert ON ketzal.suppliers AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (ketzal.is_superadmin());
CREATE POLICY suppliers_read ON ketzal.suppliers AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY suppliers_update ON ketzal.suppliers AS PERMISSIVE FOR UPDATE TO public
  USING ((ketzal.is_superadmin() OR (id = ketzal.my_supplier_id())))
  WITH CHECK ((ketzal.is_superadmin() OR (id = ketzal.my_supplier_id())));

-- travel_planners (scaffold B2C)
CREATE POLICY planners_delete ON ketzal.travel_planners AS PERMISSIVE FOR DELETE TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()));
CREATE POLICY planners_insert ON ketzal.travel_planners AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY planners_select ON ketzal.travel_planners AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) OR (is_public = true) OR ketzal.is_superadmin()));
CREATE POLICY planners_update ON ketzal.travel_planners AS PERMISSIVE FOR UPDATE TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()))
  WITH CHECK (((user_id = auth.uid()) OR ketzal.is_superadmin()));

-- wallet_transactions (scaffold B2C)
CREATE POLICY wallet_txn_select ON ketzal.wallet_transactions AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ketzal.wallets w
  WHERE ((w.id = wallet_transactions.wallet_id) AND ((w.user_id = auth.uid()) OR ketzal.is_superadmin())))));

-- wallets (scaffold B2C)
CREATE POLICY wallets_select ON ketzal.wallets AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()));

-- wishlist_items (scaffold B2C)
CREATE POLICY wishlist_items_select ON ketzal.wishlist_items AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ketzal.wishlists w
  WHERE ((w.id = wishlist_items.wishlist_id) AND ((w.user_id = auth.uid()) OR (w.is_public = true) OR ketzal.is_superadmin())))));
CREATE POLICY wishlist_items_write ON ketzal.wishlist_items AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM ketzal.wishlists w
  WHERE ((w.id = wishlist_items.wishlist_id) AND ((w.user_id = auth.uid()) OR ketzal.is_superadmin())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ketzal.wishlists w
  WHERE ((w.id = wishlist_items.wishlist_id) AND ((w.user_id = auth.uid()) OR ketzal.is_superadmin())))));

-- wishlists (scaffold B2C)
CREATE POLICY wishlists_delete ON ketzal.wishlists AS PERMISSIVE FOR DELETE TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()));
CREATE POLICY wishlists_insert ON ketzal.wishlists AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY wishlists_select ON ketzal.wishlists AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) OR (is_public = true) OR ketzal.is_superadmin()));
CREATE POLICY wishlists_update ON ketzal.wishlists AS PERMISSIVE FOR UPDATE TO public
  USING (((user_id = auth.uid()) OR ketzal.is_superadmin()))
  WITH CHECK (((user_id = auth.uid()) OR ketzal.is_superadmin()));
