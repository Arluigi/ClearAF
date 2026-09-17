"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Letterpress §4.2 persistent field label (mockup `.lbl`): mono 500, 10px, .16em, uppercase, ink.tertiary.
const labelVariants = cva(
  "font-data text-[10px] font-medium uppercase leading-none tracking-[0.16em] text-ink-tertiary peer-disabled:cursor-not-allowed"
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
