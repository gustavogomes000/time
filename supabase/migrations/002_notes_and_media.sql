-- ============================================================================
-- Demanda do Gustavo — Migration 002: Notion-style Folders, Subfolders, Cards & Media
-- ============================================================================

-- 1. Hierarchical Folders & Subfolders (unlimited nesting via parent_id)
CREATE TABLE IF NOT EXISTS public.gustavo_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.gustavo_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT 'sky',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gustavo_folders_parent ON public.gustavo_folders(parent_id, position, created_at);

-- 2. Notion-style Cards / Notes
CREATE TABLE IF NOT EXISTS public.gustavo_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES public.gustavo_folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Sem título',
  icon TEXT NOT NULL DEFAULT '📝',
  cover_color TEXT NOT NULL DEFAULT 'sky',
  pinned BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] NOT NULL DEFAULT '{}',
  content TEXT NOT NULL DEFAULT '',
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gustavo_notes_folder ON public.gustavo_notes(folder_id, pinned DESC, updated_at DESC);

-- 3. Chunked Media Storage (Photos & Videos stored in Supabase PostgreSQL)
CREATE TABLE IF NOT EXISTS public.gustavo_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES public.gustavo_notes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  total_size BIGINT NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL DEFAULT 2000000,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gustavo_media_note ON public.gustavo_media(note_id);

CREATE TABLE IF NOT EXISTS public.gustavo_media_chunks (
  media_id UUID NOT NULL REFERENCES public.gustavo_media(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  data BYTEA NOT NULL,
  PRIMARY KEY (media_id, chunk_index)
);

-- Enable RLS so direct anonymous PostgREST access remains locked down
ALTER TABLE public.gustavo_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gustavo_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gustavo_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gustavo_media_chunks ENABLE ROW LEVEL SECURITY;
