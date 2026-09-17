"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Letterpress §4.3. `segmented` (default) for 2–3 way filters: square sunk track, surface thumb carrying the
// spec elevation. `underline` for workspace sections: a 2px ink rule under the list; the active tab adds its
// own 2px ink rule. The segmented thumb is 1.2:1 against sunk, so the active trigger also changes weight and
// draws an inset ink hairline.
type TabsVariant = "segmented" | "underline"

const TabsVariantContext = React.createContext<TabsVariant>("segmented")

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva("inline-flex items-center text-ink-secondary", {
  variants: {
    variant: {
      segmented: "gap-0.5 rounded-none bg-sunk p-0.5",
      underline: "w-full gap-6 border-b-2 border-ink",
    },
  },
  defaultVariants: { variant: "segmented" },
})

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-[13px] font-[450] transition-colors disabled:pointer-events-none disabled:text-ink-tertiary data-[state=active]:font-medium data-[state=active]:text-ink",
  {
    variants: {
      variant: {
        segmented:
          "min-h-8 rounded-none px-3 data-[state=active]:bg-surface data-[state=active]:shadow-[0_1px_2px_rgba(18,19,18,.14),inset_0_0_0_1px_rgb(var(--ink)/0.5)]",
        underline: "border-b-2 border-transparent pb-2.5 text-sm data-[state=active]:border-ink",
      },
    },
    defaultVariants: { variant: "segmented" },
  }
)

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "segmented", ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  </TabsVariantContext.Provider>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4", className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
