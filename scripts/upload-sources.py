#!/usr/bin/env python3
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser(description='Upload verified public source files to a private Lume R2 bucket.')
parser.add_argument('--manifest', required=True, type=Path)
parser.add_argument('--portraits', required=True, type=Path)
parser.add_argument('--account', required=True)
parser.add_argument('--bucket', required=True)
args = parser.parse_args()
if not args.account.isalnum() or not all(c.isalnum() or c == '-' for c in args.bucket):
    raise SystemExit('Invalid Cloudflare destination')
token = os.environ.get('CLOUDFLARE_API_TOKEN')
if not token:
    auth = subprocess.run(['npx', '--offline', 'wrangler', 'auth', 'token', '--json'], capture_output=True, text=True, check=True)
    token = json.loads(auth.stdout)['token']
manifest = json.loads(args.manifest.read_text())
portraits = json.loads(args.portraits.read_text())
files = [(Path(item['file']), item['key'], item['sha256'], 'application/zip' if item['file'].endswith('.zip') else 'text/csv' if item['file'].endswith('.csv') else 'application/xml') for item in manifest['files']]
files += [(args.portraits.parent / item['path'], f"portraits/{item['id']}.jpg", item['sha256'], 'image/jpeg') for item in portraits['portraits'] if item['status'] == 'ok']
for file in [args.manifest, args.portraits]:
    files.append((file, f"sources/bootstrap/{manifest['version'].split(':')[-1]}/{file.parent.name}-{file.name}", hashlib.sha256(file.read_bytes()).hexdigest(), 'application/json'))

def upload(item):
    path, key, digest, content_type = item
    body = path.read_bytes()
    if hashlib.sha256(body).hexdigest() != digest:
        raise ValueError(f'Hash mismatch: {path.name}')
    url = f'https://api.cloudflare.com/client/v4/accounts/{args.account}/r2/buckets/{args.bucket}/objects/{urllib.parse.quote(key, safe="")}'
    request = urllib.request.Request(url, data=body, method='PUT', headers={'Authorization': f'Bearer {token}', 'Content-Type': content_type})
    with urllib.request.urlopen(request, timeout=120) as response:
        result = json.load(response)
        if not result.get('success'):
            raise ValueError(f'R2 upload failed: {key}')
    return key

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(upload, files))
print(json.dumps({'uploaded': len(results), 'source_files': len(manifest['files']), 'portraits': portraits['succeeded'], 'bucket': args.bucket}))
