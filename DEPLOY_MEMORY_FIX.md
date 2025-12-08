# 🚀 DEPLOY - CORREÇÃO MEMÓRIA

## ⚠️ IMPORTANTE: Sobre o Prompt

O prompt pode estar em **DOIS lugares**:

### 1. **No Código** (DEFAULT_SYSTEM_PROMPT)
- Modificado em `supabase/functions/process-message/index.ts`
- **Só é usado se você NÃO tiver um prompt customizado na UI**

### 2. **Na UI** (Cérebro → Configurações Avançadas)
- Salvo na tabela `user_settings.custom_system_prompt`
- **Se existir, sobrescreve o default do código!**

**Se você tem um prompt customizado na UI, precisa adicionar estas linhas nele:**

```
**MEMÓRIA PROFUNDA (RAG) - CRÍTICO:**
- Se o usuário perguntar algo vago ("Qual era o nome daquele restaurante?", "O que eu falei sobre o projeto X?"), use `recall_memory`.
- **OBRIGATÓRIO:** Se o usuário perguntar sobre memórias salvas ("O que você sabe sobre mim?", "O que tem na sua memória?", "O que eu te pedi para lembrar?", "Você consegue acessar suas memórias?"), você DEVE chamar `recall_memory` com query genérica como "preferências fatos informações do usuário".
- **NUNCA** responda "não há memórias salvas" ou "não encontrei nenhuma memória" SEM ANTES ter chamado `recall_memory` para verificar!
- Isso busca no banco vetorial por significado. Use isso antes de dizer "não sei".
```

---

## 📋 DEPLOY VIA DASHBOARD

O CLI está com problema de autenticação. Faça o deploy via Dashboard:

### Passo 1: Acesse
https://supabase.com/dashboard/project/zxemvsfqjrdpgncxwfcf/functions/process-message

### Passo 2: Clique em "Deploy new version"

### Passo 3: Cole o código do arquivo
Copie o conteúdo de:
`supabase/functions/process-message/index.ts`

---

## 🧪 TESTE

Após o deploy, envie via WhatsApp ou Chat:

**"O que você sabe sobre mim?"**

A agente deve:
1. Chamar `recall_memory` 
2. Retornar a memória salva sobre dias da semana
