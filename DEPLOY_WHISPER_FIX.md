# 🚀 Deploy - Whisper Fix

## Passo 1: Desabilitar Evolution API speechToText

**IMPORTANTE**: Antes de fazer o deploy, você precisa desabilitar a transcrição automática na Evolution API.

No painel da Evolution API:
1. Acesse as configurações da sua instância
2. Procure por "Speech to Text" ou "Transcription"
3. **Desabilite** essa opção
4. Salve as configurações

---

## Passo 2: Deploy das Edge Functions

Execute os comandos abaixo na ordem:

```bash
# Navegar para o diretório do projeto
cd "/Users/vitorgambetti/Documents/App Assistente"

# Deploy da função process-message (com Whisper aprimorado)
supabase functions deploy process-message

# Deploy da função whatsapp-webhook (sem speechToText)
supabase functions deploy whatsapp-webhook
```

**Aguarde**: Cada deploy leva ~30-60 segundos.

---

## Passo 3: Testar via WhatsApp

Envie áudios em português para testar:

### Exemplos de Áudio para Testar:
1. ✅ **"Me lembra de comprar leite amanhã às 10h"**
2. ✅ **"Cria uma pasta chamada Viagem"**
3. ✅ **"Gastei 50 reais no Uber"**
4. ✅ **"Lista todos os meus lembretes"**

### O que esperar:
- Você vai receber resposta em português
- A transcrição deve estar correta
- O assistente deve executar os comandos normalmente

---

## Passo 4: Monitorar Logs (CRUCIAL!)

### Como Acessar os Logs:

1. Vá para: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions
2. Clique em **process-message**
3. Clique na aba **Logs**
4. Filtre por "últimos 30 minutos"

### Logs que Você DEVE Ver:

```
🎙️ Transcribing audio with Whisper (PT-BR)...
📝 Input text from Evolution (if any): NONE  ← DEVE SER "NONE"!
📥 Downloading audio from URL: https://...
✅ Audio downloaded: 45823 bytes
🚀 Sending to Whisper API...
✅ Whisper Transcription SUCCESS: Me lembra de comprar leite amanhã às 10h  ← EM PORTUGUÊS!
🔄 Replacing processedText with Whisper output
📝 FINAL TEXT SENT TO AI: Me lembra de comprar leite amanhã às 10h
```

### 🚨 Alertas Importantes:

#### ❌ Se aparecer:
```
📝 Input text from Evolution (if any): Call mom tomorrow
```
**Problema**: Evolution ainda está enviando speechToText!  
**Solução**: Voltar ao Passo 1 e garantir que desabilitou

#### ❌ Se aparecer:
```
❌ Failed to fetch audio: 403
```
**Problema**: URL do áudio expirou ou não é acessível  
**Solução**: Normal se testar áudios muito antigos. Envie um áudio novo.

#### ❌ Se aparecer:
```
❌ Whisper Error: { error: ... }
```
**Problema**: Erro na API do OpenAI  
**Solução**: Verificar se `OPENAI_API_KEY` está configurada corretamente

---

## Passo 5: Verificar Resultado Final

Após enviar o áudio via WhatsApp, você deve:

1. ✅ **Receber resposta do assistente em português**
2. ✅ **Comando executado corretamente** (lembrete criado, pasta criada, etc.)
3. ✅ **Logs mostrando transcrição em português**

---

## 🔧 Troubleshooting Rápido

### Problema: "Ainda transcrevendo em inglês"

**Diagnóstico**:
1. Verificar logs: `📝 Input text from Evolution (if any):`
2. Se NÃO for "NONE", Evolution não foi desabilitado
3. Se for "NONE" mas Whisper retorna inglês:
   - Verificar se o prompt está sendo enviado (procurar por `🚀 Sending to Whisper API...`)
   - Em último caso, testar com áudio mais claro/limpo

### Problema: "Erro ao fazer deploy"

```bash
# Verificar se está logado no Supabase CLI
supabase login

# Verificar se está linkado ao projeto
supabase link --project-ref bvjfiismidgzmdmrotee
```

### Problema: "WhatsApp não responde"

1. Verificar webhook no Evolution API: `https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/whatsapp-webhook`
2. Enviar mensagem de texto primeiro para testar conectividade
3. Verificar logs do `whatsapp-webhook`

---

## ✅ Checklist Final

Antes de considerar concluído:

- [ ] Desabilitei speechToText na Evolution API
- [ ] Deploy de `process-message` com sucesso
- [ ] Deploy de `whatsapp-webhook` com sucesso
- [ ] Enviei áudio de teste em português
- [ ] Logs mostrando `NONE` no input da Evolution
- [ ] Logs mostrando transcrição em português do Whisper
- [ ] Assistente respondeu corretamente em português
- [ ] Comando foi executado (lembrete criado, etc.)

---

## 📞 Suporte

Se algo não funcionar:
1. Copie os logs completos do Supabase
2. Anote exatamente o que testou (texto do áudio)
3. Compartilhe para análise

---

**Próximo passo**: Execute o deploy e teste! 🚀
