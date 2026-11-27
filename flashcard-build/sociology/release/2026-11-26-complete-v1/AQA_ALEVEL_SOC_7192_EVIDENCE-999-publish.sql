-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='AQA_ALEVEL_SOC_7192_EVIDENCE' for update;
select public.flashcard_publish_catalogue('AQA_ALEVEL_SOC_7192_EVIDENCE','1d7e067a-2fbb-4c5f-92a3-7f42e0e71166'::uuid,'AQA_ALEVEL_SOC_7192','A-level 7192','atomic',162) as published from public.flashcard_catalogue where id='AQA_ALEVEL_SOC_7192_EVIDENCE' and current_version is not distinct from null::uuid;
commit;
