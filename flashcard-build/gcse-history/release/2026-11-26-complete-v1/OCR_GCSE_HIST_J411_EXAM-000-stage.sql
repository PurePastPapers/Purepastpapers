-- Stop unless exactly one row is returned and id equals 1e6804bb-74e0-41cf-8da6-451008ada5cf.
insert into public.flashcard_catalogue (id,title,subject_id,exam_board,qualification,topic,deck_type,status) values ('OCR_GCSE_HIST_J411_EXAM','OCR GCSE History J411 – Exam knowledge','OCR_GCSE_HIST_J411','OCR','GCSE J411','Approved specification route','atomic','coming_soon') on conflict (id) do nothing;
insert into public.flashcard_catalogue_versions (id,catalogue_id,version) values ('1e6804bb-74e0-41cf-8da6-451008ada5cf'::uuid,'OCR_GCSE_HIST_J411_EXAM','2026-11-26-complete-v1') on conflict (catalogue_id,version) do nothing;
select id,catalogue_id,version from public.flashcard_catalogue_versions where catalogue_id='OCR_GCSE_HIST_J411_EXAM' and version='2026-11-26-complete-v1';
