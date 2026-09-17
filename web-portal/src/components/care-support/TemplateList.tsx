"use client";
import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { templateCopyAction, type Template } from "@/lib/care-support";
import { plural } from "@/lib/worklist";
import type { RoutineTimeOfDay } from "@/types/api";

export function TemplateList({
  templates,
  disabled,
  dirty,
  onCopy,
}: {
  templates: Template[];
  disabled: Record<RoutineTimeOfDay, boolean>;
  dirty: Record<RoutineTimeOfDay, boolean>;
  onCopy: (slot: RoutineTimeOfDay, template: Template) => void;
}) {
  // Armed = "<templateId>:<slot>" once a dirty slot's button has taken its first click; a second click on the
  // same button confirms the replace. No modal: the confirmation happens in place, on the button itself.
  const [armed, setArmed] = useState<string | null>(null);
  if (!templates.length) return <p className="text-sm text-ink-secondary">No active templates on this page.</p>;
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {templates.map((template) => (
        <li key={template.id} className="space-y-1 py-2">
          <p className="text-sm font-medium">{template.name}</p>
          <p className="meta-mono">V{template.version} · {plural(template.steps.length, "step")}</p>
          <div className="flex gap-4">
            {(["morning", "evening"] as const).map((slot) => {
              const key = `${template.id}:${slot}`;
              const confirming = armed === key && dirty[slot];
              const { action, nextArmed } = templateCopyAction(armed, key, dirty[slot]);
              return (
                <Button
                  key={slot}
                  type="button"
                  variant="link"
                  size="sm"
                  className="min-h-0 px-0 py-0"
                  disabled={disabled[slot]}
                  aria-label={confirming ? `Replace the unsaved ${slot} draft with ${template.name}` : `Use ${template.name} in the ${slot} draft`}
                  onClick={() => {
                    setArmed(nextArmed);
                    if (action === "copy") onCopy(slot, template);
                  }}
                >
                  {confirming ? "Replace unsaved draft?" : `Use in ${slot}`}
                </Button>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
