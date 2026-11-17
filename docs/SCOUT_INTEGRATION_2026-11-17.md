# Integração do SCOUT sobre a v10 reconciliada

Data: 17-11-2026.

## Alteração

O PR #5 recebeu a base atual do PR #4 (`49344bd20018ff5944ea61de2936edeb3252cf48`) sem reescrever o histórico. O conflito em `components/lab-diagnostics.tsx` foi resolvido mantendo a triagem SCOUT e a implementação v10 da fila persistente, dos totais cumulativos e do drawdown com arquivo incompleto.

Foi acrescentada uma regressão que verifica em conjunto a triagem, a coluna **Fila criada**, a janela de 128 entradas e o aviso **arquivo não carregado**. O SCOUT continua exclusivamente de leitura e sem ranking de rentabilidade, chamadas RPC, rotação de carteiras ou alterações ao runner.

## Verificações locais

Ambiente: Linux, Node v24.22.1, Python 3.12, dependências bloqueadas do projeto.

| Verificação | Resultado |
| --- | --- |
| `node --test --test-reporter=spec tests/*.test.mjs` | 198 testes aprovados; 0 falhas; 0 ignorados |
| `python3 tests/persistence.py` | PASS: migrações, exclusão por lease, CAS e rejeição de escritor antigo |
| TypeScript sem emissão | PASS |
| Build Vinext/Vite | PASS |
| `git diff --check` | PASS |
| ESLint | Mantém os 42 erros já registados no PR #4; não foi tornado gate nem ocultado por novas desativações |

Os testes com SQLite real continuam a cobrir o batch atómico de estado/arquivo, a reidratação sem duplicação, rollback, perda de lease e conservação de campos desconhecidos.

## Produção: inspeção exclusivamente de leitura

A fonte v10 voltou a ser recuperada do repositório interno do Sites no commit `c58fd1a56d9c3e5934897b2dc044f11fc8850e06`.

- As migrações SQL `0000_sudden_darkhawk.sql` e `0001_unique_blockbuster.sql` e `db/schema.ts` coincidem com a fonte publicada.
- O conteúdo JSON do journal de migrações é estruturalmente idêntico; difere apenas a quebra de linha final.
- A inspeção nativa do D1 confirmou `DB`, `edge_state` e `edge_archive`. As colunas devolvidas correspondem às usadas pelo store reconciliado.
- A ferramenta de leitura não expõe o ledger interno de migrações nem tipos/índices completos. A existência das tabelas não é apresentada como leitura desse ledger.
- Foi guardada uma exportação privada completa com arquivo e fingerprint antes da validação; nenhum conteúdo dessa exportação foi incluído neste repositório.

Nenhuma migração, limpeza, alteração de configuração, merge de PR, publicação ou alteração de automação foi feita no laboratório de produção.

## Ambiente isolado

URL: https://edgewatch-scout-validacao.pdassi.chatgpt.site

Site separado: `appgprj_6afca2aaca5881919667aab2a031e3c0`, privado apenas para o proprietário, com D1 próprio e sem tarefa agendada. As migrações existentes foram aplicadas exclusivamente à base nova desse ambiente.

A cópia de staging inclui um aviso visível de **dados sintéticos**, um inicializador de amostra que recusa substituir uma experiência existente e bloqueios de recolha externa tanto na API como no handler MCP. Estes auxiliares estão apenas no repositório interno do staging; não fazem parte da alteração de produção deste PR.

A amostra tem 611 observações, 10 swaps sintéticos, 1 assinatura pendente, 1.800 entradas de diário e 801 snapshots por método. Força o arquivo automático para exercitar estado ativo e detalhe arquivado. Nenhum desses valores representa o desempenho de uma carteira real.

O painel foi verificado num navegador no ambiente local, com a mesma amostra sintética e migrações locais. A navegação **Mais → Saúde técnica** apresenta os três diagnósticos esperados do SCOUT, a fila v10 e os avisos de arquivo. Não se afirma cobertura visual completa de dispositivos móveis.

O script `scripts/validate-staging.py` verifica o alojamento apenas depois de confirmar o aviso de staging e a identidade da amostra. A credencial é lida sem eco no terminal, nunca por argumento ou ficheiro. A opção `--resume` só permite retomar antes das mudanças de configuração e limpeza; não reinicializa a base.

### Resultado do ensaio alojado

**20 verificações passaram**, incluindo acesso anónimo recusado, arquivo automático, reidratação sem duplicação, diagnóstico/exportação v2, handler MCP, bloqueio de recolhas, configuração persistida, rejeição de fingerprint antigo e limpeza apenas após exportação recente.

O ensaio preservou os 10 swaps, a fila pendente, o arquivo e os três saldos virtuais de 100 EUR. A limpeza removeu deliberadamente 250 ignorados ativos da amostra descartável e conservou os respetivos resumos. A configuração sintética terminou com 7% por operação, usada para testar a gravação; não é uma alteração do parâmetro de produção.

O maior payload medido foi **478.089 bytes** e o contador de pedidos de recolha externa terminou em **zero**. Estes números não certificam CPU, quotas ou custos de ciclos reais. O relatório sem credenciais nem dados reais está em [scout-staging-2026-11-17.json](validation/scout-staging-2026-11-17.json).

### Transporte MCP

O gateway externo `/mcp` exige OAuth próprio e devolveu 401 com a credencial de acesso HTTP do Site. Não se tentou contornar essa autenticação. A opção `--mcp-adapter` usa um adaptador disponível apenas na cópia isolada para testar o handler e o D1 com a autenticação privada normal do Site. Esse ensaio não certifica uma ligação OAuth de um novo plugin ao staging.

## Limites da promoção

Os PRs #4 e #5 permanecem em rascunho. A validação não ativa BRAIN/REFLEX, não produz um backtest fiável a partir de agregados atuais e não elimina a necessidade de preços/contexto histórico alinhados.

Antes de uma promoção: rever os resultados do staging, tratar ou aceitar explicitamente o débito de lint, confirmar a compatibilidade da publicação com o ledger de migrações existente e obter a aprovação de merge/publicação previamente pedida pelo proprietário. Carga, quotas e ciclos com fornecedores reais não foram certificados pelo ensaio sintético.
