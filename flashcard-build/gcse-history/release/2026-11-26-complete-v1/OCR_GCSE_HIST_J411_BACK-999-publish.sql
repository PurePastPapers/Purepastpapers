-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='OCR_GCSE_HIST_J411_BACK' for update;
select public.flashcard_publish_catalogue('OCR_GCSE_HIST_J411_BACK','ae0e69b9-b9eb-42ef-b2f8-a055680b3040'::uuid,'OCR_GCSE_HIST_J411','GCSE J411','atomic',65) as published from public.flashcard_catalogue where id='OCR_GCSE_HIST_J411_BACK' and current_version is not distinct from null::uuid;
commit;
