-- Stop unless exactly one row is returned and id equals 151b3530-a634-4704-b0ce-e504a2558565.
insert into public.flashcard_catalogue (id,title,subject_id,exam_board,qualification,topic,deck_type,status) values ('AQA_ALEVEL_SOC_7192_MARK','AQA A-level Sociology 7192 – Exam technique','AQA_ALEVEL_SOC_7192','AQA','A-level 7192','Approved specification route','mark_scheme','coming_soon') on conflict (id) do nothing;
insert into public.flashcard_catalogue_versions (id,catalogue_id,version) values ('151b3530-a634-4704-b0ce-e504a2558565'::uuid,'AQA_ALEVEL_SOC_7192_MARK','2026-11-26-complete-v1') on conflict (catalogue_id,version) do nothing;
select id,catalogue_id,version from public.flashcard_catalogue_versions where catalogue_id='AQA_ALEVEL_SOC_7192_MARK' and version='2026-11-26-complete-v1';
