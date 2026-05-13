import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[5px] bg-skeleton-gradient bg-[length:400%_100%] animate-skeleton-loading",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
