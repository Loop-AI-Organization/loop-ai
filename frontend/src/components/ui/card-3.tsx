import * as React from "react"
import { ArrowUpRight } from "lucide-react"
import { Cross2Icon } from "@radix-ui/react-icons"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const PaymentSummaryCard = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex w-full flex-col gap-6 rounded-xl bg-secondary p-6 text-secondary-foreground",
      className
    )}
    {...props}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Payment Method</span>
        <span className="flex h-5 w-fit items-center justify-center rounded-full bg-[#F97316]/10 px-2 text-[10px] font-medium text-[#F97316]">
          Custom
        </span>
      </div>
      <Cross2Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <div className="flex items-center justify-between">
      <div className="flex flex-col items-center gap-2">
        <Avatar className="h-12 w-12 rounded-xl" />
        <div className="flex items-center gap-1">
          <Avatar className="h-6 w-6 rounded-full" />
          <Avatar className="h-6 w-6 rounded-full" />
          <Avatar className="h-6 w-6 rounded-full" />
          <Avatar className="h-6 w-6 rounded-full" />
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-[#F97316]/10 px-3 py-1">
        <ArrowUpRight className="h-4 w-4 text-[#F97316]" />
        <span className="text-sm font-medium text-[#F97316]">4.5%</span>
      </div>
    </div>
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Total balance</span>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold">$2,139</span>
          <span className="rounded-md bg-[#22C55E]/10 px-2 py-1 text-xs font-medium text-[#22C55E]">
            +12.5%
          </span>
        </div>
      </div>
      <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316] text-white hover:bg-[#F97316]/90">
        <ArrowUpRight className="h-6 w-6" />
      </button>
    </div>
    <div className="flex h-32 w-full flex-col gap-4 rounded-lg bg-secondary/50 p-4" />
  </div>
)

export { PaymentSummaryCard }