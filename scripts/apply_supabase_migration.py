#!/usr/bin/env python3
"""
Apply Supabase migrations using DATABASE_URL (no CLI required).
Runs all SQL files in supabase/migrations/ in filename order.
Run from repo root: python scripts/apply_supabase_migration.py
Requires .env at repo root with DATABASE_URL (from Supabase Dashboard → Settings → Database → Connection string, URI mode).
"""
from pathlib import Path
import os
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"


def main():
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / ".env")

    database_url = os.environ.get("DATABASE_URL")
    if not database_url or not database_url.strip():
        print(
            "Missing DATABASE_URL in .env. Set it from Supabase Dashboard → Settings → Database → Connection string (URI).",
            file=sys.stderr,
        )
        print("Alternatively use: npx supabase link --project-ref <REF> -p <PASSWORD> then npx supabase db push", file=sys.stderr)
        sys.exit(1)

    if "HOST_FROM_DASHBOARD" in database_url or "localhost" in database_url:
        print(
            "Replace HOST_FROM_DASHBOARD in DATABASE_URL with the real pooler host from Supabase Dashboard → Settings → Database (e.g. aws-0-<region>.pooler.supabase.com).",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        import psycopg2
    except ImportError:
        print("Install psycopg2-binary: pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)

    if not MIGRATIONS_DIR.exists():
        print(f"Migrations dir not found: {MIGRATIONS_DIR}", file=sys.stderr)
        sys.exit(1)

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        print(f"No .sql files in {MIGRATIONS_DIR}", file=sys.stderr)
        sys.exit(1)

    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = False
        try:
            with conn.cursor() as cur:
                for p in migration_files:
                    sql = p.read_text(encoding="utf-8")
                    cur.execute(sql)
                    print(f"Applied: {p.name}")
            conn.commit()
            print("All migrations applied successfully.")
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
