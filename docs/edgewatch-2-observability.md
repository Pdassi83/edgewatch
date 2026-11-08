# EDGEWATCH 2.0 — Observabilidade antes de agentes de IA

## Objetivo desta intervenção

Diagnosticar a qualidade dos dados de um laboratório de **paper trading** sem mudar regras de execução, frequências, armazenamento ou autenticação.

O painel em **Visão geral** alerta para problemas críticos e a página **Operações** mostra métricas e alertas detalhados. A ferramenta MCP `status` inclui o mesmo diagnóstico para análise futura. Tudo é calculado a partir do estado persistido; a leitura não faz pedidos à blockchain nem altera posições.

## O que o diagnóstico mede

- **Preço:** válido para nova simulação apenas durante 180 segundos após a cotação. É o mesmo prazo atualmente aplicado em `lib/runner.ts`. O intervalo da recolha **não** prolonga a validade do preço.
- **Recolha:** recente, atrasada (mais de dois intervalos configurados desde o último sucesso), pausada, por iniciar ou inválida.
- **Cobertura:** carteiras com lacunas, transações pendentes, sinais aceites/rejeitados e razões de rejeição.
- **Armazenamento:** limites documentados de 1.500 sinais, 6.000 logs e 2.000 observações por estratégia (máximo), sem qualquer eliminação automática.
- **Circuito:** identifica interrupções reportadas pelo estado.

Os resultados são **alertas de diagnóstico**, não sinais de investimento. A ausência de alertas não prova que o histórico é completo ou que existe rentabilidade.

## Discrepância a investigar antes de publicar

Numa leitura do laboratório, o estado reportou **1.672 sinais** e `paused=false`. O código deste repositório interrompe novas recolhas quando começa um ciclo com 1.500 ou mais sinais. Verificar se produção corresponde à branch `main`, se as contagens usam a mesma definição, e se ocorreram alterações de retenção ou migração. Não eliminar histórico para resolver o alerta.

O estado também mostrou cotações desatualizadas e três carteiras com lacunas. Priorizar cobertura e confirmação da versão de produção antes de introduzir BRAIN/REFLEX.

## Plano de implementação posterior (não incluído neste PR)

1. Comparar binário/código efetivamente publicado, estado D1, tarefas agendadas e limites de retenção.
2. Melhorar a interpretação de transações e a cobertura histórica sem fingir rentabilidade ou preencher lacunas com dados inventados.
3. Montar um motor de estado temporalmente causal para comparar estratégias e testar decisões tipadas **apenas em simulação**.
4. Adicionar um agente de investigação e revisão periódica, sem autorização para modificar sozinho estratégias ou regras de risco.
5. Só promover uma estratégia depois de avaliações fora da amostra e aprovação explícita.

Não usar LLM em cada candle sem demonstrar valor sobre uma baseline determinística. Não contratar serviços pagos ou ativar envio/assinatura de transações.

## Validação

- `node --experimental-strip-types --test tests/*.test.mjs`
- `python tests/persistence.py`
- `pnpm exec tsc --noEmit`

A implementação deste PR é só de leitura e deve ser validada no CI antes de qualquer publicação. Um merge no GitHub não publica automaticamente no Sites.
