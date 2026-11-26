-- New flashcard sets default to 999 new cards a day (William, 26 Nov 2026).
-- Existing sets keep whatever limit they already have.
alter table public.flashcard_decks alter column new_limit set default 999;
