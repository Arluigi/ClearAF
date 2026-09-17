"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

// Ink switch (mockup 44×24). Off: outlined track in ink at 50% (3:1 or better) with an ink.tertiary thumb at the start.
// On: solid ink track with a canvas thumb at the end. Position and fill both change, so state never relies on hue.
// Disabled = sunk + ink.tertiary (spec §5). `disabled:` and `data-[state=*]:` share specificity, so a plain
// `disabled:bg-sunk` compiles ahead of `data-[state=checked]:bg-ink` and loses the cascade — a disabled-checked
// switch rendered as if it were enabled. Stacking `disabled:data-[state=*]:` raises the selector to three simple
// selectors, which always outranks the two-selector state classes regardless of Tailwind's output order.
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "group peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:cursor-not-allowed data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=unchecked]:border-rule-field data-[state=unchecked]:bg-transparent disabled:data-[state=checked]:border-rule disabled:data-[state=checked]:bg-sunk disabled:data-[state=unchecked]:border-rule disabled:data-[state=unchecked]:bg-sunk",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-canvas data-[state=unchecked]:translate-x-[2px] data-[state=unchecked]:bg-ink-tertiary group-disabled:bg-ink-tertiary"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
