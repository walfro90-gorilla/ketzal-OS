-- b075 — Tasas de Mercado Pago en app_settings, para el gross-up del checkout.
--
-- Fase 4: el viajero absorbe el fee de procesamiento de MP (gross-up), para que
-- la agencia reciba su precio menos la comisión de Ketzal, exacto. MP no cobra
-- una tasa fija: varía por método. Se guarda la tasa estándar "al instante"
-- (crédito/débito/SPEI/wallet: 3.49% + $4 + IVA en la cuenta del fundador,
-- 2026-08-29); es exacta para esos métodos y ±pesos para efectivo/cuotas.
-- Ajustable sin deploy.
--
-- pct/fijo son ANTES de IVA; el IVA se aplica sobre ambos. Tasa efectiva =
-- pct*(1+iva/100), fijo efectivo = fijo*(1+iva/100).

alter table ketzal.app_settings
  add column if not exists mp_fee_pct  numeric(6,4) not null default 3.49,
  add column if not exists mp_fee_fijo numeric(8,2) not null default 4.00,
  add column if not exists mp_fee_iva  numeric(5,2) not null default 16.00;

do $$ begin
  alter table ketzal.app_settings
    add constraint mp_fee_pct_chk  check (mp_fee_pct  >= 0 and mp_fee_pct  < 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table ketzal.app_settings
    add constraint mp_fee_fijo_chk check (mp_fee_fijo >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table ketzal.app_settings
    add constraint mp_fee_iva_chk  check (mp_fee_iva  >= 0 and mp_fee_iva  <= 100);
exception when duplicate_object then null; end $$;
