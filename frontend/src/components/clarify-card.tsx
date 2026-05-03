import { ListChecks, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';

interface ClarifyOption {
  label: string;
  query: string;
  icon: React.ReactNode;
}

interface ClarifyCardProps {
  aLabel: string;
  aQuery: string;
  bLabel: string;
  bQuery: string;
}

export function ClarifyCard({ aLabel, aQuery, bLabel, bQuery }: ClarifyCardProps) {
  const setPendingSubmit = useAppStore((s) => s.setPendingSubmit);

  const options: ClarifyOption[] = [
    { label: aLabel, query: `@ai ${aQuery}`, icon: <ListChecks className="w-4 h-4" /> },
    { label: bLabel, query: `@ai ${bQuery}`, icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-2 my-1 p-3 rounded-lg border border-border bg-muted/30 max-w-sm">
      <p className="text-xs text-muted-foreground">Choose one:</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <Button
            key={opt.label}
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 text-xs h-8"
            onClick={() => setPendingSubmit(opt.query)}
          >
            {opt.icon}
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
