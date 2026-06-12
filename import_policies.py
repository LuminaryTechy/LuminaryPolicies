#!/usr/bin/env python3
"""
Luminary Hospice — Policy Hub
Bulk metadata import script

Reads policy_metadata_import.csv and upserts all 244 policy records
into Azure AI Search. Run this AFTER uploading your .docx files to Blob Storage.

The script:
  1. Reads the CSV
  2. For each policy, checks if a blob exists in the correct container
  3. If the blob exists, parses the docx and generates an embedding
  4. Upserts the full record (metadata + parsed text + embedding) into the search index
  5. If no blob found, upserts metadata-only (searchable but no content yet)

Usage:
    pip install azure-search-documents azure-storage-blob azure-identity \
                openai mammoth pandas python-dotenv

    # Set environment variables (or create a .env file):
    export SEARCH_ENDPOINT=https://srch-policyhub-prod-lh.search.windows.net
    export SEARCH_INDEX_NAME=policies
    export STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=..."
    export OPENAI_ENDPOINT=https://oai-policyhub-prod-lh.openai.azure.com/
    export OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large

    python import_policies.py --csv policy_metadata_import.csv [--dry-run] [--skip-embeddings]
"""

import argparse
import csv
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import mammoth
from azure.core.credentials import AzureKeyCredential
from azure.identity import DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.storage.blob import BlobServiceClient
from openai import AzureOpenAI

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── Config ────────────────────────────────────────────────────────────────────

SEARCH_ENDPOINT      = os.environ.get('SEARCH_ENDPOINT', '')
SEARCH_INDEX_NAME    = os.environ.get('SEARCH_INDEX_NAME', 'policies')
SEARCH_API_KEY       = os.environ.get('SEARCH_API_KEY', '')  # optional — uses managed identity if blank
STORAGE_CONN_STR     = os.environ.get('STORAGE_CONNECTION_STRING', '')
OPENAI_ENDPOINT      = os.environ.get('OPENAI_ENDPOINT', '')
OPENAI_API_KEY       = os.environ.get('OPENAI_API_KEY', '')  # optional — uses managed identity if blank
EMBEDDING_DEPLOYMENT = os.environ.get('OPENAI_EMBEDDING_DEPLOYMENT', 'text-embedding-3-large')

CONTAINERS = ['policies-published', 'policies-draft', 'policies-archive']

SECTION_HEADERS = ['SCOPE', 'PURPOSE', 'DEFINITIONS', 'POLICY', 'PROCEDURE',
                   'REFERENCES', 'STATE ADDENDUM', 'STATE ADDENDUM — TENNESSEE']

HEADER_TO_KEY = {
    'SCOPE': 'scope', 'PURPOSE': 'purpose', 'DEFINITIONS': 'definitions',
    'POLICY': 'policyText', 'PROCEDURE': 'procedureText',
    'REFERENCES': 'references', 'STATE ADDENDUM': 'stateAddendum',
    'STATE ADDENDUM — TENNESSEE': 'stateAddendum',
}

# ── Clients ───────────────────────────────────────────────────────────────────

def get_search_client() -> SearchClient:
    if SEARCH_API_KEY:
        cred = AzureKeyCredential(SEARCH_API_KEY)
    else:
        cred = DefaultAzureCredential()
    return SearchClient(SEARCH_ENDPOINT, SEARCH_INDEX_NAME, cred)


def get_blob_client() -> BlobServiceClient:
    return BlobServiceClient.from_connection_string(STORAGE_CONN_STR)


def get_openai_client() -> AzureOpenAI:
    if OPENAI_API_KEY:
        return AzureOpenAI(api_key=OPENAI_API_KEY, azure_endpoint=OPENAI_ENDPOINT, api_version='2024-10-01-preview')
    from azure.identity import get_bearer_token_provider
    token_provider = get_bearer_token_provider(DefaultAzureCredential(), 'https://cognitiveservices.azure.com/.default')
    return AzureOpenAI(azure_ad_token_provider=token_provider, azure_endpoint=OPENAI_ENDPOINT, api_version='2024-10-01-preview')

# ── Document parsing ──────────────────────────────────────────────────────────

def parse_docx(data: bytes) -> dict:
    result = mammoth.extract_raw_text({'value': data})
    lines = [l.strip() for l in result.value.split('\n') if l.strip()]

    sections: dict[str, list[str]] = {}
    current = None

    for line in lines:
        norm = line.upper().replace('\s+', ' ').strip()
        matched = next((h for h in SECTION_HEADERS if norm == h or norm.startswith(h)), None)
        if matched:
            current = HEADER_TO_KEY[matched]
            sections.setdefault(current, [])
            continue
        if line.lower().startswith(('category', 'effective date', 'review date', 'owner', 'legal review', 'source')):
            continue
        if current:
            sections[current] = sections.get(current, [])
            sections[current].append(line)

    def join(key):
        return ' '.join(sections.get(key, [])).strip()

    scope     = join('scope')
    purpose   = join('purpose')
    policy    = join('policyText')
    procedure = join('procedureText')
    full_text = ' '.join(filter(None, [scope, purpose, policy, procedure]))

    return {
        'scope': scope,
        'purpose': purpose,
        'policyText': policy,
        'procedureText': procedure,
        'fullText': full_text,
    }


def generate_embedding(client: AzureOpenAI, text: str, skip: bool = False) -> list[float]:
    if skip or not text:
        return [0.0] * 3072  # Zero vector placeholder
    truncated = text[:32000]
    resp = client.embeddings.create(model=EMBEDDING_DEPLOYMENT, input=truncated)
    return resp.data[0].embedding

# ── Blob lookup ───────────────────────────────────────────────────────────────

def find_blob(blob_client: BlobServiceClient, policy_number: str, expected_filename: str):
    """Search all containers for a blob matching this policy number."""
    prefix = policy_number.replace('.', '-')

    for container_name in CONTAINERS:
        container = blob_client.get_container_client(container_name)
        try:
            blobs = list(container.list_blobs(name_starts_with=prefix))
            if blobs:
                blob = blobs[0]
                return container_name, blob.name, f'https://{blob_client.account_name}.blob.core.windows.net/{container_name}/{blob.name}'
        except Exception:
            continue
    return None, None, None

# ── Main import ───────────────────────────────────────────────────────────────

def load_csv(path: str) -> list[dict]:
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def to_iso_date(val: str) -> Optional[str]:
    if not val or val.strip() in ('', 'nan', 'NaN'):
        return None
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
        try:
            return datetime.strptime(val.strip(), fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def run_import(csv_path: str, dry_run: bool, skip_embeddings: bool, batch_size: int = 20):
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Luminary Policy Hub — Bulk Import")
    print(f"CSV: {csv_path}")
    print(f"Index: {SEARCH_INDEX_NAME}\n")

    rows = load_csv(csv_path)
    print(f"Loaded {len(rows)} policies from CSV\n")

    if not dry_run:
        search = get_search_client()
        blob_svc = get_blob_client() if STORAGE_CONN_STR else None
        oai = get_openai_client() if OPENAI_ENDPOINT else None
    else:
        search = blob_svc = oai = None

    docs_batch = []
    stats = {'indexed': 0, 'with_content': 0, 'metadata_only': 0, 'errors': 0}

    for i, row in enumerate(rows, 1):
        policy_number = row.get('policyNumber', '').strip()
        if not policy_number:
            continue

        print(f"[{i:3d}/{len(rows)}] {policy_number} — {row.get('title', '')[:60]}", end='')

        doc_id = policy_number.replace('.', '-')

        # Base document from CSV metadata
        doc = {
            'id':           doc_id,
            'policyNumber': policy_number,
            'title':        row.get('title', '').strip(),
            'category':     row.get('category', '').strip(),
            'subCategory':  row.get('subCategory', '').strip() if row.get('subCategory') and row['subCategory'] not in ('nan', '') else '',
            'owner':        row.get('owner', '').strip(),
            'status':       row.get('status', 'published').strip() or 'published',
            'effectiveDate': to_iso_date(row.get('effectiveDate', '')),
            'reviewDate':    to_iso_date(row.get('reviewDate', '')),
            'legalReview':  row.get('legalReview', 'FALSE').strip().upper() == 'TRUE',
            'chapStandard': row.get('chapStandard', '').strip() if row.get('chapStandard') and row['chapStandard'] not in ('nan', '') else '',
            'corridorRef':  row.get('corridorRef', '').strip() if row.get('corridorRef') and row['corridorRef'] not in ('nan', '') else '',
            'scope': '', 'purpose': '', 'policyText': '', 'procedureText': '',
            'fullText': f"{row.get('title', '')} {row.get('category', '')} {row.get('chapStandard', '')}",
            'blobUrl':  '',
            'blobPath': '',
            'contentVector': [0.0] * 3072,
        }

        # Try to find and parse the blob
        if blob_svc and not dry_run:
            container_name, blob_name, blob_url = find_blob(blob_svc, policy_number, row.get('blobFilename', ''))
            if blob_name:
                try:
                    container = blob_svc.get_container_client(container_name)
                    data = container.get_blob_client(blob_name).download_blob().readall()
                    parsed = parse_docx(data)
                    doc.update(parsed)
                    doc['blobUrl']  = blob_url
                    doc['blobPath'] = f"{container_name}/{blob_name}"
                    # Update status from container
                    if container_name == 'policies-published': doc['status'] = 'published'
                    elif container_name == 'policies-draft':   doc['status'] = 'draft'
                    print(f" ✓ blob found", end='')
                    stats['with_content'] += 1
                except Exception as e:
                    print(f" ⚠ parse error: {e}", end='')
                    stats['errors'] += 1
            else:
                print(f" · no blob", end='')
                stats['metadata_only'] += 1
        elif dry_run:
            print(f" · [dry run]", end='')

        # Generate embedding
        if oai and doc.get('fullText') and not skip_embeddings and not dry_run:
            try:
                doc['contentVector'] = generate_embedding(oai, doc['fullText'])
                time.sleep(0.1)  # Rate limit buffer
            except Exception as e:
                print(f" ⚠ embedding error: {e}", end='')

        print()

        docs_batch.append(doc)
        stats['indexed'] += 1

        # Upload in batches of 20
        if len(docs_batch) >= batch_size and not dry_run:
            try:
                search.merge_or_upload_documents(docs_batch)
                print(f"  → Upserted batch of {len(docs_batch)}")
            except Exception as e:
                print(f"  ✗ Batch upload error: {e}")
                stats['errors'] += len(docs_batch)
            docs_batch = []

    # Upload remaining
    if docs_batch and not dry_run:
        try:
            search.merge_or_upload_documents(docs_batch)
            print(f"  → Upserted final batch of {len(docs_batch)}")
        except Exception as e:
            print(f"  ✗ Final batch error: {e}")
            stats['errors'] += len(docs_batch)

    print(f"\n{'='*60}")
    print(f"Import {'(dry run) ' if dry_run else ''}complete:")
    print(f"  Total processed : {stats['indexed']}")
    print(f"  With doc content: {stats['with_content']}")
    print(f"  Metadata only   : {stats['metadata_only']}")
    print(f"  Errors          : {stats['errors']}")
    print(f"{'='*60}\n")

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Luminary Policy Hub — Bulk Metadata Import')
    parser.add_argument('--csv',              default='policy_metadata_import.csv', help='Path to the metadata CSV')
    parser.add_argument('--dry-run',          action='store_true', help='Validate CSV without writing to Azure')
    parser.add_argument('--skip-embeddings',  action='store_true', help='Skip embedding generation (faster, no AI Q&A until re-indexed)')
    parser.add_argument('--batch-size',       type=int, default=20, help='Documents per upload batch (default: 20)')
    args = parser.parse_args()

    if not args.dry_run:
        missing = []
        if not SEARCH_ENDPOINT:  missing.append('SEARCH_ENDPOINT')
        if not STORAGE_CONN_STR: missing.append('STORAGE_CONNECTION_STRING')
        if not OPENAI_ENDPOINT and not args.skip_embeddings:
            missing.append('OPENAI_ENDPOINT (or use --skip-embeddings)')
        if missing:
            print(f"ERROR: Missing required environment variables:\n  " + '\n  '.join(missing))
            sys.exit(1)

    run_import(args.csv, args.dry_run, args.skip_embeddings, args.batch_size)
