ALTER TABLE public.notification_settings
ADD COLUMN IF NOT EXISTS in_app_popup_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS in_app_popup_title text,
ADD COLUMN IF NOT EXISTS in_app_popup_message text,
ADD COLUMN IF NOT EXISTS in_app_popup_image_url text,
ADD COLUMN IF NOT EXISTS in_app_popup_cta_label text,
ADD COLUMN IF NOT EXISTS in_app_popup_cta_url text;

COMMENT ON COLUMN public.notification_settings.in_app_popup_enabled IS
'Active l''affichage d''une popup in-app configurable depuis l''admin.';
COMMENT ON COLUMN public.notification_settings.in_app_popup_title IS
'Titre de la popup in-app.';
COMMENT ON COLUMN public.notification_settings.in_app_popup_message IS
'Message principal de la popup in-app.';
COMMENT ON COLUMN public.notification_settings.in_app_popup_image_url IS
'URL de l''image affichée dans la popup in-app.';
COMMENT ON COLUMN public.notification_settings.in_app_popup_cta_label IS
'Texte du bouton d''action optionnel dans la popup in-app.';
COMMENT ON COLUMN public.notification_settings.in_app_popup_cta_url IS
'URL ouverte par le bouton d''action optionnel de la popup in-app.';
