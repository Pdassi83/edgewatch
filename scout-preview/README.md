# EDGEWATCH / SCOUT — Staging isolado (Vercel)

Esta pasta contém um **site estático de demonstração**, totalmente independente do laboratório Sites existente. A página inicial inclui exclusivamente contagens anonimizadas de uma recolha de 09-11-2026 (três carteiras; 1188/738/2 observações, 0/90/1 swaps compatíveis e 81/6/0 transações pendentes). **Não há endereços de carteiras, assinaturas, saldos, tokens, credenciais, pedidos RPC ou ligações ao D1.**

## Configuração do projeto na Vercel

1. Criar um **projeto novo e separado** ligado a `Pdassi83/edgewatch`.
2. Selecionar a branch `feat/scout-isolated-vercel-preview` como origem da demonstração, sem alterar `main` nem nenhum projeto do EDGEWATCH já existente.
3. Em **Root Directory**, escolher `scout-preview`.
4. Framework Preset: **Other**; não são necessárias dependências, variáveis de ambiente ou um comando de compilação.
5. **Antes de partilhar o endereço**, abrir **Security → Deployment Protection**, selecionar **Vercel Authentication → All Deployments**, guardar e testar em navegação privada. A Vercel anunciou essa proteção gratuita para produção e previews em 09-09-2026.
6. Confirmar que um visitante não autenticado recebe uma página de login e que, após autenticação com acesso ao projeto, a demonstração abre.
7. Não conceder acesso anónimo, nem adicionar tokens, ligação ao Sites, tarefas de recolha ou integração D1.

> **Atenção:** o repositório do GitHub é público, logo o código e as **contagens anonimizadas** são públicos independentemente de proteger a URL. A proteção real de acesso é uma configuração da Vercel e não pode ser garantida por `vercel.json`.

## Proteções incluídas na página

- CSP com `connect-src 'none'` proíbe pedidos externos pelo JavaScript.
- O JSON opcional é lido localmente via File API e nunca enviado a um servidor.
- Sem `fetch`, WebSocket, analytics, login próprio, RPC, envio de transações, acesso a hardware wallet ou autenticação do Sites.
- Importação limitada a 5 MB e 100 carteiras. O conteúdo importado é apresentado como contagens e rótulos locais; os endereços são ocultados no painel.
- Cabeçalhos anti-indexação, anti-iframe e `no-store`.
- Este site é **apenas uma demonstração estática**, não o frontend do PR #5 e não apresenta dados em tempo real.

## Atualização automática: ainda não

O runtime Sites v10 não corresponde ao código em `main`; a fonte e a forma persistida de fila/arquivo não foram recuperadas e verificadas. Ligar esta página ao endpoint privado do laboratório seria um desvio perigoso da autenticação. A futura ligação deverá usar uma API server-side autenticada com dados mínimos e autorização explícita, depois de testes numa cópia descartável.

## Não fazer

- Não fundir os PR #4/#5 nem esta branch em `main` como forma de publicar.
- Não alterar o local, a base D1, os limites de retenção, a automação ou os resultados de produção.
- Não copiar exportações reais para um repositório público nem inseri-las em logs/variáveis de ambiente.
- Não apresentar a mera compatibilidade de swaps como lucro ou validade de uma estratégia.

Os dados de produção continuam intocados.
