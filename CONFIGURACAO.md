# Configuração - Assistente IA

## Passo 1: Configurar API Keys no Supabase

Acesse o dashboard do Supabase:
**https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/settings/functions**

Adicione as seguintes variáveis de ambiente (Secrets):

### OpenAI
- **Nome**: `OPENAI_API_KEY`
- **Valor**: Sua chave da OpenAI (começa com `sk-...`)

### Evolution API (WhatsApp)
- **Nome**: `EVOLUTION_API_URL`
- **Valor**: URL da sua instância (ex: `https://seu-evolution.com.br`)

- **Nome**: `EVOLUTION_API_KEY`
- **Valor**: API Key da Evolution

- **Nome**: `EVOLUTION_INSTANCE`
- **Valor**: Nome da sua instância

---

## Passo 2: Configurar Webhook no Evolution API

No painel da Evolution API, configure o webhook:

**Webhook URL**:
```
https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/whatsapp-webhook
```

**Eventos para escutar**:
- `messages.upsert` (mensagens recebidas)

---

## Passo 3: Testar

### No App Web (http://localhost:3000)

1. **Texto**: Digite "Olá" e envie
2. **Voz**: Clique no microfone, grave "Me lembre de comprar leite"
3. **Imagem**: Clique no clipe, envie foto

### No WhatsApp

Envie mensagem para o número da instância Evolution:
- "Oi, tudo bem?"
- "Me lembre de reunião amanhã às 10h"

A resposta deve aparecer:
- ✅ No WhatsApp
- ✅ No app web (aba Chat)

---

## URLs Importantes

- **App**: http://localhost:3000
- **Supabase Dashboard**: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee
- **Edge Function process-message**: https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/process-message
- **Edge Function whatsapp-webhook**: https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/whatsapp-webhook

---

## Troubleshooting

**Erro: "OpenAI API key not configured"**
→ Verifique se adicionou `OPENAI_API_KEY` nos Secrets

**WhatsApp não responde**
→ Verifique se o webhook está configurado corretamente na Evolution API
→ Veja os logs da Edge Function no Supabase

**Upload de arquivo falha**
→ Verifique se as políticas RLS do bucket `chat-media` estão corretas
