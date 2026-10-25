import sqlite3, pathlib, json
c=sqlite3.connect(':memory:')
for p in sorted(pathlib.Path('drizzle').glob('*.sql')): c.executescript(p.read_text())
c.execute("INSERT INTO edge_state VALUES(1,0,?,NULL,0)",(json.dumps({'cash':100}),))
a=c.execute("UPDATE edge_state SET lease='a',lease_until=200 WHERE id=1 AND lease_until<100");assert a.rowcount==1
b=c.execute("UPDATE edge_state SET lease='b',lease_until=200 WHERE id=1 AND lease_until<100");assert b.rowcount==0
c.execute("UPDATE edge_state SET payload=?,version=version+1,lease=NULL,lease_until=0 WHERE id=1 AND lease='a' AND version=0",(json.dumps({'cash':90}),))
assert json.loads(c.execute('SELECT payload FROM edge_state').fetchone()[0])['cash']==90
assert c.execute("UPDATE edge_state SET payload='bad' WHERE id=1 AND lease='a' AND version=0").rowcount==0
print('Persistence: migration, lock exclusion, atomic version update, stale writer rejection PASS')
