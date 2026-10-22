


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."audit_action" AS ENUM (
    'INVITE_SENT',
    'USER_UPDATED',
    'USER_DELETED',
    'PAYMENT_SUBMITTED',
    'PAYMENT_APPROVED',
    'PAYMENT_REJECTED',
    'LOAN_ASSIGNED',
    'LOAN_UNASSIGNED',
    'PAYMENT_STATUS_UPDATED',
    'TXN_UPDATED',
    'TXN_ARCHIVED',
    'TXN_RESTORED',
    'TXN_IMPORTED',
    'TXN_PURGED',
    'AUDIT_PURGED',
    'LOAN_UPDATED',
    'PAYMENT_DELETED',
    'PAYMENT_LOG_CREATED',
    'PAYMENT_LOG_DELETED',
    'ARBITRAGE_CREATED',
    'ARBITRAGE_DELETED',
    'TRACKED_LOAN_CREATED',
    'TRACKED_LOAN_DELETED',
    'PAYMENT_LOG_UPDATED'
);


ALTER TYPE "public"."audit_action" OWNER TO "postgres";


CREATE TYPE "public"."loan_status" AS ENUM (
    'active',
    'closed'
);


ALTER TYPE "public"."loan_status" OWNER TO "postgres";


CREATE TYPE "public"."loan_txn_type" AS ENUM (
    'installment',
    'straight'
);


ALTER TYPE "public"."loan_txn_type" OWNER TO "postgres";


CREATE TYPE "public"."pay_log_alloc" AS ENUM (
    'Settled',
    'Overpayment',
    'Underpayment',
    'Credited'
);


ALTER TYPE "public"."pay_log_alloc" OWNER TO "postgres";


CREATE TYPE "public"."pay_log_kind" AS ENUM (
    'payment',
    'carry'
);


ALTER TYPE "public"."pay_log_kind" OWNER TO "postgres";


CREATE TYPE "public"."pay_log_method" AS ENUM (
    'GCash',
    'Maya',
    'Bank Transfer',
    'Cash',
    'Manual Credit'
);


ALTER TYPE "public"."pay_log_method" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'GCash',
    'Maya',
    'Bank Transfer',
    'Cash Deposit'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."rate_kind" AS ENUM (
    'borrower',
    'cost'
);


ALTER TYPE "public"."rate_kind" OWNER TO "postgres";


CREATE TYPE "public"."txn_status" AS ENUM (
    'paid',
    'unpaid',
    'refunded',
    'cancelled',
    'past_due'
);


ALTER TYPE "public"."txn_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'user'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."user_status" AS ENUM (
    'invited',
    'active',
    'disabled'
);


ALTER TYPE "public"."user_status" OWNER TO "postgres";


CREATE TYPE "public"."wallet_category" AS ENUM (
    'Cashback',
    'Travel',
    'Rewards'
);


ALTER TYPE "public"."wallet_category" OWNER TO "postgres";


CREATE TYPE "public"."wallet_network" AS ENUM (
    'Visa',
    'Mastercard',
    'Amex',
    'JCB',
    'Discover',
    'Diners Club',
    'UnionPay'
);


ALTER TYPE "public"."wallet_network" OWNER TO "postgres";


CREATE TYPE "public"."wallet_tier" AS ENUM (
    'Classic',
    'Gold',
    'Platinum',
    'Signature',
    'World',
    'World Elite',
    'Infinite',
    'Prestige'
);


ALTER TYPE "public"."wallet_tier" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."loan_disbursements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "disbursement_number" "text" NOT NULL,
    "reference" "text" DEFAULT ''::"text" NOT NULL,
    "request_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "disbursement_date" "date" DEFAULT (("now"() AT TIME ZONE 'Asia/Manila'::"text"))::"date" NOT NULL,
    "agreement_date" "date",
    "loan_account_number" "text" DEFAULT ''::"text" NOT NULL,
    "bank_name" "text" DEFAULT ''::"text" NOT NULL,
    "bank_account_number" "text" DEFAULT ''::"text" NOT NULL,
    "bank_account_name" "text" DEFAULT ''::"text" NOT NULL,
    "total_sanctioned_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "gross_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "percentage_of_total" numeric(7,4) DEFAULT 0 NOT NULL,
    "value_date" "date",
    "processing_fee" numeric(14,2) DEFAULT 0 NOT NULL,
    "notarial_fee" numeric(14,2) DEFAULT 0 NOT NULL,
    "dst" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(14,2) DEFAULT 0 NOT NULL,
    "net_proceeds" numeric(14,2) DEFAULT 0 NOT NULL,
    "disbursement_mode" "text" DEFAULT 'bank_transfer'::"text" NOT NULL,
    "deduction_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "acknowledged_by" "uuid",
    "created_by" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loan_disbursements_disbursement_mode_check" CHECK (("disbursement_mode" = ANY (ARRAY['bank_transfer'::"text", 'check'::"text", 'cash'::"text", 'others'::"text"]))),
    CONSTRAINT "loan_disbursements_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'assigned'::"text"])))
);


ALTER TABLE "public"."loan_disbursements" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."acknowledge_loan_disbursement"("p_id" "uuid") RETURNS "public"."loan_disbursements"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row     public.loan_disbursements;
  v_name    text;
  v_admins  uuid[];
begin
  select * into v_row from public.loan_disbursements
   where id = p_id and user_id = auth.uid();
  if v_row.id is null then
    raise exception 'Disbursement not found.';
  end if;
  if v_row.status <> 'assigned' then
    raise exception 'This disbursement cannot be acknowledged.';
  end if;
  if v_row.acknowledged_at is not null then
    -- Already acknowledged: return as-is (idempotent, no duplicate notification).
    return v_row;
  end if;

  update public.loan_disbursements
     set acknowledged_at = now(), acknowledged_by = auth.uid(), updated_at = now()
   where id = p_id
   returning * into v_row;

  select coalesce(name, 'The borrower') into v_name from public.profiles where id = auth.uid();

  select coalesce(array_agg(id), '{}')
    into v_admins
    from public.profiles
   where role = 'admin' and status <> 'disabled';

  if array_length(v_admins, 1) is not null then
    insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
    values (
      'general',
      '✅ Disbursement Accepted',
      v_name || ' has accepted loan disbursement ' || v_row.disbursement_number
        || ' (net ₱' || to_char(v_row.net_proceeds, 'FM999,999,990.00') || ').',
      'targeted',
      v_admins,
      auth.uid()
    );
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."acknowledge_loan_disbursement"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_my_account"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles set status = 'active'
  where id = auth.uid() and status = 'invited';
$$;


ALTER FUNCTION "public"."activate_my_account"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loan_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference" "text",
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "amount" numeric(16,2) NOT NULL,
    "term_months" integer NOT NULL,
    "monthly_rate" numeric(8,6) NOT NULL,
    "bank_name" "text" NOT NULL,
    "bank_account_number" "text" NOT NULL,
    "bank_account_name" "text" NOT NULL,
    "processing_fee" numeric(16,2) DEFAULT 1500 NOT NULL,
    "notarial_fee" numeric(16,2) DEFAULT 0 NOT NULL,
    "dst" numeric(16,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loan_requests_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "loan_requests_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'pending'::"text", 'coordinating'::"text", 'bank_approved'::"text", 'transfer'::"text", 'completed'::"text", 'declined'::"text", 'canceled'::"text"]))),
    CONSTRAINT "loan_requests_term_months_check" CHECK (("term_months" = ANY (ARRAY[3, 6, 12, 24, 36])))
);


ALTER TABLE "public"."loan_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_my_loan_request"("p_id" "uuid", "p_note" "text") RETURNS "public"."loan_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.loan_requests;
  v_actor text;
begin
  select * into v_row from public.loan_requests
   where id = p_id and user_id = auth.uid();
  if v_row.id is null then
    raise exception 'Loan request not found.';
  end if;
  if v_row.status not in ('submitted','pending','coordinating') then
    raise exception 'This request can no longer be canceled.';
  end if;

  select coalesce(name, 'Borrower') into v_actor from public.profiles where id = auth.uid();

  update public.loan_requests
     set status = 'canceled', updated_at = now()
   where id = p_id
   returning * into v_row;

  insert into public.loan_request_events (request_id, status, note, actor)
  values (p_id, 'canceled', coalesce(p_note, 'Canceled by borrower.'), v_actor);

  return v_row;
end;
$$;


ALTER FUNCTION "public"."cancel_my_loan_request"("p_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "billed_to_name" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "invoice_date" "date" DEFAULT (("now"() AT TIME ZONE 'Asia/Manila'::"text"))::"date" NOT NULL,
    "due_date" "date",
    "selected_due_dates" "date"[] DEFAULT '{}'::"date"[] NOT NULL,
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "amount_paid" numeric(14,2) DEFAULT 0 NOT NULL,
    "processing_fee" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_due" numeric(14,2) DEFAULT 0 NOT NULL,
    "line_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'assigned'::"text", 'upcoming'::"text", 'settled'::"text", 'past_due'::"text", 'partial'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invoice"("p_user_id" "uuid", "p_billed_to_name" "text", "p_due_date" "date", "p_selected_due_dates" "date"[], "p_subtotal" numeric, "p_amount_paid" numeric, "p_processing_fee" numeric, "p_total_due" numeric, "p_line_items" "jsonb") RETURNS "public"."invoices"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year   text := to_char((now() at time zone 'Asia/Manila'), 'YYYY');
  v_seq    int;
  v_number text;
  v_row    public.invoices;
begin
  if not public.is_admin() then
    raise exception 'Not authorized.';
  end if;

  -- Serialize numbering for this year so two generations never collide.
  perform pg_advisory_xact_lock(hashtext('invoice_number_' || v_year));

  select coalesce(max((split_part(invoice_number, '-', 3))::int), 0) + 1
    into v_seq
    from public.invoices
    where invoice_number like 'INV-' || v_year || '-%';

  v_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  insert into public.invoices (
    invoice_number, user_id, billed_to_name, status, invoice_date, due_date,
    selected_due_dates, subtotal, amount_paid, processing_fee, total_due, line_items, created_by
  ) values (
    v_number, p_user_id, p_billed_to_name, 'draft',
    (now() at time zone 'Asia/Manila')::date, p_due_date,
    coalesce(p_selected_due_dates, '{}'), p_subtotal, p_amount_paid, p_processing_fee,
    p_total_due, coalesce(p_line_items, '[]'::jsonb),
    coalesce((select name from public.profiles where id = auth.uid()), '')
  ) returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_invoice"("p_user_id" "uuid", "p_billed_to_name" "text", "p_due_date" "date", "p_selected_due_dates" "date"[], "p_subtotal" numeric, "p_amount_paid" numeric, "p_processing_fee" numeric, "p_total_due" numeric, "p_line_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_loan_disbursement"("p_user_id" "uuid", "p_request_id" "uuid", "p_reference" "text", "p_agreement_date" "date", "p_loan_account_number" "text", "p_bank_name" "text", "p_bank_account_number" "text", "p_bank_account_name" "text", "p_total_sanctioned_amount" numeric, "p_gross_amount" numeric, "p_percentage_of_total" numeric, "p_value_date" "date", "p_disbursement_date" "date", "p_processing_fee" numeric, "p_notarial_fee" numeric, "p_dst" numeric, "p_total_deductions" numeric, "p_net_proceeds" numeric, "p_disbursement_mode" "text", "p_deduction_items" "jsonb") RETURNS "public"."loan_disbursements"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year   text := to_char((now() at time zone 'Asia/Manila'), 'YYYY');
  v_seq    int;
  v_number text;
  v_row    public.loan_disbursements;
begin
  if not public.is_admin() then
    raise exception 'Not authorized.';
  end if;

  -- Serialize numbering for this year so two generations never collide.
  perform pg_advisory_xact_lock(hashtext('disbursement_number_' || v_year));

  select coalesce(max((split_part(disbursement_number, '-', 3))::int), 0) + 1
    into v_seq
    from public.loan_disbursements
    where disbursement_number like 'DISB-' || v_year || '-%';

  v_number := 'DISB-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  insert into public.loan_disbursements (
    disbursement_number, reference, request_id, user_id, status,
    disbursement_date, agreement_date, loan_account_number,
    bank_name, bank_account_number, bank_account_name,
    total_sanctioned_amount, gross_amount, percentage_of_total, value_date,
    processing_fee, notarial_fee, dst, total_deductions, net_proceeds,
    disbursement_mode, deduction_items, created_by
  ) values (
    v_number, coalesce(btrim(p_reference), ''), p_request_id, p_user_id, 'draft',
    coalesce(p_disbursement_date, (now() at time zone 'Asia/Manila')::date),
    p_agreement_date, coalesce(btrim(p_loan_account_number), ''),
    coalesce(btrim(p_bank_name), ''), coalesce(btrim(p_bank_account_number), ''),
    coalesce(btrim(p_bank_account_name), ''),
    coalesce(p_total_sanctioned_amount, 0), coalesce(p_gross_amount, 0),
    coalesce(p_percentage_of_total, 0), p_value_date,
    coalesce(p_processing_fee, 0), coalesce(p_notarial_fee, 0), coalesce(p_dst, 0),
    coalesce(p_total_deductions, 0), coalesce(p_net_proceeds, 0),
    coalesce(p_disbursement_mode, 'bank_transfer'),
    coalesce(p_deduction_items, '[]'::jsonb),
    coalesce((select name from public.profiles where id = auth.uid()), '')
  ) returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_loan_disbursement"("p_user_id" "uuid", "p_request_id" "uuid", "p_reference" "text", "p_agreement_date" "date", "p_loan_account_number" "text", "p_bank_name" "text", "p_bank_account_number" "text", "p_bank_account_name" "text", "p_total_sanctioned_amount" numeric, "p_gross_amount" numeric, "p_percentage_of_total" numeric, "p_value_date" "date", "p_disbursement_date" "date", "p_processing_fee" numeric, "p_notarial_fee" numeric, "p_dst" numeric, "p_total_deductions" numeric, "p_net_proceeds" numeric, "p_disbursement_mode" "text", "p_deduction_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles set id = new.id
  where email = new.email and id <> new.id;

  if not found then
    insert into public.profiles (id, name, email, phone, role, status, invited_at)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      new.email,
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      case when not exists (select 1 from public.profiles where role = 'admin')
           then 'admin'::public.user_role else 'user'::public.user_role end,
      'invited',
      current_date
    )
    on conflict (id) do nothing;
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_signin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles set last_login = new.last_sign_in_at where id = new.id;
  return new;
end $$;


ALTER FUNCTION "public"."handle_user_signin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status <> 'disabled'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_admins"("p_category" "text", "p_title" "text", "p_body" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_admins uuid[];
  v_cat    text := coalesce(p_category, 'general');
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'Notification body is required.';
  end if;
  if v_cat not in ('payment', 'document', 'account', 'general') then
    v_cat := 'general';
  end if;

  select coalesce(array_agg(id), '{}')
    into v_admins
    from public.profiles
   where role = 'admin' and status <> 'disabled';

  if array_length(v_admins, 1) is not null then
    insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
    values (v_cat, coalesce(p_title, ''), p_body, 'targeted', v_admins, auth.uid());
  end if;
end;
$$;


ALTER FUNCTION "public"."notify_admins"("p_category" "text", "p_title" "text", "p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_loan_request_received"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
  values (
    'general',
    '📝 Loan Request Received',
    'Your loan request for ₱'
      || to_char(new.amount, 'FM999,999,999,999,990.00')
      || ' has been received. You can track the real-time status of your application at any time under your My Loan Requests tab.',
    'targeted',
    array[new.user_id],
    new.user_id
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_loan_request_received"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_payment_received"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
  values (
    'payment',
    '💰 Payment Received',
    'Your payment of ₱'
      || to_char(new.amount, 'FM999,999,999,990.00')
      || ' has been received successfully. Thank you!',
    'targeted',
    array[new.user_id],
    new.user_id
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_payment_received"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_loan_request_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.reference is null then
    new.reference := 'LOAN-' || to_char(now(), 'YYYYMMDD') || '-'
      || lpad(nextval('public.loan_request_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_loan_request_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_avatar"("p_path" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles set avatar_path = p_path where id = auth.uid();
$$;


ALTER FUNCTION "public"."set_my_avatar"("p_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_transaction_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.id := coalesce(new.id, new.loan_id || '-' || new.n);
  return new;
end $$;


ALTER FUNCTION "public"."set_transaction_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_loan_request"("p_amount" numeric, "p_term" integer, "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") RETURNS "public"."loan_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rate numeric(8,6);
  v_notarial numeric(16,2);
  v_dst numeric(16,2);
  v_actor text;
  v_row public.loan_requests;
begin
  if not exists (
    select 1 from public.loan_request_access a
    where a.user_id = auth.uid() and a.enabled
  ) then
    raise exception 'Loan requests are not enabled for this account.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'A valid loan amount is required.';
  end if;

  select monthly_rate into v_rate from public.loan_request_rates where term_months = p_term;
  if v_rate is null then
    raise exception 'Unsupported loan term: %', p_term;
  end if;

  -- Notarial + DST auto-apply only at ₱500k or more (admin can override later).
  v_notarial := case when p_amount >= 500000 then round(p_amount * 0.0035, 2) else 0 end;
  v_dst := case when p_amount >= 500000 then ceil(p_amount / 200) * 1.5 else 0 end;
  select coalesce(name, 'Borrower') into v_actor from public.profiles where id = auth.uid();

  insert into public.loan_requests (
    user_id, amount, term_months, monthly_rate,
    bank_name, bank_account_number, bank_account_name,
    processing_fee, notarial_fee, dst, status
  ) values (
    auth.uid(), p_amount, p_term, v_rate,
    btrim(p_bank_name), btrim(p_account_number), btrim(p_account_name),
    1500, v_notarial, v_dst, 'submitted'
  ) returning * into v_row;

  insert into public.loan_request_events (request_id, status, note, actor)
  values (
    v_row.id, 'submitted',
    'Your application has been successfully received and is now waiting to be picked up for processing.',
    v_actor
  );

  return v_row;
end;
$$;


ALTER FUNCTION "public"."submit_loan_request"("p_amount" numeric, "p_term" integer, "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_loan_request_status"("p_id" "uuid", "p_status" "text", "p_note" "text") RETURNS "public"."loan_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.loan_requests;
  v_actor text;
begin
  if not public.is_admin() then
    raise exception 'Not authorized.';
  end if;
  if p_status not in ('submitted','pending','coordinating','bank_approved',
                      'transfer','completed','declined','canceled') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select coalesce(name, 'Admin') into v_actor from public.profiles where id = auth.uid();

  update public.loan_requests
     set status = p_status, updated_at = now()
   where id = p_id
   returning * into v_row;
  if v_row.id is null then
    raise exception 'Loan request not found.';
  end if;

  insert into public.loan_request_events (request_id, status, note, actor)
  values (p_id, p_status, coalesce(p_note, ''), v_actor);

  return v_row;
end;
$$;


ALTER FUNCTION "public"."update_loan_request_status"("p_id" "uuid", "p_status" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_loan_request_bank"("p_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") RETURNS "public"."loan_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.loan_requests;
begin
  select * into v_row from public.loan_requests
   where id = p_id and user_id = auth.uid();
  if v_row.id is null then
    raise exception 'Loan request not found.';
  end if;
  if v_row.status in ('completed','declined','canceled') then
    raise exception 'Bank details can no longer be edited for this request.';
  end if;
  if p_bank_name is null or btrim(p_bank_name) = ''
     or p_account_number is null or btrim(p_account_number) = ''
     or p_account_name is null or btrim(p_account_name) = '' then
    raise exception 'All bank fields are required.';
  end if;

  update public.loan_requests
     set bank_name = btrim(p_bank_name),
         bank_account_number = btrim(p_account_number),
         bank_account_name = btrim(p_account_name),
         updated_at = now()
   where id = p_id
   returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."update_my_loan_request_bank"("p_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_profile"("p_first" "text", "p_last" "text", "p_nickname" "text", "p_phone" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles
  set first_name = btrim(p_first),
      last_name  = btrim(p_last),
      nickname   = btrim(p_nickname),
      phone      = btrim(p_phone),
      name       = coalesce(nullif(btrim(p_nickname), ''),
                            nullif(btrim(btrim(p_first) || ' ' || btrim(p_last)), ''),
                            name)
  where id = auth.uid();
$$;


ALTER FUNCTION "public"."update_my_profile"("p_first" "text", "p_last" "text", "p_nickname" "text", "p_phone" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" DEFAULT 'toast'::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcement_templates_type_check" CHECK (("type" = ANY (ARRAY['toast'::"text", 'banner'::"text"])))
);


ALTER TABLE "public"."announcement_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" NOT NULL,
    "audience" "text" DEFAULT 'all'::"text" NOT NULL,
    "target_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "one_time" boolean DEFAULT false NOT NULL,
    CONSTRAINT "announcements_audience_check" CHECK (("audience" = ANY (ARRAY['all'::"text", 'targeted'::"text"]))),
    CONSTRAINT "announcements_body_check" CHECK (("length"("btrim"("body")) > 0)),
    CONSTRAINT "announcements_type_check" CHECK (("type" = ANY (ARRAY['toast'::"text", 'banner'::"text"])))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arbitrage_loans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "principal" numeric(12,2) NOT NULL,
    "txn_date" "date" NOT NULL,
    "first_payment_date" "date" NOT NULL,
    "duration_months" integer NOT NULL,
    "last_payment_date" "date" NOT NULL,
    "borrower_rate" numeric(6,4) DEFAULT 0 NOT NULL,
    "cost_rate" numeric(6,4) DEFAULT 0 NOT NULL,
    "dst" numeric(12,2) DEFAULT 0 NOT NULL,
    "processing_fee" numeric(12,2) DEFAULT 1500 NOT NULL,
    "notarial_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "arbitrage_loans_dst_check" CHECK (("dst" >= (0)::numeric)),
    CONSTRAINT "arbitrage_loans_duration_months_check" CHECK ((("duration_months" >= 1) AND ("duration_months" <= 600))),
    CONSTRAINT "arbitrage_loans_notarial_fee_check" CHECK (("notarial_fee" >= (0)::numeric)),
    CONSTRAINT "arbitrage_loans_principal_check" CHECK (("principal" > (0)::numeric)),
    CONSTRAINT "arbitrage_loans_processing_fee_check" CHECK (("processing_fee" >= (0)::numeric))
);


ALTER TABLE "public"."arbitrage_loans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor" "text" NOT NULL,
    "action" "public"."audit_action" NOT NULL,
    "detail" "text" NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."interest_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "public"."rate_kind" NOT NULL,
    "rate" numeric(6,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interest_rates_rate_check" CHECK (("rate" >= (0)::numeric))
);


ALTER TABLE "public"."interest_rates" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."loan_id_seq"
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."loan_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loan_request_access" (
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loan_request_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loan_request_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "actor" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loan_request_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loan_request_rates" (
    "term_months" integer NOT NULL,
    "monthly_rate" numeric(8,6) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loan_request_rates_monthly_rate_check" CHECK (("monthly_rate" >= (0)::numeric)),
    CONSTRAINT "loan_request_rates_term_months_check" CHECK (("term_months" = ANY (ARRAY[3, 6, 12, 24, 36])))
);


ALTER TABLE "public"."loan_request_rates" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."loan_request_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."loan_request_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loans" (
    "id" "text" DEFAULT ('ln-'::"text" || "nextval"('"public"."loan_id_seq"'::"regclass")) NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "txn_type" "public"."loan_txn_type" DEFAULT 'installment'::"public"."loan_txn_type" NOT NULL,
    "principal" numeric(12,2) NOT NULL,
    "monthly_rate" numeric(8,6) DEFAULT 0 NOT NULL,
    "duration_months" integer NOT NULL,
    "txn_date" "date" NOT NULL,
    "first_payment_date" "date" NOT NULL,
    "dst" numeric(12,2) DEFAULT 0 NOT NULL,
    "processing_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "notarial_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "deduct_from_proceeds" boolean DEFAULT true NOT NULL,
    "status" "public"."loan_status" DEFAULT 'active'::"public"."loan_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loans_dst_check" CHECK (("dst" >= (0)::numeric)),
    CONSTRAINT "loans_duration_months_check" CHECK ((("duration_months" >= 1) AND ("duration_months" <= 60))),
    CONSTRAINT "loans_monthly_rate_check" CHECK (("monthly_rate" >= (0)::numeric)),
    CONSTRAINT "loans_notarial_fee_check" CHECK (("notarial_fee" >= (0)::numeric)),
    CONSTRAINT "loans_principal_check" CHECK (("principal" <> (0)::numeric)),
    CONSTRAINT "loans_processing_fee_check" CHECK (("processing_fee" >= (0)::numeric)),
    CONSTRAINT "straight_is_single_payment" CHECK ((("txn_type" <> 'straight'::"public"."loan_txn_type") OR ("duration_months" = 1)))
);


ALTER TABLE "public"."loans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "borrower_id" "uuid" NOT NULL,
    "sender_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "from_admin" boolean NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "reactions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    CONSTRAINT "messages_body_check" CHECK (("length"("btrim"("body")) > 0))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_reads" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_templates_category_check" CHECK (("category" = ANY (ARRAY['payment'::"text", 'document'::"text", 'account'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."notification_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" NOT NULL,
    "audience" "text" DEFAULT 'all'::"text" NOT NULL,
    "target_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_audience_check" CHECK (("audience" = ANY (ARRAY['all'::"text", 'targeted'::"text"]))),
    CONSTRAINT "notifications_body_check" CHECK (("length"("btrim"("body")) > 0)),
    CONSTRAINT "notifications_category_check" CHECK (("category" = ANY (ARRAY['payment'::"text", 'document'::"text", 'account'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_due_overrides" (
    "borrower_id" "uuid" NOT NULL,
    "due_dates" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "next_due_dates" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."payment_due_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "public"."pay_log_kind" DEFAULT 'payment'::"public"."pay_log_kind" NOT NULL,
    "txn_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "reference" "text" DEFAULT ''::"text" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "due_date" "date",
    "amount_owed" numeric(12,2) DEFAULT 0 NOT NULL,
    "method" "public"."pay_log_method",
    "funds_applied" numeric(12,2) DEFAULT 0 NOT NULL,
    "remaining_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "alloc_status" "public"."pay_log_alloc" DEFAULT 'Settled'::"public"."pay_log_alloc" NOT NULL,
    "carry_applied" numeric(12,2) DEFAULT 0 NOT NULL,
    "parent_id" "uuid",
    "consumed" boolean DEFAULT false NOT NULL,
    "consumed_by" "uuid",
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "loan_id" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "method" "public"."payment_method" NOT NULL,
    "reference" "text" DEFAULT '—'::"text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "submitted_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "reviewed_at" "date",
    "note" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payments_file_type_check" CHECK (("file_type" = ANY (ARRAY['image'::"text", 'pdf'::"text"]))),
    CONSTRAINT "rejection_requires_note" CHECK ((("status" <> 'rejected'::"public"."payment_status") OR ("note" <> ''::"text")))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "status" "public"."user_status" DEFAULT 'invited'::"public"."user_status" NOT NULL,
    "invited_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "last_login" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_name" "text" DEFAULT ''::"text" NOT NULL,
    "last_name" "text" DEFAULT ''::"text" NOT NULL,
    "nickname" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_path" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracked_loans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bank_name" "text" NOT NULL,
    "bank_acronym" "text" DEFAULT ''::"text" NOT NULL,
    "bank_color" "text" DEFAULT '#1e3a8a'::"text" NOT NULL,
    "bank_domain" "text" DEFAULT ''::"text" NOT NULL,
    "principal" numeric(12,2) NOT NULL,
    "processing_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "monthly_rate" numeric(6,4) DEFAULT 0 NOT NULL,
    "duration_months" integer NOT NULL,
    "txn_date" "date" NOT NULL,
    "first_payment_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tracked_loans_duration_months_check" CHECK ((("duration_months" >= 1) AND ("duration_months" <= 600))),
    CONSTRAINT "tracked_loans_principal_check" CHECK (("principal" > (0)::numeric)),
    CONSTRAINT "tracked_loans_processing_fee_check" CHECK (("processing_fee" >= (0)::numeric))
);


ALTER TABLE "public"."tracked_loans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "text" NOT NULL,
    "loan_id" "text",
    "user_id" "uuid" NOT NULL,
    "n" integer NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "type" "text" NOT NULL,
    "txn_date" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "public"."txn_status" DEFAULT 'unpaid'::"public"."txn_status" NOT NULL,
    "date_paid" "date",
    "archived_at" "date",
    CONSTRAINT "date_paid_matches_status" CHECK (((("status" = 'paid'::"public"."txn_status") AND ("date_paid" IS NOT NULL)) OR ("status" = 'refunded'::"public"."txn_status") OR (("status" = ANY (ARRAY['unpaid'::"public"."txn_status", 'cancelled'::"public"."txn_status", 'past_due'::"public"."txn_status"])) AND ("date_paid" IS NULL)))),
    CONSTRAINT "transactions_amount_check" CHECK (("amount" <> (0)::numeric)),
    CONSTRAINT "transactions_n_check" CHECK (("n" >= 1)),
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['Installment'::"text", 'Straight'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."transactions_effective" WITH ("security_invoker"='true') AS
 SELECT "id",
    "loan_id",
    "user_id",
    "n",
    "description",
    "amount",
    "type",
    "txn_date",
    "due_date",
    "status",
    "date_paid",
    "archived_at",
        CASE
            WHEN (("status" = 'unpaid'::"public"."txn_status") AND ("due_date" < CURRENT_DATE)) THEN 'past_due'::"text"
            ELSE ("status")::"text"
        END AS "effective_status"
   FROM "public"."transactions" "t";


ALTER VIEW "public"."transactions_effective" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_account_txns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "amount" numeric(16,2) NOT NULL,
    "merchant" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "txn_date" "date",
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_account_txns_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "wallet_account_txns_kind_check" CHECK (("kind" = ANY (ARRAY['expense'::"text", 'income'::"text"])))
);


ALTER TABLE "public"."wallet_account_txns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "account_number" "text" DEFAULT ''::"text" NOT NULL,
    "product_type" "text" DEFAULT ''::"text" NOT NULL,
    "bank_name" "text" DEFAULT ''::"text" NOT NULL,
    "bank_code" "text" DEFAULT ''::"text" NOT NULL,
    "swift_code" "text" DEFAULT ''::"text" NOT NULL,
    "branch" "text" DEFAULT ''::"text" NOT NULL,
    "ownership" "text" DEFAULT ''::"text" NOT NULL,
    "available_balance" numeric(16,2) DEFAULT 0 NOT NULL,
    "maintaining_balance" numeric(16,2) DEFAULT 0 NOT NULL,
    "debit_card_number" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_accounts_maintaining_balance_check" CHECK (("maintaining_balance" >= (0)::numeric))
);


ALTER TABLE "public"."wallet_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "card_id" "uuid" NOT NULL,
    "amount_due" numeric(14,2) NOT NULL,
    "due_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_bills_amount_due_check" CHECK (("amount_due" >= (0)::numeric))
);


ALTER TABLE "public"."wallet_bills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "bank_name" "text" DEFAULT ''::"text" NOT NULL,
    "bank_logo" "text",
    "primary_color" "text" DEFAULT '#1e3a8a'::"text" NOT NULL,
    "secondary_color" "text" DEFAULT '#0ea5e9'::"text" NOT NULL,
    "first6" "text" DEFAULT ''::"text" NOT NULL,
    "last4" "text" DEFAULT ''::"text" NOT NULL,
    "network" "public"."wallet_network" DEFAULT 'Visa'::"public"."wallet_network" NOT NULL,
    "tier" "public"."wallet_tier" DEFAULT 'Classic'::"public"."wallet_tier" NOT NULL,
    "category" "public"."wallet_category",
    "credit_limit" numeric(14,2) DEFAULT 0 NOT NULL,
    "available_limit" numeric(14,2) DEFAULT 0 NOT NULL,
    "statement_date" "text" DEFAULT ''::"text" NOT NULL,
    "due_date" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "network_logo" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "naffl" boolean DEFAULT false NOT NULL,
    "amf" numeric(14,2) DEFAULT 0 NOT NULL,
    "amf_date" "date",
    "expiry_date" "date",
    "activation_date" "date",
    CONSTRAINT "wallet_cards_amf_check" CHECK (("amf" >= (0)::numeric)),
    CONSTRAINT "wallet_cards_credit_limit_check" CHECK (("credit_limit" >= (0)::numeric))
);


ALTER TABLE "public"."wallet_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "bill_id" "uuid" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "paid_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "account_id" "uuid",
    CONSTRAINT "wallet_payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."wallet_payments" OWNER TO "postgres";


ALTER TABLE ONLY "public"."announcement_templates"
    ADD CONSTRAINT "announcement_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."arbitrage_loans"
    ADD CONSTRAINT "arbitrage_loans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_rates"
    ADD CONSTRAINT "interest_rates_kind_rate_key" UNIQUE ("kind", "rate");



ALTER TABLE ONLY "public"."interest_rates"
    ADD CONSTRAINT "interest_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loan_disbursements"
    ADD CONSTRAINT "loan_disbursements_disbursement_number_key" UNIQUE ("disbursement_number");



ALTER TABLE ONLY "public"."loan_disbursements"
    ADD CONSTRAINT "loan_disbursements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loan_request_access"
    ADD CONSTRAINT "loan_request_access_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."loan_request_events"
    ADD CONSTRAINT "loan_request_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loan_request_rates"
    ADD CONSTRAINT "loan_request_rates_pkey" PRIMARY KEY ("term_months");



ALTER TABLE ONLY "public"."loan_requests"
    ADD CONSTRAINT "loan_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loan_requests"
    ADD CONSTRAINT "loan_requests_reference_key" UNIQUE ("reference");



ALTER TABLE ONLY "public"."loans"
    ADD CONSTRAINT "loans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id", "user_id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_due_overrides"
    ADD CONSTRAINT "payment_due_overrides_pkey" PRIMARY KEY ("borrower_id");



ALTER TABLE ONLY "public"."payment_logs"
    ADD CONSTRAINT "payment_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracked_loans"
    ADD CONSTRAINT "tracked_loans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_loan_id_n_key" UNIQUE ("loan_id", "n");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_account_txns"
    ADD CONSTRAINT "wallet_account_txns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_accounts"
    ADD CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_bills"
    ADD CONSTRAINT "wallet_bills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_cards"
    ADD CONSTRAINT "wallet_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_payments"
    ADD CONSTRAINT "wallet_payments_pkey" PRIMARY KEY ("id");



CREATE INDEX "announcements_expiry_idx" ON "public"."announcements" USING "btree" ("expires_at");



CREATE INDEX "arbitrage_loans_user_id_idx" ON "public"."arbitrage_loans" USING "btree" ("user_id");



CREATE INDEX "audit_log_at_idx" ON "public"."audit_log" USING "btree" ("at" DESC);



CREATE INDEX "invoices_status_idx" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "invoices_user_id_idx" ON "public"."invoices" USING "btree" ("user_id");



CREATE INDEX "loan_disbursements_request_idx" ON "public"."loan_disbursements" USING "btree" ("request_id");



CREATE INDEX "loan_disbursements_status_idx" ON "public"."loan_disbursements" USING "btree" ("status");



CREATE INDEX "loan_disbursements_user_id_idx" ON "public"."loan_disbursements" USING "btree" ("user_id");



CREATE INDEX "loan_request_events_request_idx" ON "public"."loan_request_events" USING "btree" ("request_id", "created_at");



CREATE INDEX "loan_requests_status_idx" ON "public"."loan_requests" USING "btree" ("status");



CREATE INDEX "loan_requests_user_idx" ON "public"."loan_requests" USING "btree" ("user_id");



CREATE INDEX "loans_user_id_idx" ON "public"."loans" USING "btree" ("user_id");



CREATE INDEX "messages_borrower_idx" ON "public"."messages" USING "btree" ("borrower_id", "created_at");



CREATE INDEX "messages_unread_idx" ON "public"."messages" USING "btree" ("borrower_id", "from_admin") WHERE ("read_at" IS NULL);



CREATE INDEX "notification_reads_user_idx" ON "public"."notification_reads" USING "btree" ("user_id");



CREATE INDEX "notification_templates_created_idx" ON "public"."notification_templates" USING "btree" ("created_at" DESC);



CREATE INDEX "notifications_created_idx" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "payment_logs_created_at_idx" ON "public"."payment_logs" USING "btree" ("created_at");



CREATE INDEX "payment_logs_user_id_idx" ON "public"."payment_logs" USING "btree" ("user_id");



CREATE INDEX "payments_status_idx" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "payments_user_id_idx" ON "public"."payments" USING "btree" ("user_id");



CREATE INDEX "tracked_loans_created_at_idx" ON "public"."tracked_loans" USING "btree" ("created_at");



CREATE INDEX "transactions_due_date_idx" ON "public"."transactions" USING "btree" ("due_date");



CREATE INDEX "transactions_loan_id_idx" ON "public"."transactions" USING "btree" ("loan_id");



CREATE INDEX "transactions_status_idx" ON "public"."transactions" USING "btree" ("status");



CREATE INDEX "transactions_user_id_idx" ON "public"."transactions" USING "btree" ("user_id");



CREATE INDEX "wallet_account_txns_account_idx" ON "public"."wallet_account_txns" USING "btree" ("account_id");



CREATE INDEX "wallet_account_txns_owner_idx" ON "public"."wallet_account_txns" USING "btree" ("owner_id");



CREATE INDEX "wallet_accounts_owner_idx" ON "public"."wallet_accounts" USING "btree" ("owner_id");



CREATE INDEX "wallet_bills_card_idx" ON "public"."wallet_bills" USING "btree" ("card_id");



CREATE INDEX "wallet_bills_owner_idx" ON "public"."wallet_bills" USING "btree" ("owner_id");



CREATE INDEX "wallet_cards_owner_idx" ON "public"."wallet_cards" USING "btree" ("owner_id");



CREATE INDEX "wallet_payments_bill_idx" ON "public"."wallet_payments" USING "btree" ("bill_id");



CREATE INDEX "wallet_payments_owner_idx" ON "public"."wallet_payments" USING "btree" ("owner_id");



CREATE OR REPLACE TRIGGER "loan_requests_notify_received" AFTER INSERT ON "public"."loan_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_loan_request_received"();



CREATE OR REPLACE TRIGGER "loan_requests_set_reference" BEFORE INSERT ON "public"."loan_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_loan_request_reference"();



CREATE OR REPLACE TRIGGER "payments_notify_received" AFTER INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_payment_received"();



CREATE OR REPLACE TRIGGER "transactions_set_id" BEFORE INSERT ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_transaction_id"();



ALTER TABLE ONLY "public"."arbitrage_loans"
    ADD CONSTRAINT "arbitrage_loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loan_disbursements"
    ADD CONSTRAINT "loan_disbursements_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loan_disbursements"
    ADD CONSTRAINT "loan_disbursements_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."loan_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loan_disbursements"
    ADD CONSTRAINT "loan_disbursements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loan_request_access"
    ADD CONSTRAINT "loan_request_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loan_request_events"
    ADD CONSTRAINT "loan_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."loan_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loan_requests"
    ADD CONSTRAINT "loan_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loans"
    ADD CONSTRAINT "loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_logs"
    ADD CONSTRAINT "payment_logs_consumed_by_fkey" FOREIGN KEY ("consumed_by") REFERENCES "public"."payment_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_logs"
    ADD CONSTRAINT "payment_logs_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."payment_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_logs"
    ADD CONSTRAINT "payment_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_account_txns"
    ADD CONSTRAINT "wallet_account_txns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_bills"
    ADD CONSTRAINT "wallet_bills_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."wallet_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_payments"
    ADD CONSTRAINT "wallet_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_payments"
    ADD CONSTRAINT "wallet_payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."wallet_bills"("id") ON DELETE CASCADE;



ALTER TABLE "public"."announcement_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "announcement_templates: admin all" ON "public"."announcement_templates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role")))));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "announcements: admin all" ON "public"."announcements" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "announcements: read active" ON "public"."announcements" FOR SELECT TO "authenticated" USING (((("starts_at" IS NULL) OR ("starts_at" <= "now"())) AND (("expires_at" IS NULL) OR ("expires_at" > "now"())) AND (("audience" = 'all'::"text") OR ("auth"."uid"() = ANY ("target_user_ids")))));



CREATE POLICY "announcements: recipient consume one-time" ON "public"."announcements" FOR DELETE TO "authenticated" USING ((("one_time" = true) AND ("audience" = 'targeted'::"text") AND ("auth"."uid"() = ANY ("target_user_ids"))));



ALTER TABLE "public"."arbitrage_loans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arbitrage_loans: admin only" ON "public"."arbitrage_loans" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "audit: admin delete" ON "public"."audit_log" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "audit: admin read" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "audit: authenticated append" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "disbursements: admin delete" ON "public"."loan_disbursements" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "disbursements: admin insert" ON "public"."loan_disbursements" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "disbursements: admin update" ON "public"."loan_disbursements" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "disbursements: read own assigned or admin" ON "public"."loan_disbursements" FOR SELECT TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND ("status" = 'assigned'::"text")) OR "public"."is_admin"()));



ALTER TABLE "public"."interest_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interest_rates: admin only" ON "public"."interest_rates" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices: admin delete" ON "public"."invoices" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "invoices: admin insert" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "invoices: admin update" ON "public"."invoices" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "invoices: read own assigned or admin" ON "public"."invoices" FOR SELECT TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND ("status" <> 'draft'::"text")) OR "public"."is_admin"()));



CREATE POLICY "loan access: admin write" ON "public"."loan_request_access" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loan access: read own or admin" ON "public"."loan_request_access" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "loan events: read own or admin" ON "public"."loan_request_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."loan_requests" "r"
  WHERE (("r"."id" = "loan_request_events"."request_id") AND (("r"."user_id" = "auth"."uid"()) OR "public"."is_admin"())))));



CREATE POLICY "loan rates: admin write" ON "public"."loan_request_rates" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loan rates: read all" ON "public"."loan_request_rates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "loan requests: admin delete" ON "public"."loan_requests" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "loan requests: admin update" ON "public"."loan_requests" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loan requests: read own or admin" ON "public"."loan_requests" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."loan_disbursements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loan_request_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loan_request_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loan_request_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loan_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loans: admin write" ON "public"."loans" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loans: read own or admin" ON "public"."loans" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages: admin all" ON "public"."messages" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "messages: borrower delete own" ON "public"."messages" FOR DELETE TO "authenticated" USING (("borrower_id" = "auth"."uid"()));



CREATE POLICY "messages: borrower mark read" ON "public"."messages" FOR UPDATE TO "authenticated" USING (("borrower_id" = "auth"."uid"())) WITH CHECK (("borrower_id" = "auth"."uid"()));



CREATE POLICY "messages: borrower read own" ON "public"."messages" FOR SELECT TO "authenticated" USING (("borrower_id" = "auth"."uid"()));



CREATE POLICY "messages: borrower send own" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("borrower_id" = "auth"."uid"()) AND ("from_admin" = false)));



ALTER TABLE "public"."notification_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_reads: admin read" ON "public"."notification_reads" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "notification_reads: own delete" ON "public"."notification_reads" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_reads: own read" ON "public"."notification_reads" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_reads: own write" ON "public"."notification_reads" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_templates: admin all" ON "public"."notification_templates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role")))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications: admin all" ON "public"."notifications" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "notifications: read own" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("audience" = 'all'::"text") OR ("auth"."uid"() = ANY ("target_user_ids"))));



CREATE POLICY "notifications: self insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("audience" = 'targeted'::"text") AND ("target_user_ids" = ARRAY["auth"."uid"()])));



ALTER TABLE "public"."payment_due_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_due_overrides: admin write" ON "public"."payment_due_overrides" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "payment_due_overrides: read for authenticated" ON "public"."payment_due_overrides" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."payment_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_logs: admin write" ON "public"."payment_logs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "payment_logs: read own or admin" ON "public"."payment_logs" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments: admin delete" ON "public"."payments" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "payments: admin update" ON "public"."payments" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "payments: borrower delete own" ON "public"."payments" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "payments: borrower submit own pending" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK (((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"public"."payment_status")) OR "public"."is_admin"()));



CREATE POLICY "payments: read own or admin" ON "public"."payments" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: admin delete" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "profiles: admin insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles: admin update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "profiles: read own or admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "profiles: read the lender" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("role" = 'admin'::"public"."user_role"));



ALTER TABLE "public"."tracked_loans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tracked_loans: admin only" ON "public"."tracked_loans" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions: admin write" ON "public"."transactions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "transactions: read own active or admin" ON "public"."transactions" FOR SELECT TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND ("archived_at" IS NULL)) OR "public"."is_admin"()));



ALTER TABLE "public"."wallet_account_txns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_account_txns: own" ON "public"."wallet_account_txns" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."wallet_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_accounts: own" ON "public"."wallet_accounts" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."wallet_bills" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_bills: own" ON "public"."wallet_bills" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."wallet_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_cards: own" ON "public"."wallet_cards" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."wallet_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_payments: own" ON "public"."wallet_payments" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."loan_disbursements" TO "anon";
GRANT ALL ON TABLE "public"."loan_disbursements" TO "authenticated";
GRANT ALL ON TABLE "public"."loan_disbursements" TO "service_role";



GRANT ALL ON FUNCTION "public"."acknowledge_loan_disbursement"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."acknowledge_loan_disbursement"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acknowledge_loan_disbursement"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_my_account"() TO "anon";
GRANT ALL ON FUNCTION "public"."activate_my_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_my_account"() TO "service_role";



GRANT ALL ON TABLE "public"."loan_requests" TO "anon";
GRANT ALL ON TABLE "public"."loan_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."loan_requests" TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_my_loan_request"("p_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_my_loan_request"("p_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_my_loan_request"("p_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_invoice"("p_user_id" "uuid", "p_billed_to_name" "text", "p_due_date" "date", "p_selected_due_dates" "date"[], "p_subtotal" numeric, "p_amount_paid" numeric, "p_processing_fee" numeric, "p_total_due" numeric, "p_line_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_invoice"("p_user_id" "uuid", "p_billed_to_name" "text", "p_due_date" "date", "p_selected_due_dates" "date"[], "p_subtotal" numeric, "p_amount_paid" numeric, "p_processing_fee" numeric, "p_total_due" numeric, "p_line_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_invoice"("p_user_id" "uuid", "p_billed_to_name" "text", "p_due_date" "date", "p_selected_due_dates" "date"[], "p_subtotal" numeric, "p_amount_paid" numeric, "p_processing_fee" numeric, "p_total_due" numeric, "p_line_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_loan_disbursement"("p_user_id" "uuid", "p_request_id" "uuid", "p_reference" "text", "p_agreement_date" "date", "p_loan_account_number" "text", "p_bank_name" "text", "p_bank_account_number" "text", "p_bank_account_name" "text", "p_total_sanctioned_amount" numeric, "p_gross_amount" numeric, "p_percentage_of_total" numeric, "p_value_date" "date", "p_disbursement_date" "date", "p_processing_fee" numeric, "p_notarial_fee" numeric, "p_dst" numeric, "p_total_deductions" numeric, "p_net_proceeds" numeric, "p_disbursement_mode" "text", "p_deduction_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_loan_disbursement"("p_user_id" "uuid", "p_request_id" "uuid", "p_reference" "text", "p_agreement_date" "date", "p_loan_account_number" "text", "p_bank_name" "text", "p_bank_account_number" "text", "p_bank_account_name" "text", "p_total_sanctioned_amount" numeric, "p_gross_amount" numeric, "p_percentage_of_total" numeric, "p_value_date" "date", "p_disbursement_date" "date", "p_processing_fee" numeric, "p_notarial_fee" numeric, "p_dst" numeric, "p_total_deductions" numeric, "p_net_proceeds" numeric, "p_disbursement_mode" "text", "p_deduction_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_loan_disbursement"("p_user_id" "uuid", "p_request_id" "uuid", "p_reference" "text", "p_agreement_date" "date", "p_loan_account_number" "text", "p_bank_name" "text", "p_bank_account_number" "text", "p_bank_account_name" "text", "p_total_sanctioned_amount" numeric, "p_gross_amount" numeric, "p_percentage_of_total" numeric, "p_value_date" "date", "p_disbursement_date" "date", "p_processing_fee" numeric, "p_notarial_fee" numeric, "p_dst" numeric, "p_total_deductions" numeric, "p_net_proceeds" numeric, "p_disbursement_mode" "text", "p_deduction_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_signin"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_signin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_signin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_admins"("p_category" "text", "p_title" "text", "p_body" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_admins"("p_category" "text", "p_title" "text", "p_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_admins"("p_category" "text", "p_title" "text", "p_body" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_loan_request_received"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_loan_request_received"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_loan_request_received"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_payment_received"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_payment_received"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_payment_received"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_loan_request_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_loan_request_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_loan_request_reference"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_my_avatar"("p_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_my_avatar"("p_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_avatar"("p_path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_transaction_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_transaction_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_transaction_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_loan_request"("p_amount" numeric, "p_term" integer, "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_loan_request"("p_amount" numeric, "p_term" integer, "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_loan_request"("p_amount" numeric, "p_term" integer, "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_loan_request_status"("p_id" "uuid", "p_status" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_loan_request_status"("p_id" "uuid", "p_status" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_loan_request_status"("p_id" "uuid", "p_status" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_my_loan_request_bank"("p_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_my_loan_request_bank"("p_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_loan_request_bank"("p_id" "uuid", "p_bank_name" "text", "p_account_number" "text", "p_account_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_my_profile"("p_first" "text", "p_last" "text", "p_nickname" "text", "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_my_profile"("p_first" "text", "p_last" "text", "p_nickname" "text", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_profile"("p_first" "text", "p_last" "text", "p_nickname" "text", "p_phone" "text") TO "service_role";



GRANT ALL ON TABLE "public"."announcement_templates" TO "anon";
GRANT ALL ON TABLE "public"."announcement_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_templates" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."arbitrage_loans" TO "anon";
GRANT ALL ON TABLE "public"."arbitrage_loans" TO "authenticated";
GRANT ALL ON TABLE "public"."arbitrage_loans" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."interest_rates" TO "anon";
GRANT ALL ON TABLE "public"."interest_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."interest_rates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."loan_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."loan_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."loan_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."loan_request_access" TO "anon";
GRANT ALL ON TABLE "public"."loan_request_access" TO "authenticated";
GRANT ALL ON TABLE "public"."loan_request_access" TO "service_role";



GRANT ALL ON TABLE "public"."loan_request_events" TO "anon";
GRANT ALL ON TABLE "public"."loan_request_events" TO "authenticated";
GRANT ALL ON TABLE "public"."loan_request_events" TO "service_role";



GRANT ALL ON TABLE "public"."loan_request_rates" TO "anon";
GRANT ALL ON TABLE "public"."loan_request_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."loan_request_rates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."loan_request_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."loan_request_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."loan_request_seq" TO "service_role";



GRANT ALL ON TABLE "public"."loans" TO "anon";
GRANT ALL ON TABLE "public"."loans" TO "authenticated";
GRANT ALL ON TABLE "public"."loans" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notification_reads" TO "anon";
GRANT ALL ON TABLE "public"."notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_due_overrides" TO "anon";
GRANT ALL ON TABLE "public"."payment_due_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_due_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."payment_logs" TO "anon";
GRANT ALL ON TABLE "public"."payment_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_logs" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."tracked_loans" TO "anon";
GRANT ALL ON TABLE "public"."tracked_loans" TO "authenticated";
GRANT ALL ON TABLE "public"."tracked_loans" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."transactions_effective" TO "anon";
GRANT ALL ON TABLE "public"."transactions_effective" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions_effective" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_account_txns" TO "anon";
GRANT ALL ON TABLE "public"."wallet_account_txns" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_account_txns" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_accounts" TO "anon";
GRANT ALL ON TABLE "public"."wallet_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_bills" TO "anon";
GRANT ALL ON TABLE "public"."wallet_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_bills" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_cards" TO "anon";
GRANT ALL ON TABLE "public"."wallet_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_cards" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_payments" TO "anon";
GRANT ALL ON TABLE "public"."wallet_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_payments" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







