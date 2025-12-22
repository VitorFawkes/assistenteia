#!/bin/bash

# Deploy whatsapp-webhook with JWT verification DISABLED
# This is critical because WhatsApp/Evolution API webhooks do not send a Supabase JWT.
# If you deploy without --no-verify-jwt, the webhook will fail with 401 Unauthorized.

echo "Deploying whatsapp-webhook..."
npx supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref bvjfiismidgzmdmrotee

echo "Deployment complete. JWT verification is DISABLED (Correct for Webhook)."
