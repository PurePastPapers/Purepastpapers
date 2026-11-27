-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='EDX_ALEVEL_ENGLIT_9ET0_QUOTES' for update;
select public.flashcard_publish_catalogue('EDX_ALEVEL_ENGLIT_9ET0_QUOTES','a587a9c4-5c68-4f41-aaef-935b12743e18'::uuid,'EDX_ALEVEL_ENGLIT_9ET0','A-level 9ET0','atomic',179) as published from public.flashcard_catalogue where id='EDX_ALEVEL_ENGLIT_9ET0_QUOTES' and current_version is not distinct from null::uuid;
commit;
