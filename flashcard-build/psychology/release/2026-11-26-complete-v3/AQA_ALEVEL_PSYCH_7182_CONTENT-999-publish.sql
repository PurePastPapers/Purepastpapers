-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='AQA_ALEVEL_PSYCH_7182_CONTENT' for update;
select public.flashcard_publish_catalogue('AQA_ALEVEL_PSYCH_7182_CONTENT','4ffe27e7-235d-46b8-8dd7-a8e58835a476'::uuid,'AQA_ALEVEL_PSYCH_7182','A-level 7182','atomic',606) as published from public.flashcard_catalogue where id='AQA_ALEVEL_PSYCH_7182_CONTENT' and current_version is not distinct from 'adfa1fcc-3c06-4b67-a26f-335c2fdbdf93'::uuid;
commit;
