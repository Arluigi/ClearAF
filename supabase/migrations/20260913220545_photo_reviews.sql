CREATE TABLE public.photo_reviews (
  "photoId" uuid PRIMARY KEY REFERENCES public.skin_photos(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  "reviewerId" uuid NOT NULL REFERENCES public.dermatologists(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  "reviewedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "photo_reviews_reviewerId_idx" ON public.photo_reviews("reviewerId");
ALTER TABLE public.photo_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.photo_reviews TO service_role;
