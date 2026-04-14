ALTER TABLE public.notification_settings
ADD COLUMN IF NOT EXISTS in_app_popup_badge text,
ADD COLUMN IF NOT EXISTS in_app_popup_theme text NOT NULL DEFAULT 'default';

COMMENT ON COLUMN public.notification_settings.in_app_popup_badge IS
'Badge court optionnel affiche en haut de la popup in-app (ex: Nouveau, En ce moment).';
COMMENT ON COLUMN public.notification_settings.in_app_popup_theme IS
'Theme visuel de la popup in-app: default, highlight, update, warning.';
