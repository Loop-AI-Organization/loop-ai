# conftest.py - Sets up environment for tests
import os

# Use fake but JWT-formatted keys to pass supabase client validation
os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDQwMDAwMDAsImV4cCI6MTk1OTU3NjAwMH0.placeholder")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY0NDAwMDAwMCwiZXhwIjoxOTU5NTc2MDAwfQ.placeholder")
os.environ.setdefault("OPENROUTER_API_KEY", "sk-placeholder")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")