#!/bin/bash

# Configuration
PROJECT_URL="https://bvjfiismidgzmdmrotee.supabase.co"
WEBHOOK_URL="$PROJECT_URL/functions/v1/whatsapp-webhook"

# Payload simulating a "Note to Self" message from Evolution API
# Note: "fromMe": true and remoteJid is the user's number
PAYLOAD='{
  "event": "messages.upsert",
  "instance": "test_instance",
  "data": {
    "key": {
      "remoteJid": "5511964293533@s.whatsapp.net",
      "fromMe": true,
      "id": "TEST_MSG_ID_12345"
    },
    "pushName": "Vitor",
    "message": {
      "conversation": "Teste de webhook manual"
    },
    "messageTimestamp": 1703180000
  }
}'

echo "🚀 Sending Test Payload to: $WEBHOOK_URL"
echo "📦 Payload: $PAYLOAD"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -v

echo -e "\n\n✅ Done. Check debug_logs in Supabase."
