import * as React from "react"

import { cn } from "@/lib/utils"

// Letterpress §4.9: 2px ink rule under the head, 1px rules between rows, no zebra, no card-per-row.
// `numeric` cells use mono tabular figures. Rows: data-state="selected" → rail + 2px ink rule;
// data-attention="true" → rail + 4px attention.mark bar (waiting). Rules sit on the first cell because
// box-shadow on <tr> is unreliable across browsers.
//
// The leading-bar selector must put the data attribute on the <tr> and the child combinator in front
// of `td:first-child`, in the SAME arbitrary variant: `[&[data-x=y]>td:first-child]:shadow-…`.
// Stacking it as two variants instead — `data-[x=y]:[&>td:first-child]:shadow-…` — compiles to
// `…>td:first-child[data-x=y]`, which requires the attribute on the <td>, not the <tr>, and never
// matches (verified against Tailwind's own compiled output; see tests/table-row.test.ts).
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b-2 [&_tr]:border-ink", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t-2 border-ink font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-rule transition-colors hover:bg-rail/60 data-[state=selected]:bg-rail [&[data-state=selected]>td:first-child]:shadow-[inset_2px_0_0_rgb(var(--ink))] data-[attention=true]:bg-rail [&[data-attention=true]>td:first-child]:shadow-[inset_4px_0_0_rgb(var(--attention-mark))]",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-9 px-2 pb-2 text-left align-bottom font-data text-[10px] font-medium uppercase tracking-[0.16em] text-ink-tertiary [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric = false, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-2 py-3 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      numeric && "font-data text-xs font-medium tabular-nums",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-ink-secondary", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
