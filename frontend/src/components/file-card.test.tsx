import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { FileCard } from '@/components/file-card';
import { useAppStore } from '@/store/app-store';
import type { FileRecord } from '@/types';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/supabase-data', () => ({
  getFileDownloadUrl: vi.fn(),
}));

describe('FileCard', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    useAppStore.setState({ selectedFileContext: [] });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
    }
    container?.remove();
    root = null;
    container = null;
  });

  async function renderCard(file: FileRecord) {
    container = document.createElement('div');
    container.style.width = '280px';
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<FileCard file={file} />);
    });
  }

  it('keeps download actions inside narrow inspector panels', async () => {
    await renderCard(fileRecord({ fileName: 'Very-long-exported-task-list-name-that-needs-truncation.md' }));

    const card = container!.firstElementChild as HTMLElement;
    expect(card.className).toContain('w-full');
    expect(card.className).toContain('min-w-0');
    expect(card.className).toContain('grid-cols-[2.25rem_minmax(0,1fr)_4.5rem]');
    expect(card.className).not.toContain('max-w-md');
    expect(container!.querySelector('button[aria-label="Download"]')).not.toBeNull();
    expect(container!.querySelector('button[aria-label="Ask about this file"]')).not.toBeNull();
  });
});

function fileRecord(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 'file-1',
    workspaceId: 'ws-1',
    source: 'generated',
    storagePath: 'ws-1/exports/file-1.md',
    fileName: 'Task-List.md',
    fileSize: 87,
    contentType: 'text/markdown',
    createdBy: 'user-1',
    createdAt: new Date('2026-05-12T18:00:00Z'),
    summary: 'Task export: 1 task(s)',
    projectContext: 'Exported from channel tasks',
    tags: ['tasks'],
    metadataStatus: 'ready',
    sourceChannelId: 'ch-1',
    ...overrides,
  };
}
