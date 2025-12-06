# 🔧 Instalação do Supabase CLI

## Problema Detectado
O Supabase CLI não está instalado no seu sistema, por isso não consegui fazer o deploy automaticamente.

---

## Opção 1: Instalar via Homebrew (RECOMENDADO - macOS)

Se você já tem Homebrew instalado:
```bash
brew install supabase/tap/supabase
```

Se você NÃO tem Homebrew, instale primeiro:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Depois instale o Supabase CLI:
```bash
brew install supabase/tap/supabase
```

---

## Opção 2: Instalar via NPM

```bash
npm install -g supabase
```

---

## Opção 3: Download Direto (macOS)

```bash
# Download do binário
curl -o supabase.tar.gz -L https://github.com/supabase/cli/releases/latest/download/supabase_darwin_amd64.tar.gz

# Extrair
tar -xzf supabase.tar.gz

# Mover para /usr/local/bin
sudo mv supabase /usr/local/bin/

# Verificar instalação
supabase --version
```

---

## Depois de Instalar

### 1. Verificar instalação
```bash
supabase --version
```

### 2. Login no Supabase
```bash
supabase login
```
Isso vai abrir um navegador para você fazer login.

### 3. Linkar ao projeto
```bash
cd "/Users/vitorgambetti/Documents/App Assistente"
supabase link --project-ref bvjfiismidgzmdmrotee
```

### 4. Fazer o Deploy
```bash
supabase functions deploy process-message
supabase functions deploy whatsapp-webhook
```

---

## Alternativa: Deploy Manual via Dashboard (SEM CLI)

Se não quiser instalar o CLI agora, você pode fazer deploy manual:

### Passos:

1. **Acesse**: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions

2. **Deploy process-message**:
   - Clique em `process-message`
   - Clique em "Edit function"
   - Copie todo o conteúdo de: `supabase/functions/process-message/index.ts`
   - Cole no editor
   - Clique em "Deploy"

3. **Deploy whatsapp-webhook**:
   - Clique em `whatsapp-webhook`
   - Clique em "Edit function"
   - Copie todo o conteúdo de: `supabase/functions/whatsapp-webhook/index.ts`
   - Cole no editor
   - Clique em "Deploy"

---

## Qual opção você prefere?

- ✅ **Opção Rápida**: Instalar via Homebrew ou NPM (5 minutos)
- ⚙️ **Opção Manual**: Deploy via Dashboard (sem instalação)

---

**Quando tiver o CLI instalado**, me avise e eu faço o deploy para você! 🚀
