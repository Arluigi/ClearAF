"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

// Letterpress calendar cells: square, mono tabular day numbers, today outlined 1.5px in ink,
// selection is an ink fill. Outside-month days use ink.future (the only de-emphasis token); disabled
// days land on sunk + ink.tertiary instead (see CalendarDayButton) because ink.future fails 4.5:1 once
// composited on sunk in dark mode.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-canvas group/calendar p-3 [--cell-size:2rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        // `**:` (match every descendant) is Tailwind v4 syntax and compiles to nothing under v3.4 — this
        // project pins 3.4.17. `[&_selector]` is the v3 equivalent: `&` is this class, `_` is the descendant
        // combinator, so the rule still targets `.rdp-button_next > svg` anywhere under the calendar root.
        String.raw`rtl:[&_.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:[&_.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:text-ink-future",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:text-ink-future",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-[--cell-size] w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          // `has-focus:` is Tailwind v4 syntax; the v3.4 equivalent is the arbitrary `has-[]` variant.
          "relative rounded-none border-b-[1.5px] border-rule-field has-[:focus]:border-ink",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "bg-surface absolute inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "[&>svg]:text-ink-secondary flex h-8 items-center gap-1 rounded-none pl-2 pr-1 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 select-none rounded-none font-data text-[10px] font-medium uppercase tracking-[0.16em] text-ink-tertiary",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-[--cell-size] select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "select-none font-data text-[0.8rem] tabular-nums text-ink-secondary",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center",
          defaultClassNames.day
        ),
        range_start: cn("bg-sunk", defaultClassNames.range_start),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("bg-sunk", defaultClassNames.range_end),
        today: cn(
          "rounded-none outline outline-[1.5px] outline-ink [outline-offset:-1.5px]",
          defaultClassNames.today
        ),
        outside: cn(
          "text-ink-future aria-selected:text-ink-future",
          defaultClassNames.outside
        ),
        disabled: cn("text-ink-future", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  // Outside-month days that aren't otherwise styled (not disabled, not part of a range) are the
  // one case where nothing already wins the text-colour cascade: the ghost variant's plain `text-ink`
  // has nothing gating it. Disabled days already resolve correctly via the button's own `disabled:`
  // pseudo-class (higher specificity than a plain colour utility), landing on `sunk` + `ink.tertiary` —
  // exactly the tone spec §5 wants for a disabled control, so it's left alone here. Range states put
  // the button on `bg-sunk` too (`data-[range-middle=true]`), so an outside day inside a range keeps
  // that full-strength `ink` text rather than the dimmer `ink.future`, which measures below the 4.5:1
  // floor once composited on `sunk` in dark mode.
  const dimOutside =
    modifiers.outside &&
    !modifiers.disabled &&
    !modifiers.range_start &&
    !modifiers.range_middle &&
    !modifiers.range_end

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-outside-dim={dimOutside}
      className={cn(
        "flex aspect-square h-auto w-full min-w-[--cell-size] flex-col gap-1 rounded-none font-data font-normal leading-none tabular-nums data-[selected-single=true]:bg-ink data-[selected-single=true]:text-canvas data-[range-start=true]:bg-ink data-[range-start=true]:text-canvas data-[range-end=true]:bg-ink data-[range-end=true]:text-canvas data-[range-middle=true]:bg-sunk data-[range-middle=true]:text-ink data-[outside-dim=true]:text-ink-future group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:outline group-data-[focused=true]/day:outline-2 group-data-[focused=true]/day:outline-ink [&>span]:text-xs",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
