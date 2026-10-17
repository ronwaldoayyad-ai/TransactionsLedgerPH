begin;
alter table public.borrower_statements add column deleted_at timestamptz;
create policy visible_borrower_statements on public.borrower_statements as restrictive for select to authenticated using(deleted_at is null);
-- Retain the immutable snapshot for audit. Only its authenticated owner can hide it.
create function mobile_private.delete_statement(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=mobile_private.active_user(); k uuid:=(p_payload->>'key')::uuid; v_id uuid:=(p_payload->>'id')::uuid; v_old mobile_private.operation_keys; v_result jsonb;
begin
 if k is null or v_id is null then raise exception 'An invoice and retry key are required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||k::text,0));
 select * into v_old from mobile_private.operation_keys where actor_id=u and key=k;
 if found then if v_old.action<>'statement-delete' or v_old.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return v_old.result;end if;
 update public.borrower_statements set deleted_at=coalesce(deleted_at,now()) where id=v_id and user_id=u;
 if not found then raise exception 'Generated invoice unavailable.' using errcode='42501';end if;
 v_result:=jsonb_build_object('id',v_id,'deleted',true);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(u,k,'statement-delete',md5(p_payload::text),v_result);
 return v_result;
end $$;
revoke all on function mobile_private.delete_statement(jsonb) from public,anon;
grant execute on function mobile_private.delete_statement(jsonb) to authenticated;
create or replace function public.mobile_action(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select case when p_action='statement-create' then mobile_private.statement(p_payload) when p_action='statement-delete' then mobile_private.delete_statement(p_payload) when p_action='payment-review' then mobile_private.review_proof(p_payload) else mobile_private.action(p_action,p_payload) end$$;
notify pgrst,'reload schema';
commit;
