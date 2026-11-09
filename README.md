# EDGEWATCH 0.1 — laboratório privado

Aplicação TypeScript / React / Vinext em Cloudflare Workers, com D1 persistente e acesso privado gerido por Sites. Paper trading apenas. Nenhum código de assinatura, envio de transações ou ligação de carteira.

As baselines `BRAIN` e `REFLEX` em `lib/agents.ts` são projeções determinísticas, causais e exclusivamente de observação. Produzem relatórios/propostas tipadas, mas não são chamadas pelo runner, não alteram estratégias, não contornam risco e não executam operações. Servem para testar o contrato antes de ligar qualquer modelo.

`lib/evaluation.ts` permite repetir snapshots fornecidos em ordem temporal e comparar contagens de propostas com os resultados observados das estratégias. A comparação é explicitamente descritiva: sem uma série de cotações/preços de execução alinhada a cada decisão, o módulo devolve P/L de REFLEX como indisponível em vez de fabricar um backtest.

`lib/research-ledger.ts` define o registo experimental versionado de observação, proposta e cotação virtual alinhada. Rejeita cronologias impossíveis, valores inválidos, propostas desalinhadas e decisões duplicadas. O formato declara sempre `paper_only` e `not_executed`; não é persistido nem usado pelo runner nesta fase.

`lib/reflex-portfolio.ts` contabiliza uma carteira REFLEX totalmente offline: uma posição longa por carteira, sem shorting ou alavancagem, entrada limitada por percentagem do património, saída total, custos explícitos, P/L realizado, valorização das posições abertas e drawdown observado. A ordem de execução segue a receção das cotações, não apenas a hora da proposta.

`lib/research-adapter.ts` converte exportações versionadas em datasets reproduzíveis. Um sinal histórico sem contexto alinhado é sempre `HOLD` com `historical_context_incomplete`; apenas um contexto causal explícito por `(wallet, signature)` pode fornecer saúde temporal e cotação virtual. O adaptador não usa métricas agregadas do momento da exportação como se fossem históricas.

`lib/comparison-report.ts` produz um relatório comparativo com regras v2 de cobertura, custos, P/L, rejeições, janelas e políticas. Só classifica a evidência como descritivamente comparável quando universo de sinais, capital, preços e custos coincidem, a equivalência das políticas foi verificada pelo mesmo motor e a amostra mínima é cumprida. Nunca declara superioridade estatística ou rentabilidade futura.

O pipeline completo pode ser executado sem rede com `pnpm evaluate:offline <input.json>`. O contrato v2 exige `datasetId`, `generatedAt`, declaração de ausência de credenciais, snapshot, contextos, configuração e agregados de referência; rejeita campos desconhecidos, defaults silenciosos, cronologias impossíveis e qualquer relatório anterior à última evidência. A política REFLEX é derivada da configuração realmente aplicada, não de um nome fornecido na entrada.

Um exemplo público integralmente sintético está em `examples/offline/synthetic-v2.json` e pode ser repetido com `pnpm evaluate:offline examples/offline/synthetic-v2.json`. A saída inclui ledger, cobertura, carteira, relatório, configuração efetiva e SHA-256 canónico da entrada. Agregados de estratégias externas entram como `declared_only` e permanecem inconclusivos até existir evidência verificável de políticas equivalentes. O manifesto trata `containsCredentials: false` como declaração não inspecionada; o esquema não possui campos de credenciais, mas texto livre nunca deve conter segredos.

`sourceKind: allowlisted_research_projection` significa uma projeção local contendo apenas os campos v2 permitidos. Não declara compatibilidade direta com a exportação completa de diagnóstico, com o D1 ou com a produção v10 — essa reconciliação continua bloqueada. O comando aceita no máximo 10 MiB, escreve o resultado apenas em stdout, não ecoa JSON inválido nos erros e não chama o runner, D1, fornecedores ou tarefas agendadas.

A exportação v1 conhecida desta branch pode ser projetada localmente com `pnpm project:offline <export.json> <dataset-id> <capital-eur> <percentagem-por-operação>`. O exemplo `examples/offline/branch-export-v1.synthetic.json` é integralmente sintético. O comando valida o envelope exato, rejeita formatos posteriores/desconhecidos, coloca tempos de origem ausentes ou impossíveis em quarentena e devolve um wrapper com hashes, contagens e uma entrada offline v2. `pnpm evaluate:offline <wrapper.json>` verifica a coerência estrutural do wrapper e conserva o manifesto da projeção em `manifest.sourceProjection` no resultado.

A projeção copia apenas carteira, assinatura, tempos, lado e motivo. Não transforma `originalPriceUsdcPerSol`, métricas atuais, auditorias, operações virtuais, carteiras ou benchmark em cotações/contexto REFLEX; `contexts` e `strategies` ficam vazios e o avaliador recusa um wrapper que tente acrescentá-los. Por isso, sinais suportados tornam-se `HOLD`, não há negócios e o P/L mecânico de zero significa **ausência de simulação**, não desempenho do REFLEX. Capital e dimensionamento são parâmetros explícitos da nova simulação, nunca inferidos como configuração histórica. Os SHA-256 verificam coerência interna e permitem comparar ficheiros; sem a exportação original para reprojetar, não autenticam a origem.

Proposta de observabilidade de 07-11-2026: [auditoria técnica](docs/AUDIT_2026-11-07.md) e [validação](docs/VALIDATION.md). O estado publicado tem um formato posterior ao `main` auditado; reconciliar código/arquivo antes de promover esta proposta. Esta branch não publica uma versão nem altera a automação.

## Diagnóstico e exportação para análise

O separador **Diagnóstico** e o `status` MCP mostram antiguidade da recolha e da receção de preços separadamente, filas/lacunas, rejeições por estratégia, custos explícitos estimados, perdas e drawdown observado nos snapshots. Dados de origem são reais; operações, resultados e benchmark são exclusivamente virtuais. A idade do preço na origem e a cobertura total da blockchain continuam desconhecidas.

`GET /api/diagnostics` lê um snapshot persistido, sem chamadas às fontes nem alterações ao estado. `GET /api/diagnostics?export=1` descarrega JSON com `schemaVersion: 1`, métricas, observações e operações virtuais. Usa a mesma proteção privada do Sites e `Cache-Control: no-store`. Contém apenas o registo ativo; não substitui o exportador de arquivo da produção. Não partilhar exportações privadas num repositório público.

Os novos sinais recebem `audit` com código do parser, evidência selecionada e decisões por estratégia. Pausa, intervalo mínimo, regras de consistência, risco, custos e estratégias conservam-se. Os limites de idade existentes são reaplicados depois da espera pela cotação. Os campos novos são opcionais e não exigem migração; sinais anteriores não recebem decisões reconstruídas.

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

Limites locais desta base GitHub: 36 pedidos/ciclo e 1500 pedidos/dia UTC, incluindo o pedido BCE em ambos os contadores; 3 carteiras, intervalo mínimo 60 min por defeito. Pausa com 1500 sinais ativos (incluindo ignorados), 6000 logs ou 2000 snapshots/estratégia; não elimina histórico para caber. O limite é verificado no início do ciclo, podendo acrescentar um último lote. Pode terminar a experiência antes de 60 dias se a atividade for elevada. Exportar JSON semanalmente. A produção tem arquivo e contagens posteriores; ver a auditoria antes de comparar estes limites com totais históricos.

Planos públicos consultados em 24-10-2026:
- Cloudflare Workers Free: 100 mil pedidos/dia; CPU 10 ms. D1 Free: 5 milhões linhas lidas/dia, 100 mil escritas/dia, 5 GB. Limites de CPU exigem teste em alojamento próprio; não presumir equivalência com o runtime Sites.
- Helius Free: 1 milhão de créditos/mês, 10 req/s; requer conta/chave. Custos RPC/arquivo variam; não ativar autoscaling ou plano pago.
- Jupiter sem chave: 0,5 req/s; gratuito com chave: 1 req/s. O adaptador espaça cotações por 2,2 segundos. Quotas também podem depender do IP.
- Netlify Free: 300 créditos/mês e pausa ao atingir o limite. Não escolhido para evitar repartir scheduler/dados/hosting.
- Nenhum plano pago foi contratado. Tarifas de Cloudflare próprio não comprovam condições comerciais do Sites; consultar a conta para confirmar limites incluídos. Objetivo de infraestrutura externa: 0 EUR nos planos gratuitos; não autorizar custos adicionais.

Fontes: https://solana.publicnode.com/ ; https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/d1/platform/pricing/ ; https://www.helius.dev/pricing ; https://developers.jup.ag/docs/portal/plans ; https://developers.jup.ag/docs/api-reference/swap/order ; https://solana.com/docs/references/clusters ; https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/

## Desenvolvimento

Node >=22.13, pnpm. `pnpm install`, `node --experimental-strip-types --test tests/*.test.mjs`, `python tests/persistence.py`, `pnpm exec tsc --noEmit`, `pnpm build`. Avaliação local: `pnpm project:offline --help` e `pnpm evaluate:offline --help`. Migrações em drizzle/; `pnpm db:generate` após alterar db/schema.ts. Nunca editar migrações aplicadas.

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
