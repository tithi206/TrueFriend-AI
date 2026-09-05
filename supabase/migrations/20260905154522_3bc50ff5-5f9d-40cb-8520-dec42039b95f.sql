-- profiles extras
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- journal entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled entry',
  content text NOT NULL,
  mood text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own journal entries" ON public.journal_entries;
CREATE POLICY "own journal entries" ON public.journal_entries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS journal_entries_set_updated_at ON public.journal_entries;
CREATE TRIGGER journal_entries_set_updated_at BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- activity completions
CREATE TABLE IF NOT EXISTS public.activity_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  duration_seconds integer,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_completions TO authenticated;
GRANT ALL ON public.activity_completions TO service_role;
ALTER TABLE public.activity_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own activity completions" ON public.activity_completions;
CREATE POLICY "own activity completions" ON public.activity_completions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- reminder settings
CREATE TABLE IF NOT EXISTS public.reminder_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mood_reminder boolean NOT NULL DEFAULT false,
  journal_reminder boolean NOT NULL DEFAULT false,
  activity_reminder boolean NOT NULL DEFAULT false,
  reminder_hour smallint NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_settings TO authenticated;
GRANT ALL ON public.reminder_settings TO service_role;
ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own reminder settings" ON public.reminder_settings;
CREATE POLICY "own reminder settings" ON public.reminder_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS reminder_settings_set_updated_at ON public.reminder_settings;
CREATE TRIGGER reminder_settings_set_updated_at BEFORE UPDATE ON public.reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- indexes
CREATE INDEX IF NOT EXISTS idx_check_ins_user_created ON public.check_ins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user ON public.messages (user_id);
CREATE INDEX IF NOT EXISTS idx_journal_user_created ON public.journal_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user_completed ON public.activity_completions (user_id, completed_at DESC);