import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Letterpress chips: square, mono 11, tabular figures, no fill hue.
// `attention` (attention.wash + attention.text) is reserved for unread and prescription.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-none border px-2 py-0.5 font-data text-[11px] font-medium uppercase leading-4 tracking-[0.06em] tabular-nums",
  {
    variants: {
      variant: {
        default: "border-ink/30 text-ink",
        secondary: "border-transparent bg-sunk text-ink-secondary",
        destructive: "border-error text-error",
        outline: "border-ink/30 text-ink",
        attention: "border-transparent bg-attention-wash text-attention-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
