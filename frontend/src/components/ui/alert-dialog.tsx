import * as React from "react"
import { AlertCircle, Check } from "lucide-react"
import { AlertDialog as AlertPrimitive } from "@radix-ui/react-alert-dialog"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const Alert = AlertPrimitive.Root
const AlertTrigger = AlertPrimitive.Trigger
const AlertPortal = AlertPrimitive.Portal

const AlertOverlay = React.forwardRef<
  React.ElementRef<typeof AlertPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertPrimitive.Overlay
    className={cn(
      "fixed inset- z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertOverlay.displayName = AlertPrimitive.Overlay.displayName

const AlertContent = React.forwardRef<
  React.ElementRef<typeof AlertPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertPortal>
    <AlertPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
      ref={ref}
    />
  </AlertPortal>
))
AlertContent.displayName = AlertPrimitive.Content.displayName

const AlertIcon = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100",
      className
    )}
    {...props}
  >
    <AlertCircle className="h-6 w-6 text-red-600" />
  </div>
)
AlertIcon.displayName = "AlertIcon"

const AlertTitle = React.forwardRef<
  React.ElementRef<typeof AlertPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
))
AlertTitle.displayName = AlertPrimitive.Title.displayName

const AlertDescription = React.forwardRef<
  React.ElementRef<typeof AlertPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
AlertDescription.displayName = AlertPrimitive.Description.displayName

const AlertToolbar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:gap-0",
      className
    )}
    {...props}
  />
))
AlertToolbar.displayName = "AlertToolbar"

const AlertAction = React.forwardRef<
  React.ElementRef<typeof AlertPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), "gap-1", className)}
    {...props}
  />
))
AlertAction.displayName = AlertPrimitive.Action.displayName

export {
  Alert,
  AlertTrigger,
  AlertOverlay,
  AlertContent,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  AlertToolbar,
  AlertAction,
}