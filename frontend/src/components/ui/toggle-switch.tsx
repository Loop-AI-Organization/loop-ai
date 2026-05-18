import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function ToggleSwitch({
  checked = false,
  onChange,
  disabled = false,
  label,
  className
}: ToggleSwitchProps) {
  return (
    <label className={cn("relative inline-flex cursor-pointer items-center gap-3 text-foreground", disabled && "opacity-50 cursor-not-allowed", className)}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <div className="peer h-7 w-12 rounded-full bg-secondary ring-offset-1 transition-colors duration-200 peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 dark:ring-offset-background" />
      <span className="dot absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out peer-checked:translate-x-5" />
      {label && <span className="text-sm font-medium">{label}</span>}
    </label>
  );
}

export function ToggleSwitchLarge({
  checked = false,
  onChange,
  disabled = false,
  label,
  className
}: ToggleSwitchProps & { size?: "lg" }) {
  return (
    <label className={cn("relative inline-flex cursor-pointer items-center gap-3 text-foreground", disabled && "opacity-50 cursor-not-allowed", className)}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <div className="peer h-8 w-16 rounded-full bg-secondary ring-offset-1 transition-colors duration-200 peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 dark:ring-offset-background" />
      <span className="dot absolute left-1 top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out peer-checked:translate-x-8" />
      {label && <span className="text-sm font-medium">{label}</span>}
    </label>
  );
}

export default ToggleSwitch;