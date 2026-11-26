-- Stop unless exactly one row is returned and id equals ae0e69b9-b9eb-42ef-b2f8-a055680b3040.
insert into public.flashcard_catalogue (id,title,subject_id,exam_board,qualification,topic,deck_type,status) values ('OCR_GCSE_HIST_J411_BACK','OCR GCSE History J411 – Background knowledge','OCR_GCSE_HIST_J411','OCR','GCSE J411','Approved specification route','atomic','coming_soon') on conflict (id) do nothing;
insert into public.flashcard_catalogue_versions (id,catalogue_id,version) values ('ae0e69b9-b9eb-42ef-b2f8-a055680b3040'::uuid,'OCR_GCSE_HIST_J411_BACK','2026-11-26-complete-v1') on conflict (catalogue_id,version) do nothing;
select id,catalogue_id,version from public.flashcard_catalogue_versions where catalogue_id='OCR_GCSE_HIST_J411_BACK' and version='2026-11-26-complete-v1';
