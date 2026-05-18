"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@/lib/utils";
import type React from "react";
import { useId } from "react";
import { Switch } from "@/components/ui/component";

function Label({ className, render, ...props }: useRender.ComponentProps<"label">): React.ReactElement {
  return useRender({
    defaultTagName: "label",
    props: mergeProps<"label">({ className: cn("inline-flex items-center gap-2 font-medium text-base/4.5 text-foreground sm:text-sm/4", className), "data-slot": "label" }, props),
    render,
  });
}

export default function Particle() {
  const id = useId();
  return (
    <div className="flex items-center justify-center w-full min-h-screen bg-background">
      <div className="flex items-start gap-2">
        <Switch defaultChecked id={id} />
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>Marketing emails</Label>
          <p className="text-muted-foreground text-xs">
            By enabling marketing emails, you agree to receive emails.
          </p>
        </div>
      </div>
    </div>
  );
}