-- William changed his mind (26 Nov 2026): new sets start at 20 new cards a day again.
alter table public.flashcard_decks alter column new_limit set default 20;
