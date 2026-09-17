"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { Template } from "@/lib/care-support";
import { plural } from "@/lib/worklist";
import type { RoutineTimeOfDay } from "@/types/api";

export function TemplateList({
  templates,
  disabled,
  onCopy,
}: {
  templates: Template[];
  disabled: Record<RoutineTimeOfDay, boolean>;
  onCopy: (slot: RoutineTimeOfDay, template: Template) => void;
}) {
  if (!templates.length) return <p className="text-sm text-ink-secondary">No active templates on this page.</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {templates.map((template) => (
        <li key={template.id} className="space-y-1 py-2">
          <p className="text-sm font-medium">{template.name}</p>
          <p className="meta-mono">V{template.version} · {plural(template.steps.length, "step")}</p>
          <div className="flex gap-4">
            {(["morning", "evening"] as const).map((slot) => (
              <Button
                key={slot}
                type="button"
                variant="link"
                size="sm"
                className="min-h-0 px-0 py-0"
                disabled={disabled[slot]}
                aria-label={`Use ${template.name} in the ${slot} draft`}
                onClick={() => onCopy(slot, template)}
              >
                Use in {slot}
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
