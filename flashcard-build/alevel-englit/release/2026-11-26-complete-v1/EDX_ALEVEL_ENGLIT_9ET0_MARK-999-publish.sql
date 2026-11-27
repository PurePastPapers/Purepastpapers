-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='EDX_ALEVEL_ENGLIT_9ET0_MARK' for update;
select public.flashcard_publish_catalogue('EDX_ALEVEL_ENGLIT_9ET0_MARK','5d1a7759-32e0-42d8-a4d9-23206cddf8a3'::uuid,'EDX_ALEVEL_ENGLIT_9ET0','A-level 9ET0','mark_scheme',14) as published from public.flashcard_catalogue where id='EDX_ALEVEL_ENGLIT_9ET0_MARK' and current_version is not distinct from null::uuid;
commit;
