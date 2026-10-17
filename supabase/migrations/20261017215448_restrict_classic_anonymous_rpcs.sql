-- These Classic RPCs are used after sign-in. Their authenticated and service
-- access is retained; anonymous callers must not execute privileged functions.
begin;
do $$declare routine record;begin
 for routine in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('acknowledge_loan_disbursement','activate_my_account','create_invoice','create_loan_disbursement','is_admin','update_loan_request_status','update_my_profile') loop
  execute format('revoke execute on function %s from public,anon',routine.signature);
  execute format('grant execute on function %s to authenticated,service_role',routine.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
