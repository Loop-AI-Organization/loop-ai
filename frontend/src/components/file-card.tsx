import { useState } from 'react';
import {
  FileText,
  Image,
  File,
  FileCode,
  Download,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFileDownloadUrl } from '@/lib/supabase-data';
import type { FileRecord } from '@/types';
import { cn } from '@/lib/utils';

function getFileIcon(contentType: string | null) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return Image;
  if (ct === 'application/pdf' || ct === 'text/markdown') return FileText;
  if (ct.startsWith('text/') || ct.includes('json') || ct.includes('javascript'))
    return FileCode;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileCardProps {
  file: FileRecord;
}

export function FileCard({ file }: FileCardProps) {
  const [downloading, setDownloading] = useState(false);
  const Icon = getFileIcon(file.contentType);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getFileDownloadUrl(file.id);
      window.open(url, '_blank');
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 my-1 rounded-lg border border-border bg-muted/30 max-w-md">
      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{file.fileName}</p>
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0',
              file.source === 'generated'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {file.source === 'generated' ? 'Generated' : 'Uploaded'}
          </span>
        </div>
        <div className="text-xs text-muted-foreground min-w-0 space-y-0.5">
          {file.metadataStatus === 'pending' ? (
            <p className="truncate">
              <span className="inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing...
              </span>
            </p>
          ) : (
            <>
              {file.summary ? (
                <p className="truncate">{file.summary}</p>
              ) : null}
              <p className="truncate">
                {formatFileSize(file.fileSize)} · {file.createdAt.toLocaleDateString()}
              </p>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0"
        onClick={handleDownload}
        disabled={downloading}
        title="Download"
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}
