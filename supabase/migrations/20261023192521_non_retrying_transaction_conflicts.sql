-- Stop domain-conflict errors from entering PostgREST 14 serialization retries.
-- No financial calculation or stored record changes.
-- Retain this correction on rollback; do not reintroduce custom SQLSTATE 40001.
begin;
set local lock_timeout='5s';
do $$
declare definition text;changed text;expected text:='b08993e4da31be7ee7e51e199c83a6a0a5abdedfeb80a876ead63e85bcb7ee39';
begin
 definition:=pg_get_functiondef('public.admin_correct_transaction(jsonb)'::regprocedure);
 if encode(sha256(convert_to(definition,'UTF8')),'hex')<>expected then
  raise exception 'Transaction correction function differs from the reviewed version. Review its definition before applying this fix.';
 end if;
 changed:=replace(definition,'using errcode=''40001''','using errcode=''PT409''');
 if changed=definition then raise exception 'Reviewed stale guard was not found.';end if;
 execute changed;
end $$;
notify pgrst,'reload schema';
commit;
