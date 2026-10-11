CREATE TABLE public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  join_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.clubs TO service_role;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  device_token_hash text,
  phone text,
  alerts_opt_in boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, device_token_hash),
  UNIQUE (club_id, phone)
);
GRANT ALL ON public.club_members TO service_role;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.club_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','imessage')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX club_messages_club_time ON public.club_messages (club_id, created_at);
GRANT ALL ON public.club_messages TO service_role;
ALTER TABLE public.club_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agent_alerts_sent (
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, event_id)
);
GRANT ALL ON public.agent_alerts_sent TO service_role;
ALTER TABLE public.agent_alerts_sent ENABLE ROW LEVEL SECURITY;