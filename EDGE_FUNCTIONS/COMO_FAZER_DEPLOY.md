# Guia de Deploy Manual - Edge Functions Avançadas

## ✅ ATUALIZAÇÃO: Sistema de Prompt Dinâmico

A Edge Function `process-message` agora **carrega automaticamente** o prompt personalizado do usuário do banco de dados!

**Como funciona:**
1. Você edita o prompt em `/settings` no app
2. Clica em "Salvar" human
3. O prompt é salvo na tabela `user_settings`
4. **Na próxima conversa**, a IA usa automaticamente seu prompt customizado

---

## 📝 Passo 1: Deploy `process-message` (ATUALIZADO)

### 1.1 Acesse o Dashboard
https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions/process-message/details

### 1.2 Clique em "Edit function" ou "⋯" → "Edit"

### 1.3 Substituir código
1. Apague todo o código atual
2. Copie **TODO** o conteúdo de [`process-message.ts`](file:///Users/vitorgambetti/Documents/App%20Assistente/EDGE_FUNCTIONS/process-message.ts)
3. Cole no editor

> [!IMPORTANT]
> **NOVIDADE:** Esta versão busca o prompt customizado do banco antes de cada chamada!

### 1.4 Configurações
- **Verify JWT**: ❌ DESMARQUE
- **Import map**: Deixe em branco

### 1.5 Deploy
Clique em **"Deploy"** e aguarde (30-60s)

---

## ⏰ Passo 2: Criar `check-reminders` (Cron Job)

### 2.1 Criar nova função
1. Acesse: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions
2. Clique em **"Create a new function"**
3. Nome: `check-reminders`

### 2.2 Colar código
1. Copie **TODO** o conteúdo de [`check-reminders.ts`](file:///Users/vitorgambetti/Documents/App%20Assistente/EDGE_FUNCTIONS/check-reminders.ts)
2. Cole no editor

### 2.3 Configurações
- **Verify JWT**: ❌ DESMARQUE
- **Import map**: Deixe em branco

### 2.4 Deploy
Clique em **"Deploy"**

---

## 🕒 Passo 3: Ativar Cron (Agendamento)

### Use https://cron-job.org (Grátis)

1. Crie conta em: https://cron-job.org/en/signup
2. Após login, clique em **"Create cronjob"**
3. Configure:
   - **Title**: `Supabase Check Reminders`
   - **URL**: `https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/check-reminders`
   - **Schedule**: Every **1 minute**
   - Na aba **"Headers"**, adicione:
     ```
     Content-Type: application/json
     apikey: SUA_ANON_KEY
     ```
4. Salve!

---

## ✅ Passo 4: Testar

### 4.1 Testar Prompt Personalizado
1. Acesse: http://localhost:3000/settings
2. Edite o prompt (ex: adicione "Sempre responda de forma bem humorada")
3. Clique em "Salvar"
4. Volte para o chat e teste: `"Olá"`
5. A IA deve usar seu novo comportamento!

### 4.2 Testar Collections
- `"Crie sessão Viagem Curitiba"`
- Resposta: `"✅ Coleção "Viagem Curitiba" criada com sucesso!"`

### 4.3 Testar Dados Estruturados
- `"Anote em Controle de Custos: Mercado R$20"`
- `"Anote em Controle de Custos: Farmácia R$35"`
- `"Quanto gastei em Controle de Custos?"`
- Resposta: `"💰 Total em "Controle de Custos" (amount): R$ 55.00"`

### 4.4 Testar Lembretes
- `"Me lembre de reunião em 2 minutos"`
- **Aguarde 2 minutos**
- Deve aparecer: `"🔔 **Lembrete** reunião"`

---

## 🎉 Funcionalidades Completas!

Após deploy, sua assistente pode:
- ✅ Usar prompt personalizado por usuário
- ✅ Criar e organizar coleções
- ✅ Adicionar itens com dados estruturados
- ✅ Fazer consultas e cálculos
- ✅ Criar e gerenciar lembretes
- ✅ Enviar notificações automáticas

**Me avise quando terminar o deploy!**
