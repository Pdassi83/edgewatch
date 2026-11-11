# Validação — consolidação de observabilidade sobre a v10

Data da atualização: 11-11-2026.

## Bases reconciliadas

- Base pública inicialmente auditada: `main` em `97878e19d12462357a4e8ef124d535e4329c9ca3`.
- Fonte exata recuperada do repositório interno do Sites: v10 em `c58fd1a56d9c3e5934897b2dc044f11fc8850e06` (136 ficheiros versionados, árvore limpa). Esse SHA não existe no repositório público GitHub, mas o conteúdo-fonte ficou disponível para comparação local.
- Branch de integração: `codex/edgewatch-observability-consolidated`, que usa o fluxo operacional v10 como base e acrescenta a instrumentação consolidada dos PRs #2 e #3.

A reconciliação abrangeu runner, parser, fornecedores, persistência, migrações, API, MCP e página. O esquema esperado contém `edge_state` e `edge_archive`, através das migrações `0000` e `0001`. A migração `0001` foi importada para a branch, mas **não foi aplicada** a nenhuma base externa. O conteúdo e o histórico real de migrações do D1 de produção não foram lidos.

## Resultados locais

Ambiente: Windows, Node **v22.20.0**, pnpm **11.25.0**, dependências já disponíveis.

| Verificação | Resultado |
| --- | --- |
| `node --test tests/*.test.mjs` | **184 testes passaram; 0 falhas; 0 ignorados** |
| `pnpm exec tsc --noEmit` | PASS |
| `pnpm build` | PASS; cliente, RSC e SSR compilados, incluindo `/api/diagnostics`, `/api/state` e `/mcp` |
| `git diff --check` | PASS |
| `python tests/persistence.py` | NÃO EXECUTADO: o ambiente expõe apenas o alias inacessível da Microsoft Store e não tem `py` |
| `pnpm lint` | FALHA conhecida: 42 erros do conjunto consolidado, concentrados em `any` explícito e regras React/Next; não é apresentado como PASS |

O aviso de classificação estática de rotas do Vinext e o relatório de tempos dos plugins não impediram o build. Compilar não publica a aplicação. Os sete testes do store usam o SQLite incorporado no Node e exercitam o SQL real, mas não substituem o teste Python nem certificam o D1 gerido.

## Cobertura exercitada

- Operação v10: Jupiter e DFlow, discriminadores suportados, gorjetas Jito permitidas, janela de 128 assinaturas, fila persistente com `through`, rotação e orçamentos de 8/12 leituras.
- Primeiro lote histórico sem execução retroativa, retoma após falha parcial, assinaturas falhadas filtradas e prevenção de duplicados.
- Paper trading: contabilização, custos explícitos, limites de exposição, vendas, risco, consistência causal, duas perdas e drawdown.
- Revalidação de frescura depois da cotação em compras e vendas, com separação entre tempo de origem, deteção, receção do preço e execução virtual.
- Arquivo automático de ignorados, diário e séries; atualização do estado e chunks no mesmo batch/CAS; rollback e perda de lease.
- Exportação completa por `/api/state?export=1`, fingerprint do estado ativo e limpeza manual protegida por pausa e cópia recente.
- Diagnóstico puro, totais ativos/cumulativos, arquivo incluído ou ausente sem dupla contagem, avisos, métricas, API `no-store` e erro sanitizado.
- MCP 0.2 com `collect` e `status`, preservando totais e resumos sem expor assinaturas pendentes, `through` ou `discovery.seen`.
- Interface v10: edição de configuração, exportação antes da limpeza, frescura de 180 segundos e separador de diagnóstico.
- Pipeline offline v2, projetor estrito da exportação de investigação reconciliada, hashes canónicos, quarentena temporal, execução fora da pasta do projeto e rejeição de estado bruto v10/D1.
- Baselines BRAIN/REFLEX continuam apenas observacionais e offline; não são chamados pelo runner e não executam nem recomendam operações reais.

Todos os pedidos de rede, RPC, Jupiter e BCE foram substituídos por fixtures nos testes. Não foram usadas credenciais nem dados privados reais.

## Limitações e bloqueios restantes

1. A origem do código v10 está reconciliada, mas o estado real do D1 de produção não está: falta verificar, em modo de leitura, quais migrações foram efetivamente aplicadas e se `edge_archive` corresponde ao esquema esperado.
2. Não houve ensaio num ambiente privado de staging com cópia segura/anónima de dados representativos. Por isso, CPU, quotas, tamanho de payload, dispatch privado e comportamento do D1 gerido não estão certificados.
3. O teste Python de persistência não pôde ser repetido neste computador. Os testes SQLite do Node cobrem atomicidade e concorrência equivalentes no código atual, mas esta limitação permanece explícita.
4. O lint completo ainda falha e deve ser tratado antes de o tornar um gate obrigatório. TypeScript, testes e build passam.
5. Não se afirma validação visual completa em navegador desktop/mobile. Os testes cobrem renderização e interações críticas de forma sintética.
6. A amostra do laboratório continua incompleta: não há histórico total da cadeia, frescura comprovada na origem, ranking real 7/30/90 dias nem base estatística suficiente para concluir vantagem.

Assim, o PR pode ser revisto como consolidação de código, mas permanece **bloqueado para publicação** até à verificação do D1 e ao ensaio de staging. O bloqueio anterior — indisponibilidade do código-fonte v10 — está resolvido.

## Plano de staging/publicação

1. Fazer uma exportação de segurança e inspecionar em leitura o esquema/migrações do D1 de produção, sem limpar ou alterar dados.
2. Criar staging privado e isolado; aplicar `0001` apenas nesse ambiente, com aprovação explícita, e carregar dados sintéticos ou uma cópia sanitizada.
3. Repetir testes de API/MCP, arquivo/reidratação, CAS/lease, fila/retoma, exportação/fingerprint/limpeza e interface; medir payload e custo do ciclo.
4. Documentar diferenças do staging e pedir aprovação antes de qualquer promoção.
5. Só depois dessa aprovação considerar merge e publicação. Não alterar a tarefa agendada durante esta validação.

Nesta execução não houve merge, publicação, migração externa, limpeza, alteração de configuração de produção, recolha real ou modificação de tarefas agendadas.
