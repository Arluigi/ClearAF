"use client";
import type { Question } from "@/lib/care-support";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function QuestionFields({
  question,
  index,
  onChange,
  onRemove,
  onMove,
  count,
}: {
  question: Question;
  index: number;
  count: number;
  onChange: (q: Question) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
}) {
  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="font-medium">Question {index + 1}</h3>
      <label className="block">
        Prompt
        <Input
          required
          maxLength={300}
          value={question.prompt}
          onChange={(e) => onChange({ ...question, prompt: e.target.value })}
        />
      </label>
      <label className="block">
        Answer type
        <select
          className="ml-3 rounded-md border bg-background p-2"
          value={question.type}
          onChange={(e) =>
            onChange({
              ...question,
              type: e.target.value as Question["type"],
              options:
                e.target.value === "choice"
                  ? [
                      { id: crypto.randomUUID(), label: "" },
                      { id: crypto.randomUUID(), label: "" },
                    ]
                  : [],
            })
          }
        >
          <option value="text">Short text</option>
          <option value="choice">Single choice</option>
        </select>
      </label>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={question.required}
          onChange={(e) =>
            onChange({ ...question, required: e.target.checked })
          }
        />
        Required answer
      </label>
      {question.type === "choice" && (
        <div className="space-y-2">
          {question.options.map((option, i) => (
            <div key={option.id} className="flex items-end gap-2">
              <label className="flex-1">
                Option {i + 1}
                <Input
                  required
                  maxLength={160}
                  value={option.label}
                  onChange={(e) =>
                    onChange({
                      ...question,
                      options: question.options.map((o) =>
                        o.id === option.id
                          ? { ...o, label: e.target.value }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={question.options.length <= 2}
                onClick={() =>
                  onChange({
                    ...question,
                    options: question.options.filter((o) => o.id !== option.id),
                  })
                }
              >
                Remove option {i + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={question.options.length >= 10}
            onClick={() =>
              onChange({
                ...question,
                options: [
                  ...question.options,
                  { id: crypto.randomUUID(), label: "" },
                ],
              })
            }
          >
            Add option
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!index}
          onClick={() => onMove(index - 1)}
        >
          Move up
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
        >
          Move down
        </Button>
        <Button type="button" variant="outline" onClick={onRemove}>
          Remove question
        </Button>
      </div>
    </div>
  );
}
