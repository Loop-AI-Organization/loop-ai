#!/usr/bin/env python3
"""
Apply Supabase tables migration using DATABASE_URL (no CLI required).
Run from repo root: python scripts/apply_supabase_migration.py
Requires .env at repo root with DATABASE_URL (from Supabase Dashboard → Settings → Database → Connection string).
"""
from pathlib import Path
import os
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent

def main():
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / ".env")

    database_url = os.environ.get("DATABASE_URL")
    if not database_url or not database_url.strip():
        print(
            "Missing DATABASE_URL in .env. Set it from Supabase Dashboard → Settings → Database → Connection string (URI).",
            file=sys.stderr,
        )
        print("Alternatively use Tables setup option A (CLI) or B (Dashboard SQL Editor).", file=sys.stderr)
        sys.exit(1)

    try:
        import psycopg2
    except ImportError:
        print("Install psycopg2-binary: pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)

    sql_file = REPO_ROOT / "supabase" / "setup_tables_manual.sql"
    if not sql_file.exists():
        print(f"Migration file not found: {sql_file}", file=sys.stderr)
        sys.exit(1)

    sql = sql_file.read_text(encoding="utf-8")

    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = False
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
            print("Migration applied successfully (threads + actions tables and RLS).")
        except Exception as e:
            conn.rollback()
            print(f"Migration failed: {e}", file=sys.stderr)
            sys.exit(1)
        finally:
            conn.close()
    except Exception as e:
        print(f"Cannot connect to database: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
