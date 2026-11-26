-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='AQA_ALEVEL_PSYCH_7182_CONTENT' for update;
select public.flashcard_publish_catalogue('AQA_ALEVEL_PSYCH_7182_CONTENT','4c5cb75f-2568-4471-9302-18b77e141e84'::uuid,'AQA_ALEVEL_PSYCH_7182','A-level 7182','atomic',601) as published from public.flashcard_catalogue where id='AQA_ALEVEL_PSYCH_7182_CONTENT' and current_version is not distinct from null::uuid;
commit;
