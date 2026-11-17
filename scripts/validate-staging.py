"""Exercise disposable synthetic fixtures on an isolated EDGEWATCH staging Site.

Never runs against the laboratory: the page must identify synthetic staging and
the staging-only fixture endpoint must confirm its identity before any action.
Authorization is read from the terminal, never from arguments or a saved file.
"""
import argparse
import getpass
import json
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--origin', required=True)
parser.add_argument('--project-id', required=True)
parser.add_argument('--local', action='store_true')
parser.add_argument('--resume', action='store_true', help='Resume before any configuration or cleanup changes')
parser.add_argument('--mcp-adapter', action='store_true', help='Use the staging-only Worker adapter; does not certify OAuth transport')
parser.add_argument('--report', required=True)
args = parser.parse_args()
url = urllib.parse.urlsplit(args.origin)
assert not (url.username or url.password or url.query or url.fragment)
assert url.path in ('', '/')
if args.local:
    assert url.scheme == 'http' and url.hostname in ('127.0.0.1', 'localhost')
else:
    assert url.scheme == 'https' and url.hostname.endswith('.chatgpt.site')
origin = args.origin.rstrip('/')
token = '' if args.local else getpass.getpass('Staging authorization (hidden): ')
opener = urllib.request.build_opener(NoRedirects())
observations = []


def request(path, body=None, *, anonymous=False, headers=None):
    outgoing = {'accept': 'application/json, text/event-stream' if path == '/mcp' else 'application/json'}
    if token and not anonymous:
        outgoing['OAI-Sites-Authorization'] = 'Bearer ' + token
    if body is not None:
        outgoing['content-type'] = 'application/json'
    outgoing.update(headers or {})
    payload = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(origin + path, data=payload, headers=outgoing)
    started = time.monotonic()
    try:
        response = opener.open(req, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read(10 * 1024 * 1024 + 1)
        assert len(raw) <= 10 * 1024 * 1024
        try:
            value = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            value = raw.decode(errors='replace')
            if path == '/mcp' and 'text/event-stream' in response.headers.get('content-type', ''):
                messages = [json.loads(line[5:].strip()) for line in value.splitlines() if line.startswith('data:')]
                value = next((item for item in messages if isinstance(item, dict) and 'result' in item), value)
        observations.append({'path': path, 'status': response.code,
                             'bytes': len(raw), 'elapsedMs': round((time.monotonic() - started) * 1000)})
        return response.code, value, response.headers


checks = []


def check(name, condition):
    assert condition, name
    checks.append(name)


status, page, _ = request('/')
check('synthetic staging identity', status == 200 and isinstance(page, str)
      and 'AMBIENTE DE VALIDAÇÃO' in page and 'DADOS SINTÉTICOS' in page)
if not args.local:
    status, _, _ = request('/api/state', anonymous=True)
    check('anonymous API access rejected', status in (301, 302, 303, 307, 308, 401, 403))
status, seeded, _ = request('/api/staging-fixture', {}, headers={'x-edgewatch-staging': args.project_id})
check('synthetic fixture persisted', (status == 200 and seeded.get('synthetic') is True and seeded.get('paused') is True)
      or (args.resume and status == 409))
status, state, headers = request('/api/state')
check('active state and no-store', status == 200 and headers.get('cache-control') == 'no-store')
check('only synthetic wallets in the isolated database', len(state['wallets']) == 3
      and all(wallet['address'].startswith('synthetic-') for wallet in state['wallets']) and state['paused'])
check('automatic archive prunes active detail', len(state['signals']) == 260
      and state['archive']['signals'] == 351 and len(state['logs']) == 1200
      and all(len(p['series']) == 600 for p in state['portfolios']))
status, full, _ = request('/api/state?export=1')
check('archive rehydration has no duplicates', status == 200 and full['exportMeta']['includesArchive']
      and len(full['signals']) == 611 and len({s['signature'] for s in full['signals']}) == 611
      and len(full['logs']) == 1800 and all(len(p['series']) == 801 for p in full['portfolios']))
status, diagnostic, headers = request('/api/diagnostics')
check('diagnostic preserves cumulative totals', status == 200 and diagnostic['tradingMode'] == 'paper_only'
      and diagnostic['coverage']['cumulativeLedgerObservations'] == 611
      and diagnostic['coverage']['pending'] == 1 and diagnostic['coverage']['currentLedgerObservations'] == 260
      and headers.get('cache-control') == 'no-store')
check('archived snapshots remain explicitly incomplete', diagnostic['portfolios'][0]['snapshotHistoryComplete'] is False
      and diagnostic['portfolios'][0]['maxSnapshotDrawdownPct'] is None)
status, research, _ = request('/api/diagnostics?export=1')
check('research export v2', status == 200 and research['schemaVersion'] == 2
      and research['provenance']['runtimeSource'] == 'sites_v10_reconciled'
      and research['provenance']['executions'] == 'virtual_quote_based')
call = lambda name: {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': name}}
mcp_path = '/api/staging-mcp' if args.mcp_adapter else '/mcp'
if args.mcp_adapter and not args.local:
    status, _, _ = request('/mcp', call('status'))
    check('MCP gateway requires its separate OAuth authorization', status == 401)
status, response, _ = request(mcp_path, call('status'))
if not isinstance(response, dict) or 'result' not in response:
    raise RuntimeError('MCP response: ' + str(status) + ' ' + str(response)[:500])
mcp = json.loads(response['result']['content'][0]['text'])
check('MCP status preserves counters and redacts pending evidence', status == 200
      and mcp['signals'] == 611 and mcp['swaps'] == 10 and mcp['pending'] == 1
      and 'synthetic-pending-signature' not in json.dumps(mcp)
      and 'synthetic-through' not in json.dumps(mcp))
status, blocked, _ = request('/api/action', {'action': 'run'})
check('HTTP collection disabled in staging', status == 409)
status, response, _ = request(mcp_path, call('collect'))
collect = json.loads(response['result']['content'][0]['text'])
status, unchanged, _ = request('/api/state')
check('MCP collection disabled without state changes', collect.get('synthetic') is True
      and unchanged == state and unchanged['calls'] == 0)
status, _, _ = request('/api/staging-fixture', {}, headers={'x-edgewatch-staging': args.project_id})
check('fixture cannot overwrite existing experiment', status == 409)
status, _, _ = request('/api/action', {'action': 'config', 'config': state['config']}, headers={'origin': 'https://synthetic.invalid'})
check('cross-origin actions rejected', status == 403)
config = {**state['config'], 'perTrade': 7}
status, _, _ = request('/api/action', {'action': 'config', 'config': config})
status, changed, _ = request('/api/state')
check('configuration survives persisted read', status == 200 and changed['config']['perTrade'] == 7 and changed['paused'])
status, _, _ = request('/api/action', {'action': 'cleanup-ignored', 'backupFingerprint': full['exportMeta']['activeFingerprint']})
check('cleanup rejects stale backup fingerprint', status == 400)
status, fresh, _ = request('/api/state?export=1')
status, cleaned, _ = request('/api/action', {'action': 'cleanup-ignored', 'backupFingerprint': fresh['exportMeta']['activeFingerprint']})
check('cleanup requires fresh export and preserves swaps', status == 200 and cleaned.get('removed') == 250)
status, final, _ = request('/api/state')
check('cleanup persists archive, queue and virtual capital', status == 200 and final['paused']
      and len(final['signals']) == 10 and final['archivedIgnored']['count'] == 250
      and final['archive']['signals'] == 351
      and final['wallets'][1]['pending'] == state['wallets'][1]['pending']
      and all(p['cash'] == 100 and not p['trades'] for p in final['portfolios']))
report = {'synthetic': True, 'origin': origin, 'projectId': args.project_id,
          'mcpTransport': 'isolated_worker_adapter' if args.mcp_adapter else 'direct',
          'checks': checks, 'passed': len(checks), 'requests': observations,
          'maximumPayloadBytes': max(item['bytes'] for item in observations),
          'externalCollectionCalls': final['calls']}
with open(args.report, 'w') as destination:
    json.dump(report, destination, indent=2)
print(json.dumps({'passed': len(checks), 'maximumPayloadBytes': report['maximumPayloadBytes'],
                  'externalCollectionCalls': final['calls'], 'report': args.report}))
