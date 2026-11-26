-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='AQA_ALEVEL_SOC_7192_MARK' for update;
select public.flashcard_publish_catalogue('AQA_ALEVEL_SOC_7192_MARK','151b3530-a634-4704-b0ce-e504a2558565'::uuid,'AQA_ALEVEL_SOC_7192','A-level 7192','mark_scheme',28) as published from public.flashcard_catalogue where id='AQA_ALEVEL_SOC_7192_MARK' and current_version is not distinct from '9fe2a98f-cb5c-82be-a25e-8bbcaca14f0e'::uuid;
commit;
