-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='EDX_ALEVEL_ENGLIT_9ET0_CRITICS' for update;
select public.flashcard_publish_catalogue('EDX_ALEVEL_ENGLIT_9ET0_CRITICS','354f88b1-af02-4d5c-a861-a43f080e4216'::uuid,'EDX_ALEVEL_ENGLIT_9ET0','A-level 9ET0','atomic',13) as published from public.flashcard_catalogue where id='EDX_ALEVEL_ENGLIT_9ET0_CRITICS' and current_version is not distinct from null::uuid;
commit;
