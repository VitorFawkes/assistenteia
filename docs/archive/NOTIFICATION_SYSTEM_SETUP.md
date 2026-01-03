# 🔔 Sistema de Notificações - Setup Guide

## ✅ **O Que Foi Implementado**

### **1. Migration Aplicada**
- ✅ Campos de recorrência adicionados na tabela `reminders`
- ✅ Campos: `recurrence_type`, `recurrence_interval`, `recurrence_unit`, `recurrence_count`, `weekdays`, `last_reminded_at`, `times_reminded`

### **2. Edge Function Atualizada**
- ✅ `process-message`: suporta criar lembretes recorrentes
- ✅ System prompt: ensina AI a usar recorrência

### **3. Nova Edge Function: check-reminders**
- ✅ Busca lembretes vencidos
- ✅ Envia notificações via WhatsApp
- ✅ Calcula próxima ocorrência para recorrentes
- ✅ Marca como concluído quando apropriado

---

## 🚀 **Deploy - Passo a Passo**

### **Passo 1: Deploy da Edge Function process-message (atualizada)**

Acesse: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions/process-message

Cole o código atualizado de `supabase/functions/process-message/index.ts`

### **Passo 2: Deploy da Nova Edge Function check-reminders**

1. Acesse: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions
2. Clique em **"New Function"** ou **"Create Function"**
3. Nome: `check-reminders`
4. Cole o código de `supabase/functions/check-reminders/index.ts`
5. Deploy

---

## ⏰ **Configurar Cron Job (CRÍTICO!)**

O check-reminders precisa rodar **a cada 1 minuto** para verificar lembretes.

### **Opção A: Supabase Cron (Recomendado)**

**IMPORTANTE:** Verifique se seu plano Supabase suporta Cron Jobs.

Se suportar, adicione ao arquivo `supabase/functions/check-reminders/index.ts`:

```typescript
// No topo do arquivo, após imports:
Deno.cron("check-reminders", "* * * * *", async () => {
  // Chama a própria função
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/check-reminders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    }
  });
  console.log('Cron executed:', await response.text());
});
```

### **Opção B: Serviço Externo (Gratuito)**

Use **cron-job.org** ou **Easycron**:

1. Crie conta em https://cron-job.org
2. Crie novo job:
   - **URL**: `https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/check-reminders`
   - **Method**: POST
   - **Headers**: 
     ```
     Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
     ```
   - **Schedule**: Every 1 minute (`*/1 * * * *`)
3. Salve e ative

### **Opção C: Servidor Próprio (se tiver)**

```bash
# Crontab
* * * * * curl -X POST https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/check-reminders \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

---

## 🧪 **Como Testar**

### **Teste 1: Lembrete Único Simples**

Via WhatsApp, envie:
```
Me lembra daqui 2 minutos de testar o sistema
```

**Esperado:**
- Lembrete criado
- Após 2 minutos: recebe notificação no WhatsApp 🔔
- Lembrete marcado como concluído

### **Teste 2: Lembrete Recorrente (3x a cada 2 minutos)**

Via WhatsApp:
```
Me lembra 3 vezes a cada 2 minutos de verificar isso
```

**Esperado:**
- Lembrete criado com `recurrence_type: custom`, `interval: 2`, `unit: minutes`, `count: 3`
- Recebe 3 notificações espaçadas de 2 minutos
- Após 3ª notificação: marcado como concluído

### **Teste 3: Lembrete Diário**

Via WhatsApp:
```
Me lembra todo dia às [HORA ATUAL + 2 min] de tomar água
```

**Esperado:**
- Recebe notificação a cada dia no horário
- Continua indefinidamente (sem `recurrence_count`)

---

## 📊 **Monitorar Funcionamento**

### **Ver Logs do check-reminders**

Acesse: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/logs/edge-functions?s=check-reminders

**Logs esperados:**
```
🔔 Checking for overdue reminders...
Found 2 overdue reminders
✅ Sent reminder "testar o sistema" to 5511964293533
✓ Completed one-time reminder: testar o sistema
↻ Rescheduled recurring reminder "verificar isso" to 2025-12-04T01:00:00.000Z
✅ Check complete: 2 notifications sent, 2 reminders processed
```

### **Verificar no Banco**

```sql
-- Ver todos os lembretes
SELECT id, title, due_at, recurrence_type, times_reminded, is_completed 
FROM reminders 
ORDER BY due_at DESC;

-- Ver lembretes recorrentes ativos
SELECT * FROM reminders 
WHERE recurrence_type != 'once' 
AND is_completed = false;
```

---

## 🐛 **Troubleshooting**

### **Problema: Não recebo notificações**

**Diagnóstico:**
1. Verifique se cron job está rodando
2. Veja logs do check-reminders
3. Confirme que Evolution API está configurada corretamente

**Checklist:**
- [ ] Cron job ativo e rodando a cada minuto
- [ ] EVOLUTION_API_URL configurada
- [ ] EVOLUTION_API_KEY configurada
- [ ] EVOLUTION_INSTANCE configurada
- [ ] Usuário tem `phone_number` no banco

### **Problema: Notifica mas não recalcula recorrência**

**Diagnóstico:**
Verifique campos no banco:
```sql
SELECT id, title, recurrence_type, recurrence_interval, 
       recurrence_unit, recurrence_count, times_reminded
FROM reminders WHERE id = <ID_DO_LEMBRETE>;
```

**Solução:**
- Confirme que `recurrence_type` não é 'once'
- Se custom: confirme `recurrence_interval` e `recurrence_unit`
- Se count: confirme `times_reminded < recurrence_count`

### **Problema: Erro "No phone number"**

**Solução:**
Garanta que o usuário tem `phone_number` na tabela `users`:

```sql
UPDATE users 
SET phone_number = '5511964293533' 
WHERE id = '<USER_ID>';
```

---

## 📝 **Próximos Passos Após Deploy**

1. **Testar** os 3 cenários acima
2. **Monitorar logs** por 10 minutos
3. **Ajustar** cron se estiver muito/pouco frequente
4. **Validar** que funciona em produção

---

## 🎯 **Checklist de Deploy**

- [ ] Migration aplicada (✅ já feito!)
- [ ] Deploy de `process-message` atualizado
- [ ] Deploy de `check-reminders` nova função
- [ ] Cron job configurado (1 minuto)
- [ ] Testado lembrete único
- [ ] Testado lembrete recorrente
- [ ] Logs mostrando execução correta
- [ ] Notificações chegando no WhatsApp

---

**Pronto!** 🚀 Sistema de notificações completo implementado!
