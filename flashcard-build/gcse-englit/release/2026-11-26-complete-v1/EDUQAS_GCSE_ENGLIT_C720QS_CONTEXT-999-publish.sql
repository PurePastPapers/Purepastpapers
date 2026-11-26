-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='EDUQAS_GCSE_ENGLIT_C720QS_CONTEXT' for update;
select public.flashcard_publish_catalogue('EDUQAS_GCSE_ENGLIT_C720QS_CONTEXT','ef5e69e1-35e4-409d-bab0-90b487e6b387'::uuid,'EDUQAS_GCSE_ENGLIT_C720QS','GCSE C720QS','atomic',206) as published from public.flashcard_catalogue where id='EDUQAS_GCSE_ENGLIT_C720QS_CONTEXT' and current_version is not distinct from null::uuid;
commit;
