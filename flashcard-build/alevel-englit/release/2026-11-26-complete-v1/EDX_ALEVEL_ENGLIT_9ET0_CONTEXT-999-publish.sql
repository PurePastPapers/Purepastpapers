-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='EDX_ALEVEL_ENGLIT_9ET0_CONTEXT' for update;
select public.flashcard_publish_catalogue('EDX_ALEVEL_ENGLIT_9ET0_CONTEXT','6e1abfd4-a504-49ad-922f-06addde8be7e'::uuid,'EDX_ALEVEL_ENGLIT_9ET0','A-level 9ET0','atomic',229) as published from public.flashcard_catalogue where id='EDX_ALEVEL_ENGLIT_9ET0_CONTEXT' and current_version is not distinct from null::uuid;
commit;
