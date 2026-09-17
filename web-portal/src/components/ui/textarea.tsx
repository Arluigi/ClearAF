import * as React from "react"

import { cn } from "@/lib/utils"

// Letterpress §4.2 bounded-editor field: a multi-line area shows its extent, so it keeps a border on `surface`.
// Border is ink at 50% (3:1 or better), ink on focus.
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-none border border-rule-field bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-tertiary focus-visible:border-ink disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-tertiary md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
