-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='OCR_GCSE_HIST_J411_EXAM' for update;
select public.flashcard_publish_catalogue('OCR_GCSE_HIST_J411_EXAM','1e6804bb-74e0-41cf-8da6-451008ada5cf'::uuid,'OCR_GCSE_HIST_J411','GCSE J411','atomic',394) as published from public.flashcard_catalogue where id='OCR_GCSE_HIST_J411_EXAM' and current_version is not distinct from null::uuid;
commit;
