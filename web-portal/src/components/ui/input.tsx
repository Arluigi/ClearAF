import * as React from "react"

import { cn } from "@/lib/utils"

// Letterpress §4.2: a 1.5px baseline rule, not a box. Ink at 50% while empty (3:1 or better on every paper tone),
// ink when filled or focused. `data-empty` comes from a controlled value; uncontrolled inputs rely on focus.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, ...props }, ref) => {
    const empty = value === undefined ? undefined : String(value).length === 0
    return (
      <input
        type={type}
        value={value}
        data-empty={empty}
        className={cn(
          "flex h-9 w-full rounded-none border-0 border-b-[1.5px] border-rule-field bg-transparent px-0 py-1 text-base text-ink transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-tertiary focus-visible:border-ink data-[empty=false]:border-ink disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-tertiary md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
