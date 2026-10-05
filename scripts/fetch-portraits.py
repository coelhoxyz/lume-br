#!/usr/bin/env python3
"""Fetch Câmara portrait JPEGs listed in an official deputy catalog."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


MAX_BYTES = 2 * 1024 * 1024
ALLOWED_HOSTS = {"www.camara.gov.br", "www.camara.leg.br"}


def timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_url(url, initial=False):
    parsed = urlparse(url)
    if parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password or parsed.port:
        raise ValueError("URL fora dos domínios oficiais da Câmara")
    if parsed.scheme != "https" and not (initial and parsed.scheme == "http"):
        raise ValueError("URL deve usar HTTPS após o endereço original")
    if not re.fullmatch(r"/internet/deputado/bandep/\d+\.jpg", parsed.path, re.I):
        raise ValueError("Caminho de foto oficial inválido")
    if parsed.query or parsed.fragment:
        raise ValueError("URL de foto não deve conter parâmetros")


class OfficialRedirects(HTTPRedirectHandler):
    def __init__(self):
        self.redirects = 0

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        self.redirects += 1
        if self.redirects > 5:
            raise ValueError("Muitos redirecionamentos")
        validate_url(newurl)
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def fetch(record, output_dir):
    deputy_id = str(record.get("ideCadastro", "")).strip()
    original_url = str(record.get("urlFoto", "")).strip()
    entry = {"id": deputy_id, "sourceUrl": original_url, "status": "failed"}
    try:
        if not re.fullmatch(r"\d+", deputy_id):
            raise ValueError("ID de deputado inválido")
        validate_url(original_url, initial=True)
        source_id = urlparse(original_url).path.rsplit("/", 1)[-1].removesuffix(".jpg")
        if source_id != deputy_id:
            raise ValueError("ID da foto difere do ID do deputado")

        # The catalog retains legacy HTTP URLs; fetch the same image from the canonical HTTPS host.
        request_url = f"https://www.camara.leg.br/internet/deputado/bandep/{deputy_id}.jpg"
        opener = build_opener(OfficialRedirects())
        request = Request(request_url, headers={"Accept": "image/jpeg", "User-Agent": "Brasil-e-Acc/portrait-import"})
        with opener.open(request, timeout=20) as response:
            final_url = response.geturl()
            validate_url(final_url)
            if response.headers.get_content_type().lower() != "image/jpeg":
                raise ValueError("Content-Type não é image/jpeg")
            content_length = response.headers.get("Content-Length")
            if content_length is not None and int(content_length) > MAX_BYTES:
                raise ValueError("Imagem maior que 2 MB")
            image = response.read(MAX_BYTES + 1)
            if len(image) > MAX_BYTES:
                raise ValueError("Imagem maior que 2 MB")
            if len(image) < 4 or not image.startswith(b"\xff\xd8\xff") or not image.endswith(b"\xff\xd9"):
                raise ValueError("Conteúdo não é um JPEG válido")

        output = output_dir / f"{deputy_id}.jpg"
        with tempfile.NamedTemporaryFile(dir=output_dir, prefix=f".{deputy_id}-", delete=False) as temp:
            temp.write(image)
            temp_path = Path(temp.name)
        os.replace(temp_path, output)
        entry.update(status="ok", url=final_url, fetchedAt=timestamp(), sha256=hashlib.sha256(image).hexdigest(), path=output.name, bytes=len(image))
    except (ValueError, HTTPError, URLError, TimeoutError, OSError) as exc:
        entry["error"] = str(exc)
    return entry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-file", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    catalog = json.loads(args.catalog_file.read_text(encoding="utf-8"))
    records = catalog["records"]
    if not isinstance(records, list):
        parser.error("O catálogo precisa conter uma lista records")
    ids = [str(record.get("ideCadastro", "")).strip() for record in records]
    if len(ids) != len(set(ids)):
        parser.error("O catálogo contém IDs duplicados")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    results = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(fetch, record, args.output_dir) for record in records]
        for future in as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda item: item["id"])
    manifest = {
        "catalogSourceUrl": catalog.get("sourceUrl"),
        "generatedAt": timestamp(),
        "total": len(results),
        "succeeded": sum(item["status"] == "ok" for item in results),
        "failed": sum(item["status"] == "failed" for item in results),
        "portraits": results,
    }
    target = args.output_dir / "manifest.json"
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=args.output_dir, prefix=".manifest-", delete=False) as temp:
        json.dump(manifest, temp, ensure_ascii=False, indent=2)
        temp.write("\n")
        temp_path = Path(temp.name)
    os.replace(temp_path, target)
    print(f"Portraits: {manifest['succeeded']}/{manifest['total']} fetched; {manifest['failed']} failed. Manifest: {target}")


if __name__ == "__main__":
    main()
