-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='AQA_ALEVEL_PSYCH_7182_EVIDENCE' for update;
select public.flashcard_publish_catalogue('AQA_ALEVEL_PSYCH_7182_EVIDENCE','15e5d178-67ef-41ca-9b0c-5708cbccc478'::uuid,'AQA_ALEVEL_PSYCH_7182','A-level 7182','atomic',136) as published from public.flashcard_catalogue where id='AQA_ALEVEL_PSYCH_7182_EVIDENCE' and current_version is not distinct from null::uuid;
commit;
