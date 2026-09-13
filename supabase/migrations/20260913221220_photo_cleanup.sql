-- Persist deletion intent atomically with record deletion. Object removal happens after commit.
CREATE TABLE public.photo_cleanup (
  "photoId" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  "photoUrl" text NOT NULL
);
CREATE INDEX "photo_cleanup_userId_idx" ON public.photo_cleanup("userId");
ALTER TABLE public.photo_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_cleanup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.photo_cleanup TO service_role;
