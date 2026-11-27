-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='AQA_ALEVEL_PSYCH_7182_MARK' for update;
select public.flashcard_publish_catalogue('AQA_ALEVEL_PSYCH_7182_MARK','4aeb430b-e5a9-44b2-9ca1-7ce68a43f08e'::uuid,'AQA_ALEVEL_PSYCH_7182','A-level 7182','mark_scheme',64) as published from public.flashcard_catalogue where id='AQA_ALEVEL_PSYCH_7182_MARK' and current_version is not distinct from '94f19324-31d9-893a-a13f-48a9e33ea9e8'::uuid;
commit;
