# Fase 3 — SCOUT: triagem de compatibilidade de carteiras

## Âmbito

O SCOUT é uma projeção **pura, determinística e apenas de leitura** do estado agregado atual. Não executa chamadas RPC, não descobre novas carteiras, não altera carteiras acompanhadas, não modifica estratégias e não envia operações. Não foi integrado no runner nem no scheduler.

O painel de Diagnóstico mostra o diagnóstico de cada carteira já acompanhada, incluindo volume observado, swaps SOL/USDC reconhecidos, proporção de compatibilidade com o parser e transações pendentes. Estes valores **não** medem rentabilidade, taxa de acerto, retorno ajustado ao risco ou qualidade do trader.

O módulo `lib/scout.ts` admite a fila da branch GitHub (`pending.signatures`) e a projeção pública de produção (`pending.count`) sem assumir o esquema D1 de produção. Não aplica migrações e não interpreta o histórico arquivado como observações temporalmente completas.

## Regras de triagem (hipóteses operacionais, não parâmetros otimizados)

- Menos de 30 transações observadas ou menos de 5 swaps suportados: **amostra insuficiente**.
- Pelo menos 30 observações e nenhum swap suportado: **auditar compatibilidade do parser**. Isto não prova que a carteira seja má; o parser pode simplesmente não interpretar a atividade.
- Havendo amostra mínima e swaps suficientes, mas lacunas assinaladas ou mais de 10 pendentes: **rever cobertura e atrasos**.
- Pelo menos 30 observações, 5 swaps suportados, sem lacunas conhecidas e no máximo 10 pendentes: **candidato a investigação offline**, nunca aprovação automática para copiar operações.
- Contadores contraditórios, fila inválida ou agregado temporalmente posterior à análise: **dados inválidos**.

A ordem preserva as carteiras existentes; não cria um ranking por lucro. Um indicador `profitabilityEvidence: null` torna explícita a ausência de prova de resultados. A inexistência de lacuna assinalada não demonstra cobertura integral.

## Princípios de segurança e limitações

1. A saída reflete **somente o agregado atual**, que pode incluir observações arquivadas. Não se pode reconstituir o passado a partir destes contadores, nem usá-los para selecionar carteiras em backtests históricos.
2. A proporção de swaps reconhecidos é uma métrica de compatibilidade com o parser restrito; carteiras com outros protocolos ou tokens podem parecer piores sem o serem.
3. Os limiares 30/5/10 são regras provisórias para organizar trabalho de investigação. Precisam de avaliação com dados independentes e não foram escolhidos por uma otimização retrospetiva.
4. Não comparar P/L de estratégias ou escolher vencedores com base nestes diagnósticos. O próximo passo seria validar origem/qualidade dos dados, depois construir um dataset temporal completo com custos e preços alinhados.
5. Uma produção Sites v10 usa um contrato persistido e arquivo ainda não reconciliados com a branch GitHub. **Não publicar sem recuperar o código/migrações correspondentes e validar staging privado.**
6. Não adicionar endereços ou dados privados reais aos testes, logs públicos ou repositório.

## Verificação

`tests/scout.test.mjs` cobre incompatibilidade aparente, lacunas, amostra mínima, filas em ambos os formatos, contadores impossíveis, fuga temporal e ausência de mutações. `tests/diagnostics-ui.test.mjs` testa a apresentação com dados sintéticos.

A branch foi criada sobre `codex/edgewatch-observability-consolidated` (PR #4) para manter a evolução separada do `main`; o novo PR deve apontar inicialmente para essa branch. Qualquer promoção depende da reconciliação e da revisão do PR #4.

Sem serviço pago, trading real, alterações às tarefas agendadas, deploy, merge ou alteração de armazenamento.
