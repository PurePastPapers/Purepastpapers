-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='EDUQAS_GCSE_ENGLIT_C720QS_MARK' for update;
select public.flashcard_publish_catalogue('EDUQAS_GCSE_ENGLIT_C720QS_MARK','6dc6f9d5-ef64-4a30-868b-3018bc19beea'::uuid,'EDUQAS_GCSE_ENGLIT_C720QS','GCSE C720QS','mark_scheme',24) as published from public.flashcard_catalogue where id='EDUQAS_GCSE_ENGLIT_C720QS_MARK' and current_version is not distinct from null::uuid;
commit;
