-- Limit future uploads and submissions; existing proof downloads are unchanged.
update storage.buckets set file_size_limit=5242880 where id='payment-proofs';

create or replace function mobile_private.check_file(p_bucket text,p_path text,p_mimes text[],p_limit integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=mobile_private.active_user();v_meta jsonb;
begin
 if p_bucket='payment-proofs' then p_limit:=least(coalesce(p_limit,5242880),5242880);end if;
 if p_path is null or split_part(p_path,'/',1)<>v_uid::text then raise exception 'File ownership mismatch.';end if;
 select metadata into v_meta from storage.objects o
 join mobile_private.verified_uploads v on v.object_id=o.id and v.owner_id=v_uid and v.updated_at=o.updated_at
 and v.mime=o.metadata->>'mimetype' and v.size=(o.metadata->>'size')::bigint
 where o.bucket_id=p_bucket and o.name=p_path;
 if v_meta is null or not coalesce(v_meta->>'mimetype','')=any(p_mimes)
 or coalesce((v_meta->>'size')::bigint,0)<=0 or (v_meta->>'size')::bigint>p_limit then
  if p_bucket='payment-proofs' then raise exception 'Upload and validate a supported proof within 5 MB.';end if;
  raise exception 'Upload and validate a supported file within the size limit.';
 end if;
end $$;
