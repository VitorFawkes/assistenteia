# Deployment Manual - Advanced AI Edge Functions

## Status Atual

✅ **Completo:**
- Tabelas do banco de dados criadas:
  - `collections` (sessões/projetos)
  - `collection_items` (itens dentro das sessões)
  - `reminders` atualizada com campos de notificação
- RLS policies configuradas
- TypeScript types atualizados

❌ **Pendente deploy (limitação técnica da API):**
- Edge Function `process-message` com GPT-4o Function Calling
- Edge Function `check-reminders` (cron job)

---

## Opção 1: Deploy Manual via Supabase Dashboard

### Atualizar `process-message`:

1. Acesse: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions/process-message

2. Clique em **"Edit function"**

3. Cole o código do arquivo: [`/Users/vitorgambetti/Documents/App Assistente/supabase/functions/process-message-temp/index.ts`](file:///Users/vitorgambetti/Documents/App%20Assistente/supabase/functions/process-message-temp/index.ts)

4. Clique em **"Deploy"**

---

## Opção 2: Deploy via Supabase CLI (Recomendado)

Eu criarei um arquivo completo com a função avançada que você pode deployar via CLI.

**Vantagens:**
- Function Calling do GPT-4o
- Tools para coleções, lembretes, queries
- Mais controle

**Quer que eu continue criando os arquivos para deploy manual?**

Ou prefere que eu simplifique e faça funcionar com a versão básica primeiro?
