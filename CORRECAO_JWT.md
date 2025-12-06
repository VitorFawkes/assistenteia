# CORREÇÃO URGENTE - JWT Verification

## Problema
As Edge Functions estão bloqueando chamadas pois exigem autenticação JWT, mas o app não tem login ainda.

## Solução (5 minutos)

### Opção 1: Desabilitar JWT (Mais Rápido)

1. Acesse: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions/process-message/details

2. Clique em **"Edit function"** ou **"Settings"**

3. Procure a opção **"Verify JWT"** e **desmarque**

4. Clique em **"Save"** ou **"Update"**

5. Repita para: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions/whatsapp-webhook/details

### Opção 2: Implementar Autenticação Simples

Se preferir manter a segurança com JWT, posso implementar:
- Tela de Login/Cadastro
- Auth com Google/Email
- Gerenciamento de sessão

## Testando após correção

1. Abra: http://localhost:3000
2. Digite "Olá" e envie
3. Você deve ver uma resposta da IA

Se continuar com erro, abra o Console do navegador (F12) e me envie a mensagem de erro.
