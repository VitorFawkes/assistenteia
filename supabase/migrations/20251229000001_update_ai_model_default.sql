-- Update default value for ai_model column
ALTER TABLE public.user_settings 
ALTER COLUMN ai_model SET DEFAULT 'gpt-5.1-preview';

-- Update existing records that are using gpt-4o
UPDATE public.user_settings 
SET ai_model = 'gpt-5.1-preview' 
WHERE ai_model = 'gpt-4o';
