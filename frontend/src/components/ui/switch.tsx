import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

type SwitchContext = {
  disabled?: boolean
}

const SwitchContext = React.createContext<SwitchContext | null>(null)

const useSwitchContext = () => {
  const context = React.useContext(SwitchContext)
  if (!context) {
    throw new Error("Switch components must be used within a Switch")
  }
  return context
}

const Switch = ({
  disabled,
  ...props
}: SwitchPrimitives.SwitchProps & { disabled?: boolean }) => {
  return (
    <SwitchContext.Provider value={{ disabled }}>
      <SwitchPrimitives.Root
        {...props}
        disabled={disabled}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
          props.className
        )}
      />
    </SwitchContext.Provider>
  )
}

const SwitchControl = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Thumb>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Thumb>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Thumb
    ref={ref}
    className={cn(
      "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      className
    )}
    {...props}
  />
))
SwitchControl.displayName = "SwitchControl"

const SwitchLabel = React.forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<"label">
>(({ className, ...props }, ref) => {
  const { disabled } = useSwitchContext()
  return (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
})
SwitchLabel.displayName = "SwitchLabel"

export { Switch, SwitchControl, SwitchLabel }