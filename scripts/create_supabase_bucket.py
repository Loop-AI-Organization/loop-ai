#!/usr/bin/env python3
"""
One-time script to create the Supabase storage bucket `workspace-files`.
Run from repo root: python scripts/create_supabase_bucket.py
Requires .env at repo root with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""
from pathlib import Path
import os
import sys

# Repo root = parent of scripts/
REPO_ROOT = Path(__file__).resolve().parent.parent
os.chdir(REPO_ROOT)
sys.path.insert(0, str(REPO_ROOT / "backend"))

from dotenv import load_dotenv
load_dotenv(REPO_ROOT / ".env")

from supabase import create_client

BUCKET_ID = "workspace-files"

def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env", file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)
    try:
        client.storage.create_bucket(BUCKET_ID, options={"public": False})
        print(f"Created bucket: {BUCKET_ID}")
    except Exception as e:
        if "already exists" in str(e).lower() or "409" in str(e) or "duplicate" in str(e).lower():
            print(f"Bucket {BUCKET_ID} already exists.")
        else:
            print(f"Error creating bucket: {e}", file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":
    main()
