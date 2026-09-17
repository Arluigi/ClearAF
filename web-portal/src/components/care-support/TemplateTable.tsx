import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { templateSummary, type Template } from "@/lib/care-support";
import { day } from "@/lib/worklist";

export function TemplateTable({ templates, page, selectedId }: { templates: Template[]; page: number; selectedId: string | null }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Name</TableHead><TableHead>Version</TableHead><TableHead>Updated</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template) => {
          const selected = template.id === selectedId;
          return (
            <TableRow key={template.id} data-state={selected ? "selected" : undefined}>
              <TableCell>
                <a className="font-medium underline underline-offset-[3px]" href={`/templates?page=${page}&id=${encodeURIComponent(template.id)}`} aria-current={selected ? "true" : undefined}>
                  {template.name}
                </a>
                <span className="block text-xs text-ink-secondary">{template.isActive ? templateSummary(template) : `Archived ${day(template.updatedAt)}`}</span>
              </TableCell>
              <TableCell numeric>V{template.version}</TableCell>
              <TableCell numeric>{day(template.updatedAt)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
