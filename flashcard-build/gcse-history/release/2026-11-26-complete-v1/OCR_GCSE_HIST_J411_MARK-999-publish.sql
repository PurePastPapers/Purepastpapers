-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='OCR_GCSE_HIST_J411_MARK' for update;
select public.flashcard_publish_catalogue('OCR_GCSE_HIST_J411_MARK','ba4c8b74-2e1e-40d6-8ed1-b024a0fea654'::uuid,'OCR_GCSE_HIST_J411','GCSE J411','mark_scheme',23) as published from public.flashcard_catalogue where id='OCR_GCSE_HIST_J411_MARK' and current_version is not distinct from null::uuid;
commit;
