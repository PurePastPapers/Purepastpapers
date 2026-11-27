-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='AQA_ALEVEL_SOC_7192_BACKGROUND' for update;
select public.flashcard_publish_catalogue('AQA_ALEVEL_SOC_7192_BACKGROUND','ffaa6120-a62a-4d4a-ba55-c4280369ec68'::uuid,'AQA_ALEVEL_SOC_7192','A-level 7192','atomic',34) as published from public.flashcard_catalogue where id='AQA_ALEVEL_SOC_7192_BACKGROUND' and current_version is not distinct from null::uuid;
commit;
