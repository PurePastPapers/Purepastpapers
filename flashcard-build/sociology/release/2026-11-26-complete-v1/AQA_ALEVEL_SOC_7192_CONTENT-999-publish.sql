-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='AQA_ALEVEL_SOC_7192_CONTENT' for update;
select public.flashcard_publish_catalogue('AQA_ALEVEL_SOC_7192_CONTENT','5365b833-8d70-4106-83e2-5f69b83ef5da'::uuid,'AQA_ALEVEL_SOC_7192','A-level 7192','atomic',343) as published from public.flashcard_catalogue where id='AQA_ALEVEL_SOC_7192_CONTENT' and current_version is not distinct from null::uuid;
commit;
