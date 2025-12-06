# 🚀 DEPLOY FASE 1: ATIVANDO A MEMÓRIA VETORIAL

A infraestrutura da "Mente V2.0" está pronta.
Agora precisamos colocar ela no ar.

## 1. Deploy das Novas Funções
Você precisa criar e fazer deploy de duas novas Edge Functions no Supabase.

### Função A: `generate-embedding` (O Neurônio)
Esta função converte texto em vetores.
1.  Crie uma nova função chamada `generate-embedding`.
2.  Copie o código de: `supabase/functions/generate-embedding/index.ts`
3.  Faça o Deploy.

### Função B: `vectorize-all` (A Migração)
Esta função lê todo o seu passado e cria memórias para ele.
1.  Crie uma nova função chamada `vectorize-all`.
2.  Copie o código de: `supabase/functions/vectorize-all/index.ts`
3.  Faça o Deploy.
4.  **Aumente o Timeout:** Nas configurações dessa função, aumente o timeout para 60s ou mais (pois pode demorar para processar tudo).

## 2. Executar a Migração (O "Upload" de Memória)
Agora vamos rodar a migração para que a IA aprenda tudo que já aconteceu.

1.  Vá na aba "Edge Functions" no Supabase.
2.  Clique na função `vectorize-all`.
3.  No canto direito, deve ter uma opção de "Invocar" ou "Testar" (ou use o terminal se souber).
4.  Se não achar, você pode rodar via browser acessando a URL da função (ex: `https://seu-projeto.supabase.co/functions/v1/vectorize-all`) - **Nota:** Precisa estar logado ou passar a chave, então o teste interno do dashboard é melhor.

**Se tudo der certo:**
A função vai retornar algo como `{"processed": 50, "errors": 0}`.
Isso significa que 50 itens antigos agora têm memória vetorial! 🧠

---
**PRÓXIMO PASSO (FASE 2):**
Assim que você confirmar o deploy, eu vou implementar a **Busca** (para a IA usar essas memórias).
