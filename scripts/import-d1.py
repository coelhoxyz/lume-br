#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import urllib.request

parser = argparse.ArgumentParser(description='Import a verified Lume bootstrap using bounded D1 queries.')
parser.add_argument('--file', required=True, type=Path)
parser.add_argument('--account', required=True)
parser.add_argument('--database', required=True)
args = parser.parse_args()
if not args.account.isalnum() or not all(c.isalnum() or c == '-' for c in args.database):
    raise SystemExit('Invalid D1 destination')
token = os.environ.get('CLOUDFLARE_API_TOKEN')
if not token:
    auth = subprocess.run(['npx', '--offline', 'wrangler', 'auth', 'token', '--json'], capture_output=True, text=True, check=True)
    token = json.loads(auth.stdout)['token']
source = sqlite3.connect(':memory:')
source.row_factory = sqlite3.Row
source.executescript(Path('migrations/0001_initial.sql').read_text())
source.executescript(args.file.read_text())
url = f'https://api.cloudflare.com/client/v4/accounts/{args.account}/d1/database/{args.database}/query'

def query(sql, params=None):
    request = urllib.request.Request(url, data=json.dumps({'sql': sql, 'params': params or []}).encode(), method='POST', headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    if not payload.get('success') or any(not item.get('success') for item in payload.get('result', [])):
        raise ValueError('D1 query failed: ' + json.dumps(payload.get('errors', [])))
    return payload['result']

for table in ['deputies', 'records', 'datasets']:
    rows = [dict(row) for row in source.execute(f'SELECT * FROM {table}')]
    if not rows:
        raise ValueError(f'Empty bootstrap table: {table}')
    columns = list(rows[0])
    extracts = ','.join(f"json_extract(value,'$.{column}')" for column in columns)
    if table == 'records':
        clause = ' ON CONFLICT(scope,version,id) DO NOTHING'
    else:
        key = 'id' if table == 'deputies' else 'scope'
        updates = ','.join(f'{column}=excluded.{column}' for column in columns if column != key)
        clause = f' ON CONFLICT({key}) DO UPDATE SET {updates}'
    sql = f"INSERT INTO {table}({','.join(columns)}) SELECT {extracts} FROM json_each(?) WHERE 1{clause}"
    for start in range(0, len(rows), 500):
        query(sql, [json.dumps(rows[start:start + 500], ensure_ascii=False)])
    print(json.dumps({'table': table, 'imported': len(rows)}), flush=True)
version = source.execute("SELECT version FROM datasets WHERE scope='catalog'").fetchone()[0]
query('UPDATE deputies SET active=0 WHERE catalog_version<>?', [version])
result = query("SELECT substr(scope,1,instr(scope,':')-1) AS kind,COUNT(*) AS profiles,SUM(count) AS records FROM datasets WHERE scope<>'catalog' GROUP BY kind")
print(json.dumps({'verification': result[0]['results']}))
