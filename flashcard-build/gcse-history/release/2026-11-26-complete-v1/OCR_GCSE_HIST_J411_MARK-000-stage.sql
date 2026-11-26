-- Stop unless exactly one row is returned and id equals ba4c8b74-2e1e-40d6-8ed1-b024a0fea654.
insert into public.flashcard_catalogue (id,title,subject_id,exam_board,qualification,topic,deck_type,status) values ('OCR_GCSE_HIST_J411_MARK','OCR GCSE History J411 – Exam technique','OCR_GCSE_HIST_J411','OCR','GCSE J411','Approved specification route','mark_scheme','coming_soon') on conflict (id) do nothing;
insert into public.flashcard_catalogue_versions (id,catalogue_id,version) values ('ba4c8b74-2e1e-40d6-8ed1-b024a0fea654'::uuid,'OCR_GCSE_HIST_J411_MARK','2026-11-26-complete-v1') on conflict (catalogue_id,version) do nothing;
select id,catalogue_id,version from public.flashcard_catalogue_versions where catalogue_id='OCR_GCSE_HIST_J411_MARK' and version='2026-11-26-complete-v1';
