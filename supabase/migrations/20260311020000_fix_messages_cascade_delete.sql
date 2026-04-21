-- Fix: foreign keys referencing threads are missing ON DELETE CASCADE.
-- Drop and re-add them with CASCADE so deleting a thread cleans up
-- messages and actions.

-- messages -> threads
ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_thread_id_fkey;
ALTER TABLE public.messages
    ADD CONSTRAINT messages_thread_id_fkey
    FOREIGN KEY (thread_id) REFERENCES public.threads(id) ON DELETE CASCADE;

-- actions -> threads
ALTER TABLE public.actions
    DROP CONSTRAINT IF EXISTS actions_thread_id_fkey;
ALTER TABLE public.actions
    ADD CONSTRAINT actions_thread_id_fkey
    FOREIGN KEY (thread_id) REFERENCES public.threads(id) ON DELETE CASCADE;
