import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-accent data-[state=unchecked]:bg-input",
  {
    variants: {
      variant: {
        default:
          "data-[state=on]:bg-primary data-[state=unchecked]:bg-accent",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground data-[state=on]:bg-accent data-[state=unchecked]:bg-transparent",
      },
      size: {
        default: "h-10 w-11 px-3",
        sm: "h-9 w-9 px-2.5",
        lg: "h-11 w-13 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const toggleThumbVariants = cva(
  "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform",
  {
    variants: {
      variant: {
        default: "bg-background",
        outline: "bg-foreground",
      },
      size: {
        sm: "h-4 w-4 data-[state=on]:translate-x-4 data-[state=unchecked]:translate-x-0",
        default:
          "h-5 w-5 data-[state=on]:translate-x-5 data-[state=unchecked]:translate-x-0",
        lg: "h-6 w-6 data-[state=on]:translate-x-6 data-[state=unchecked]:translate-x-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ToggleProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
    VariantProps<typeof toggleVariants> {
  animated?: boolean;
}

const Toggle = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  ToggleProps
>(
  (
    {
      className,
      variant,
      size,
      animated = true,
      ...props
    },
    ref,
  ) => {
    const thumbClassName = toggleThumbVariants({ variant, size });

    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={cn(toggleVariants({ variant, size }), className)}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={thumbClassName}
          asChild={animated}
        >
          {animated ? (
            <motion.div
              layout
              transition={{
                type: "spring",
                stiffness: 700,
                damping: 30,
              }}
              className={thumbClassName}
            />
          ) : (
            <div className={thumbClassName} />
          )}
        </SwitchPrimitive.Thumb>
      </SwitchPrimitive.Root>
    );
  },
);

Toggle.displayName = SwitchPrimitive.Root.displayName;

export { Toggle, toggleVariants };
