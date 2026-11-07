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

Os dados de produção foram apenas consultados por `status`. Não houve `collect`, alteração da configuração, migração aplicada, limpeza, merge ou publicação. Não foram usadas credenciais ou dados privados nos fixtures nem adicionados endereços reais acompanhados ao repositório público.

As fontes RPC/Jupiter/BCE foram substituídas por fixtures nos testes. Os testes do store executam o SQL real em SQLite, mas não certificam o serviço D1 em produção, nem a política privada do dispatch Sites, quotas da conta ou utilização de CPU no alojamento.

Foi tentado um smoke test de navegador local com dados sintéticos e bloqueio de pedidos externos/mutáveis. O Chromium não conseguiu arrancar por restrição de sockets do ambiente. **Não se afirma validação visual em desktop/mobile ou interação de navegador**; a cobertura do painel é de compilação e renderização estática. Nenhuma screenshot foi obtida ou incluída.

Não se testou esta branch contra o D1 real. Antes de qualquer promoção, é necessário reconciliar a versão posterior do Site (parser/fila/arquivo/exportador/migrações), medir o payload com histórico representativo e validar num ambiente privado de staging com autorização própria. O limite D1 de texto/linha é separado da quota total de armazenamento; a instrumentação não implementa uma nova política de retenção.

Não foram iniciadas as Fases 3 ou 4, nem tarefas/serviços/agendamentos novos. Nenhum teste chama métodos de assinatura, ligação de carteira ou transação financeira.
