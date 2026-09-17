import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Letterpress §4.1: filled ink (one per screen), outlined (1px ink at 32%), text-underline. Radius 4.
// Portal density: 32–36px for row, toolbar and inline controls; lg (44px) only for a full-width primary action.
// Disabled is sunk + ink.tertiary; the screen says why in a sentence.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-normal text-center rounded text-[13px] font-medium leading-tight transition-colors disabled:pointer-events-none disabled:bg-sunk disabled:text-ink-tertiary [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-canvas hover:bg-ink/90",
        outline: "border border-ink/[0.32] bg-transparent text-ink hover:bg-sunk disabled:border-transparent",
        secondary: "border border-ink/[0.32] bg-transparent text-ink hover:bg-sunk disabled:border-transparent",
        destructive: "border border-error bg-transparent text-error hover:bg-sunk disabled:border-transparent",
        ghost: "bg-transparent text-ink hover:bg-sunk",
        link: "bg-transparent text-ink underline underline-offset-[3px] hover:decoration-2 disabled:bg-transparent",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 px-3 py-1.5",
        lg: "min-h-11 px-6 py-2.5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
