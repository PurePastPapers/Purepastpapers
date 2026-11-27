-- Stop if this file returns anything other than exactly one published result.
begin;
select id from public.flashcard_catalogue where id='EDUQAS_GCSE_ENGLIT_C720QS_QUOTES' for update;
select public.flashcard_publish_catalogue('EDUQAS_GCSE_ENGLIT_C720QS_QUOTES','08791af2-8d46-4bee-9533-f3475384113c'::uuid,'EDUQAS_GCSE_ENGLIT_C720QS','GCSE C720QS','atomic',99) as published from public.flashcard_catalogue where id='EDUQAS_GCSE_ENGLIT_C720QS_QUOTES' and current_version is not distinct from null::uuid;
commit;
