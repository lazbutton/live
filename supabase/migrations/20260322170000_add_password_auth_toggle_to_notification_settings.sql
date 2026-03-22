ALTER TABLE public.notification_settings
ADD COLUMN IF NOT EXISTS is_password_auth_enabled boolean NOT NULL DEFAULT true;

UPDATE public.notification_settings
SET is_password_auth_enabled = true
WHERE is_password_auth_enabled IS NULL;

INSERT INTO public.notification_settings (
  notification_time,
  is_active,
  is_password_auth_enabled
)
SELECT '09:00:00', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_settings
);

COMMENT ON COLUMN public.notification_settings.is_password_auth_enabled IS
'Affiche ou masque le mode de connexion email / mot de passe dans l''application.';
