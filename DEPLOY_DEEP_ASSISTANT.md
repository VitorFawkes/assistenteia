# 🧠 DEEP ASSISTANT (INTELIGÊNCIA PROFUNDA)

Você pediu para a IA aprender regras e ser proativa.
Eu implementei a **Memória de Regras**.

## O Que Mudou?

Agora a IA tem um "caderno de regras" que ela lê antes de cada resposta.
Se você ensinar algo para ela, ela **nunca mais esquece**.

### Como Usar (Exemplos)

1.  **Ensinando uma Regra:**
    - Fale: *"Crie uma pasta chamada **user_preferences**"* (Isso ativa o módulo de regras).
    - Fale: *"Nessa pasta, adicione a regra: Sempre que eu pedir para ligar para alguém, me pergunte depois se eu liguei mesmo."*
    - Fale: *"Adicione outra regra: Meus lembretes de manhã devem ser sempre às 08:30."*

2.  **O Resultado:**
    - Daqui a 1 mês, se você disser *"Me lembra de ligar pro João"*, ela vai agendar E vai perguntar: *"Quer que eu te cobre depois se você ligou?"* (porque ela leu a regra).

---

## 🚀 COMO ATIVAR (DEPLOY)

1.  Copie TODO o código de: `supabase/functions/process-message/index.ts`
2.  Vá para: https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions/process-message
3.  Cole e clique em **Deploy**.

### Importante
Para essa mágica funcionar, você **PRECISA** criar a pasta `user_preferences` (ou pedir para ela criar). Tudo que estiver lá dentro vira Lei para a IA.
