# Validação — observabilidade e robustez

Data: 07-11-2026. Base GitHub: `97878e19d12462357a4e8ef124d535e4329c9ca3`.

## Resultados locais

Ambiente: Node **v24.22.1**, dependências locais já disponíveis, sem alterar `package.json`, lockfile ou adicionar pacotes. O workflow existente mantém Node 22; a execução nesse ambiente deve ser verificada nos checks do PR.

| Comando | Resultado |
| --- | --- |
| `node --experimental-strip-types --test tests/*.test.mjs` antes das alterações | 41 testes passaram |
| `node --experimental-strip-types --test tests/*.test.mjs` na proposta final | **84 testes passaram; 0 falhas; 0 ignorados** |
| `python tests/persistence.py` | PASS: migração, lease, atualização atómica e rejeição de escritor antigo |
| `pnpm exec tsc --noEmit` | PASS |
| `pnpm build` | PASS: bundle de cliente, RSC e SSR; rota de diagnóstico incluída |
| `git diff --check` | PASS |

O build emite o aviso habitual de classificação estática de rotas do Vinext e de proxy do ambiente. Nenhum impede a compilação. Compilar não publica a aplicação.

## Cobertura acrescentada

- Códigos de rejeição do parser e preservação do resultado original; evidência sem resposta RPC integral.
- Relógios distintos para recolha, receção do preço e preço na origem; valores desconhecidos/futuros e limites exatos de 180 s, `maxAge` e duas horas.
- Bloqueio de compra **e venda virtual** quando o sinal/preço envelhece durante a espera da cotação; preservação da posição quando a venda não pode ser avaliada.
- Resultados previstos nas três estratégias, suspensões, consistência com dados exclusivamente anteriores à deteção e ausência de execução retroativa do lote histórico.
- Rejeição de cotação versus estratégias não avaliadas depois da interrupção; persistência JSON de telemetria e recuperação após intervalo.
- Pausa, intervalo mínimo e retenção impedem pedidos externos e não fabricam tentativas de recolha.
- Janela de amostragem mantém a seleção original e revela o que ficou fora do lote.
- Custos explícitos estimados, perdas, P/L, percentis de atraso e drawdown dos snapshots com valores sintéticos conhecidos.
- Códigos de rejeição de rota, impacto, par/montante, expiração e resposta incompleta; metadados `blockId` sem novos pedidos.
- Exportação/versionamento, separação entre observações reais e operações virtuais, compatibilidade de estados antigos e indicação de arquivo externo não incluído.
- Endpoint e status MCP só leem o estado; `no-store` no endpoint, erro genérico sem mensagem interna.
- SQL real do store executado por SQLite em memória: exclusão concorrente, persistência conjunta, falha de callback, CAS, preservação de campos desconhecidos e lease de um novo proprietário.
- Dois testes de renderização React do diagnóstico: estado vazio e estado sintético com suspensão, exportação de leitura e escapagem de texto.
- Medição de bytes UTF-8 do snapshot sem alterar retenção ou histórico.

## Limites da verificação

Reconciliação adicional de 08-11-2026: a versão ativa do Sites é a 10, com SHA de proveniência `c58fd1a56d9c3e5934897b2dc044f11fc8850e06`, inexistente no GitHub acessível. Foi validado apenas o contrato público de `status`, que confirma arquivo e fila posteriores ao `main`; o arquivo-fonte e o esquema D1 interno não ficaram disponíveis. O teste de regressão aceita `{count,historical}` apenas como entrada da projeção de diagnóstico e não afirma que esse seja o esquema persistido.

Na branch consolidada, em Windows/Node 22.20.0: 152/152 testes Node passaram, incluindo baselines observacionais BRAIN/REFLEX, replay causal offline, registo experimental, carteira REFLEX, adaptador, relatório comparativo, projetor da exportação conhecida e pipeline CLI v2; `pnpm exec tsc --noEmit`, `pnpm build` e `git diff --check` passaram. `python tests/persistence.py` não pôde ser repetido porque o ambiente só disponibiliza o alias da Microsoft Store e não um interpretador Python executável; o teste SQLite tinha passado na validação original do PR #2. Esta indisponibilidade fica como bloqueio de ambiente e não é apresentada como teste aprovado nesta execução.

O contrato offline v2 foi ainda exercitado a partir de uma pasta externa ao projeto e produziu stdout idêntico em duas execuções da fixture pública. As regressões recusam `generatedAt` anterior à última cotação, configuração omitida, enums coercivos, cronologias inválidas mesmo em `HOLD`/`ignore`, campos desconhecidos e políticas externas apenas declaradas como se fossem equivalência comprovada. Um dataset sintético com 35.000 observações dentro dos limites terminou sem expansão da pilha. O manifesto conserva a configuração e política REFLEX efetivas e um SHA-256 canónico; JSON malformado é reportado sem reproduzir o conteúdo potencialmente sensível.

A declaração `containsCredentials: false` não é uma inspeção do texto livre. O contrato não contém campos de credenciais e a fixture não contém dados reais, mas o utilizador continua responsável por não colocar segredos em identificadores ou motivos. Exportações completas não entram diretamente no avaliador; apenas o projetor estrito reconhece o contrato v1 desta branch. A produção v10 continua incompatível até reconciliação: `allowlisted_research_projection` não equivale ao respetivo código ou esquema.

O projetor v1 foi validado contra uma exportação realmente produzida por `researchExport` e contra uma fixture pública sintética. Dez regressões cobrem contrato desconhecido/v10, campos adicionais, proveniência errada, duplicados, quarentena de tempos impossíveis, valores que não representam JSON, hashes canónicos, pureza, exclusão de texto descartado, execução fora da pasta do projeto, rastreabilidade e verificação do wrapper pelo avaliador. Métricas, operações, preço original e auditoria alteram a impressão da origem, mas não a entrada projetada nem decisões REFLEX. A projeção usa `contexts: []` e `strategies: []`; o avaliador recusa acrescentos posteriores mesmo com recálculo do checksum, e o P/L zero resultante não é apresentado como medição de desempenho. O manifesto validado fica em `manifest.sourceProjection`; os respetivos hashes provam coerência interna, não autenticidade da origem sem reprojeção do ficheiro original.

`pnpm lint` também foi executado e falhou com 34 erros e 1 aviso já presentes no conjunto consolidado, sobretudo `no-explicit-any` em módulos existentes e regras React/Next na página monolítica. A consolidação não alarga o âmbito para refatorar esses ficheiros; este débito deve ser tratado separadamente antes de tornar lint um gate obrigatório.

Os dados de produção foram apenas consultados por `status`. Não houve `collect`, alteração da configuração, migração aplicada, limpeza, merge ou publicação. Não foram usadas credenciais ou dados privados nos fixtures nem adicionados endereços reais acompanhados ao repositório público.

As fontes RPC/Jupiter/BCE foram substituídas por fixtures nos testes. Os testes do store executam o SQL real em SQLite, mas não certificam o serviço D1 em produção, nem a política privada do dispatch Sites, quotas da conta ou utilização de CPU no alojamento.

Foi tentado um smoke test de navegador local com dados sintéticos e bloqueio de pedidos externos/mutáveis. O Chromium não conseguiu arrancar por restrição de sockets do ambiente. **Não se afirma validação visual em desktop/mobile ou interação de navegador**; a cobertura do painel é de compilação e renderização estática. Nenhuma screenshot foi obtida ou incluída.

Não se testou esta branch contra o D1 real. Antes de qualquer promoção, é necessário reconciliar a versão posterior do Site (parser/fila/arquivo/exportador/migrações), medir o payload com histórico representativo e validar num ambiente privado de staging com autorização própria. O limite D1 de texto/linha é separado da quota total de armazenamento; a instrumentação não implementa uma nova política de retenção.

Não foram iniciadas as Fases 3 ou 4, nem tarefas/serviços/agendamentos novos. Nenhum teste chama métodos de assinatura, ligação de carteira ou transação financeira.
