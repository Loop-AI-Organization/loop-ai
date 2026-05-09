import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportChannelTasks } from '@/lib/supabase-data';
import { getAuthHeaders } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  getAuthHeaders: vi.fn(),
  getSupabase: vi.fn(),
}));

describe('exportChannelTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthHeaders).mockResolvedValue({ Authorization: 'Bearer token' });
    globalThis.fetch = vi.fn();
  });

  it('posts to channel task export route and maps returned file row to FileRecord', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        file: {
          id: 'file-1',
          workspace_id: 'ws-1',
          source: 'generated',
          storage_path: 'ws-1/docs/tasks.md',
          file_name: 'tasks.md',
          file_size: 1234,
          content_type: 'text/markdown',
          created_by: 'user-1',
          created_at: '2026-05-08T12:00:00.000Z',
          summary: 'Exported tasks',
          project_context: 'Sprint 3',
          tags: ['tasks'],
          metadata_status: 'ready',
          source_channel_id: 'channel-1',
        },
      }),
    } as Response);

    const file = await exportChannelTasks('channel-1');

    expect(getAuthHeaders).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toMatch(/\/api\/channels\/channel-1\/tasks\/export$/);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    });
    expect(file).toEqual({
      id: 'file-1',
      workspaceId: 'ws-1',
      source: 'generated',
      storagePath: 'ws-1/docs/tasks.md',
      fileName: 'tasks.md',
      fileSize: 1234,
      contentType: 'text/markdown',
      createdBy: 'user-1',
      createdAt: new Date('2026-05-08T12:00:00.000Z'),
      summary: 'Exported tasks',
      projectContext: 'Sprint 3',
      tags: ['tasks'],
      metadataStatus: 'ready',
      sourceChannelId: 'channel-1',
    });
  });

  it('throws backend detail when export fails', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'No confirmed tasks to export' }),
    } as Response);

    await expect(exportChannelTasks('channel-1')).rejects.toThrow('No confirmed tasks to export');
  });
});
