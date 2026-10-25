# EDGEWATCH 0.1 — laboratório privado

Aplicação TypeScript / React / Vinext em Cloudflare Workers, com D1 persistente e acesso privado gerido por Sites. Paper trading apenas. Nenhum código de assinatura, envio de transações ou ligação de carteira.

## Estado e âmbito

MVP experimental: descoberta de um signatário de atividade Jupiter, adição manual de até três carteiras, recolha limitada de transações finalizadas, interpretação conservadora SOL embrulhado/USDC, cotações Jupiter posteriores à deteção, três carteiras virtuais, limites de risco, diário e exportação JSON. Nenhuma operação é fabricada para preencher a interface.

Não cumpre ainda todos os critérios do caderno de encargos: ranking de rentabilidade real 7/30/90 dias, histórico completo, backtest, deteção robusta de wash trading e reconstrução de SOL nativo não implementados. A amostragem pode perder transações e é explicitamente marcada como incompleta. Não usar para estratégias rápidas. O filtro de consistência baseia-se em resultados **simulados anteriores**, não em rentabilidade comprovada do trader.

## Dados e algoritmo

- RPC principal: `https://solana-rpc.publicnode.com` (PublicNode, gratuito). O RPC oficial Solana devolveu HTTP 403 a partir do alojamento e foi substituído, apenas métodos de leitura. `HELIUS_API_KEY` opcional muda o endpoint para Helius. Não utiliza Enhanced Transactions, evitando depender de API em migração.
- Descoberta: até 4 assinaturas recentes do programa Jupiter, selecionando um signatário. É uma amostra de atividade, não seleção de vencedores.
- Por carteira: últimas 8 assinaturas, até 4 transações por ciclo. Sem backfill; lacunas explícitas. Primeiro lote é histórico e nunca executado retroativamente.
- Parser admite apenas duas variações SPL opostas, SOL embrulhado e USDC, com Jupiter presente, signatário e contas persistentes. Rejeita transferências, erros, contas criadas/fechadas e fluxos nativos adicionais. Não generaliza para outros tokens/protocolos. Interpretação por saldos é conservadora, mas não uma auditoria de todas as instruções arbitrárias.
- Jupiter Swap V2 `/order`, sem `taker`, apenas cotação. Não chama `/execute`, `/build` nem `/swap`.
- Valor de mercado: Jupiter Price V3; câmbio USD/EUR: BCE diário (até 5 dias de idade, considerando fins de semana). Conversão considera preço USDC/USD e bloqueia desvios >1%.
- Fonte do câmbio: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
- Atraso máximo 900 s por defeito. Cotação obtida depois da deteção; nunca usa o preço original para executar. Dados de mercado >180 s bloqueiam novas simulações no ciclo.
- Custos DEX/plataforma já incluídos na cotação. Haircut adicional adverso de 50 bps por defeito. Rede estimada pelo P75 das prioridades, 200 mil CU, base 5000 lamports e mínimo total 50000. Cada compra suporta reserva de 0,00204 SOL de renda, sem reembolso; hipótese conservadora e não comissão observada de execução real.
- Compra até 10% do património incluindo custos. Limites 20% por trader, 30% por ativo. Venda observada liquida toda a posição virtual desse trader, não reproduz a proporção vendida.
- Três portfolios independentes de 100 EUR: simples, consistência (20 saídas anteriores, P/L positivo e limite inferior Wilson 95% >=40%), pausa após duas perdas. Pausa de trader não se repõe automaticamente se não houver outra saída lucrativa. Exposição reduzida só por vendas observadas; não implementa stop-loss intraperíodo.
- Perdas diária/semanal são marcadas a mercado nos ciclos em UTC. Ao atingir limites, novas compras bloqueadas; vendas continuam. Drawdown 10% suspende persistentemente novas compras. Sem execução stop garantida entre observações. Mark-to-market e benchmark não descontam uma liquidação futura; P/L realizado inclui entrada/saída.
- Snapshots e decisões persistidos atomicamente em D1 com lease e versão CAS. Recolhas concorrentes são rejeitadas; lease expira em 4 min, provedor limita a atividade a 150 s. Uma falha interrompe novas simulações e conserva decisões já realizadas no ciclo. Sinais já observados não são repetidos após falha; constam como não executados.

## Orçamento e retenção

Limites locais: 36 pedidos JSON/ciclo + 1 pedido BCE, 1500 pedidos JSON/dia, 3 carteiras, intervalo mínimo 60 min por defeito. Pausa com 1500 sinais, 6000 logs ou 2000 snapshots/estratégia; não elimina histórico para caber. O limite é verificado no início do ciclo, podendo acrescentar um último lote. Pode terminar a experiência antes de 60 dias se a atividade for elevada. Exportar JSON semanalmente.

Planos públicos consultados em 24-10-2026:
- Cloudflare Workers Free: 100 mil pedidos/dia; CPU 10 ms. D1 Free: 5 milhões linhas lidas/dia, 100 mil escritas/dia, 5 GB. Limites de CPU exigem teste em alojamento próprio; não presumir equivalência com o runtime Sites.
- Helius Free: 1 milhão de créditos/mês, 10 req/s; requer conta/chave. Custos RPC/arquivo variam; não ativar autoscaling ou plano pago.
- Jupiter sem chave: 0,5 req/s; gratuito com chave: 1 req/s. O adaptador espaça cotações por 2,2 segundos. Quotas também podem depender do IP.
- Netlify Free: 300 créditos/mês e pausa ao atingir o limite. Não escolhido para evitar repartir scheduler/dados/hosting.
- Nenhum plano pago foi contratado. Tarifas de Cloudflare próprio não comprovam condições comerciais do Sites; consultar a conta para confirmar limites incluídos. Objetivo de infraestrutura externa: 0 EUR nos planos gratuitos; não autorizar custos adicionais.

Fontes: https://solana.publicnode.com/ ; https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/d1/platform/pricing/ ; https://www.helius.dev/pricing ; https://developers.jup.ag/docs/portal/plans ; https://developers.jup.ag/docs/api-reference/swap/order ; https://solana.com/docs/references/clusters ; https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/

## Desenvolvimento

Node >=22.13, pnpm. `pnpm install`, `node --experimental-strip-types --test tests/*.test.mjs`, `python tests/persistence.py`, `pnpm exec tsc --noEmit`, `pnpm build`. Migrações em drizzle/; `pnpm db:generate` após alterar db/schema.ts. Nunca editar migrações aplicadas.

A autenticação depende da política **owner-private** do Sites. Nunca tornar este projeto público sem acrescentar autorização no servidor: a API e o MCP são um laboratório partilhado protegido pelo dispatch privado. O endpoint POST exige JSON e verifica Origin quando presente. Nenhuma credencial é entregue ao cliente. Configurar segredos opcionais Helius/Jupiter nas variáveis de ambiente do Sites; nunca no Git.

## Automação

Endpoint `/mcp` fornece `collect` e `status`, autenticado pelo Sites. Uma tarefa cloud deve invocar collect e depois status para verificar persistência. O intervalo configurado é um mínimo no servidor; não cria nem altera um agendamento. O painel apenas atualiza o estado a cada minuto enquanto aberto, sem iniciar recolhas. A execução autónoma só está ativa depois da criação/verificação da tarefa cloud.

## Experiência de 30–60 dias

1. Confirmar primeira recolha e origem das transações; verificar configuração das fontes e tarefa cloud.
2. Manter parâmetros fixos e registrar qualquer alteração. Não procurar carteiras com base nos resultados futuros da experiência.
3. Exportar dados semanalmente; acompanhar falhas, lacunas, sinais ignorados, atraso, custos e tamanho da amostra.
4. Comparar métodos em período comum e reportar número de saídas, perdas, drawdown e benchmark. Sem amostra suficiente, concluir “inconclusivo”.
5. Não ativar dinheiro real; tal fase não faz parte deste software.

## GitHub e publicação

Repositório de código: https://github.com/Pdassi83/edgewatch

O código é versionado no GitHub. A publicação da aplicação continua gerida pelo Sites; um push neste repositório não atualiza automaticamente o site em produção.

A tarefa horária do ChatGPT utiliza as ferramentas `collect` e `status` do plugin EDGEWATCH. Foi criada em 25-10-2026. Respeita pausas e limites do servidor; falhas transitórias das fontes podem interromper uma recolha.

Dados D1, chaves e credenciais não fazem parte deste repositório. A visibilidade do código no GitHub é independente do acesso privado à aplicação.
