-- Early sign-up for students whose exam board is not on the site yet.
-- We email them when more boards are added. No account and no email verification.
-- The browser cannot read or edit this table: it can only add a row through
-- public.join_exam_board_waitlist(). Read the list in the Supabase dashboard
-- (Table editor → exam_board_waitlist) or, for a count per board:
--   select board, count(*) from public.exam_board_waitlist group by board order by 2 desc;

create table public.exam_board_waitlist (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  board text not null check (char_length(board) between 1 and 80),
  subject text not null default '' check (char_length(subject) <= 120),
  level text not null default '' check (char_length(level) <= 20),
  source text not null default '' check (char_length(source) <= 40),
  created_at timestamptz not null default now(),
  unique (email, board, subject)
);

alter table public.exam_board_waitlist enable row level security;
revoke all on table public.exam_board_waitlist from public, anon, authenticated;

-- Adds one request. Signing up twice for the same board and subject is not an error.
create or replace function public.join_exam_board_waitlist(
  p_email text,
  p_board text,
  p_subject text default '',
  p_level text default '',
  p_source text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_board text := btrim(coalesce(p_board, ''));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if char_length(v_board) not between 1 and 80 then
    raise exception 'Choose an exam board.' using errcode = '22023';
  end if;

  insert into public.exam_board_waitlist (email, board, subject, level, source)
  values (
    v_email,
    v_board,
    left(btrim(coalesce(p_subject, '')), 120),
    left(btrim(coalesce(p_level, '')), 20),
    left(btrim(coalesce(p_source, '')), 40)
  )
  on conflict (email, board, subject) do nothing;
  return true;
end;
$$;

revoke all on function public.join_exam_board_waitlist(text, text, text, text, text) from public;
grant execute on function public.join_exam_board_waitlist(text, text, text, text, text) to anon, authenticated;
