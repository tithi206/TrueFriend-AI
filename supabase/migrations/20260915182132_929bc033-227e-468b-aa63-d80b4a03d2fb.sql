CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('study','college','personal','other')),
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR (estimated_minutes > 0 AND estimated_minutes <= 1440)),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own tasks" ON public.tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX tasks_user_created_idx ON public.tasks (user_id, created_at DESC);
CREATE INDEX tasks_user_due_idx ON public.tasks (user_id, due_date);
CREATE INDEX tasks_user_completed_idx ON public.tasks (user_id, completed_at DESC);

CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();