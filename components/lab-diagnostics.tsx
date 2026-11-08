'use client';
import {diagnostics,decisionLabels} from '@/lib/observability';
import type {State,Signal,DiagnosticDetails} from '@/lib/core';

const euro=(n:number|null)=>n===null?'—':new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
const percent=(n:number|null)=>n===null?'—':n.toFixed(2)+'%';
const duration=(ms:number|null)=>ms===null?'Desconhecida':ms<60000?Math.floor(ms/1000)+' s':Math.floor(ms/60000)+' min';
const short=(s:string)=>s.slice(0,6)+'…'+s.slice(-5);
type RejectionRow={signal:Signal;strategy:string;code:string;reason:string;details:DiagnosticDetails|null};

export function LabDiagnostics({state}:{state:State}){
 const d=diagnostics(state),rejected=state.signals.flatMap<RejectionRow>(signal=>{
  if(signal.side==='ignore')return [{signal,strategy:'Parser',code:signal.audit?.parser.code??'legacy_parser_rejection',reason:signal.reason,details:signal.audit?.parser??null}];
  return (signal.audit?.decisions??[]).filter(x=>x.outcome!=='executed_virtual').map(x=>({signal,strategy:x.strategy??'Recolha',code:x.code,reason:decisionLabels[x.code]??x.code,details:x.details}));
 }).slice(-30).reverse();
 return <>
  <div className="alert">Transações observadas: dados reais de uma amostra da Solana. Operações, custos e resultados: exclusivamente virtuais. Cobertura total da blockchain desconhecida.</div>
  {d.warnings.length>0&&<section className="panel diagnostics-warnings" aria-label="Avisos de saúde"><div className="panelhead"><div><h2>Avisos de saúde</h2><p>Leitura informativa; não autoriza nem altera operações virtuais.</p></div></div>{d.warnings.map(w=><div className={'alert '+(w.severity==='critical'?'error':'')} key={w.code}><strong>{w.severity==='critical'?'Crítico':'Atenção'}:</strong> {w.message}</div>)}</section>}
  <section className="metrics">
   <article><label>Idade da última recolha</label><strong>{duration(d.freshness.lastSuccessAgeMs)}</strong><small>{d.freshness.collectionOlderThanTwoHours?'Sem recolha recente confirmada':'Último ciclo concluído'}</small></article>
   <article><label>Idade da receção do preço</label><strong>{duration(d.freshness.marketReceiptAgeMs)}</strong><small>{d.freshness.marketReceiptStale?'Fora do limite de 180 s para simular':'Dentro do limite de 180 s'}</small></article>
   <article><label>Transações pendentes</label><strong>{d.coverage.pending}</strong><small>{d.coverage.wallets.filter(w=>w.knownGap).length} carteiras com lacunas conhecidas</small></article>
   <article><label>Pedidos hoje · UTC</label><strong>{d.requests.usedToday} / {d.requests.dailyLimit}</strong><small>{d.requests.telemetry?.consecutiveFailures??'—'} falhas consecutivas desde a instrumentação</small></article>
  </section>
  <section className="panel explain">
   <div className="panelhead"><h2>Qualidade da evidência</h2><a className="textbutton" href="/api/diagnostics?export=1" download>Exportar diagnóstico JSON</a></div>
   <p>A idade do preço na origem ainda não está verificada. O instante de receção é diferente do instante em que o mercado formou o preço. Câmbio BCE: {d.freshness.fxDate??'indisponível'}.</p>
   <p>{d.coverage.currentLedgerObservations} observações no registo ativo · {d.coverage.currentLedgerSupportedSwaps} swaps reconhecidos · {d.coverage.signalsWithStructuredAudit} com diagnóstico estruturado. Os {d.coverage.legacySignalsWithoutStructuredAudit} sinais anteriores conservam o registo original; não reconstruímos decisões retroativamente.</p>
   {d.coverage.externalHistoryNotIncluded&&<p>Este estado refere arquivos externos. A exportação de diagnóstico contém apenas o registo ativo; é necessário o exportador de arquivo da produção para obter o detalhe histórico.</p>}
   <p>Retenção desta versão: {d.retention.signals}/{d.retention.signalLimit} sinais · {d.retention.logs}/{d.retention.logLimit} entradas de diário · {d.retention.snapshotLimitPerPortfolio} snapshots por estratégia. {d.retention.reached?'Limite atingido.':'Limite verificado antes de cada ciclo.'}</p>
   <p>Snapshot ativo: {(d.retention.payloadUtf8Bytes/1000000).toFixed(2)} MB. Limite de texto D1 de referência: {d.retention.providerTextLimitBytes/1000000} MB; a linha inclui metadados adicionais.</p>
  </section>
  <section className="panel topgap"><div className="panelhead"><h2>Cobertura da recolha</h2></div><div className="tablewrap"><table><thead><tr><th>Carteira</th><th>Lacuna conhecida</th><th>Pendentes</th><th>Última janela listada</th><th>Fora do lote</th></tr></thead><tbody>{d.coverage.wallets.map(w=><tr key={w.address}><td>{short(w.address)}</td><td>{w.knownGap?'Sim':'Não assinalada'}</td><td>{w.pending}</td><td>{w.lastWindow?`${w.lastWindow.listed} / ${w.lastWindow.limit}`:'Sem instrumentação'}</td><td>{w.lastWindow?.omittedFromBatch??'—'}</td></tr>)}</tbody></table></div><p className="muted diagnostics-note">As contagens referem-se à última janela consultada. Não medem todas as transações da carteira nem provam ausência de lacunas.</p></section>
  <section className="panel topgap"><div className="panelhead"><div><h2>Resultados exclusivamente virtuais</h2><p>Drawdown observado nos snapshots; extremos entre recolhas desconhecidos.</p></div></div><div className="tablewrap"><table><thead><tr><th>Estratégia</th><th>Saídas / perdas</th><th>P/L realizado</th><th>Custos explícitos estimados</th><th>Drawdown atual / máx. snapshots</th><th>Atraso execução P95</th></tr></thead><tbody>{d.portfolios.map(p=><tr key={p.id}><td>{p.label}{p.haltedByDrawdown&&' · suspensa'}{p.twoLossSuspensions>0&&` · ${p.twoLossSuspensions} trader(s) suspenso(s)`}</td><td>{p.closed} / {p.losses}</td><td>{euro(p.realizedPnlEur)}</td><td>{euro(p.explicitEstimatedCostsEur)}</td><td>{percent(p.currentDrawdownPct)} / {percent(p.maxSnapshotDrawdownPct)}</td><td>{duration(p.executionLagMs.p95)}</td></tr>)}</tbody></table></div><p className="muted diagnostics-note">Custos explícitos incluem rede estimada e reserva de renda. Taxas já incluídas nas cotações não estão separadas. Valorização {d.freshness.marketReceiptStale?'com preço recebido fora do limite de simulação':'com preço recebido recentemente'}; idade na origem desconhecida.</p></section>
  <section className="panel topgap"><div className="panelhead"><div><h2>Rejeições e decisões não executadas</h2><p>Últimas 30 entradas · o JSON contém todas as entradas do registo ativo.</p></div></div><div className="tablewrap"><table><thead><tr><th>Transação real</th><th>Etapa / estratégia</th><th>Motivo</th><th>Evidência</th></tr></thead><tbody>{rejected.map((x,i)=><tr key={x.signal.wallet+x.signal.signature+x.strategy+i}><td>{short(x.signal.signature)}</td><td>{x.strategy}</td><td>{x.reason}<small className="muted diagnostics-code">{x.code}</small></td><td>{x.details?<details><summary>Ver dados</summary><pre className="diagnostics-details">{JSON.stringify(x.details,null,2)}</pre></details>:'Registo anterior à instrumentação'}</td></tr>)}</tbody></table>{!rejected.length&&<div className="empty">Sem rejeições registadas nesta amostra.</div>}</div></section>
 </>;
}
