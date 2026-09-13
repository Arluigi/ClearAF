"use client";
import { useCallback, useState } from "react";
import { useClinicalAPI } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LoadState, Pages, useRead } from "./shared";
function todayMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function DayEvents({ patientId, day }: { patientId: string; day: string }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(
    () => api.getPatientCalendarEvents(patientId, day, page),
    [api, patientId, day, page],
  );
  const result = useRead(fetch);
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Recorded events · {day}</h3>
      <LoadState {...result} />
      {result.data && (
        <>
          {!result.data.data.length && <p>Not recorded</p>}
          {result.data.data.map((event) => (
            <article className="space-y-2 rounded-md border p-4" key={event.id}>
              <p>
                {event.routine.name} · {event.routine.timeOfDay} · Version{" "}
                {event.routine.version}
              </p>
              <p className="text-sm">
                Reported {event.localDate} · {event.timeZone}
              </p>
              <p className="text-sm">
                Completed {new Date(event.completedAt).toLocaleString()} ·
                Received {new Date(event.receivedAt).toLocaleString()}
              </p>
              <ol className="list-decimal pl-5">
                {event.routine.steps.map((step, i) => (
                  <li key={i}>
                    <p>{step.title}</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {step.instructions}
                    </p>
                  </li>
                ))}
              </ol>
            </article>
          ))}
          <Pages
            page={page}
            totalPages={result.data.pagination.totalPages}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
export default function CompletionCalendar({
  patientId,
}: {
  patientId: string;
}) {
  const api = useClinicalAPI();
  const [month, setMonth] = useState(todayMonth);
  const [day, setDay] = useState("");
  const fetch = useCallback(
    () => api.getPatientCalendar(patientId, month),
    [api, patientId, month],
  );
  const result = useRead(fetch);
  const [year, number] = month.split("-").map(Number);
  const count = new Date(year, number, 0).getDate();
  return (
    <section
      className="space-y-4 border-t pt-6"
      aria-label="Completion calendar"
    >
      <h2 className="text-xl font-medium">Completion calendar</h2>
      <p className="text-sm text-muted-foreground">
        Server-recorded patient reports by their reported local date. Days
        without events are not recorded.
      </p>
      <label className="block">
        Month
        <input
          className="ml-3 rounded-md border bg-background p-2"
          type="month"
          value={month}
          onChange={(e) => {
            if (/^\d{4}-\d{2}$/.test(e.target.value)) {
              setDay("");
              setMonth(e.target.value);
            }
          }}
        />
      </label>
      <Button variant="outline" onClick={result.retry}>
        Refresh calendar
      </Button>
      <LoadState {...result} />
      {result.data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
            <span
              key={label}
              className="hidden text-sm text-muted-foreground sm:block"
            >
              {label}
            </span>
          ))}
          {Array.from(
            { length: new Date(year, number - 1, 1).getDay() },
            (_, i) => (
              <span
                key={"offset-" + i}
                aria-hidden
                className="hidden sm:block"
              />
            ),
          )}
          {Array.from({ length: count }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            const record = result.data!.days.find((d) => d.localDate === date);
            return (
              <button
                key={date}
                aria-label={`${date}: ${record ? `Morning ${record.morning}, evening ${record.evening}` : "Not recorded"}`}
                aria-pressed={day === date}
                className="min-h-24 min-w-0 rounded-md border p-2 text-left focus-visible:outline focus-visible:outline-ring aria-pressed:bg-accent"
                onClick={() => setDay(date)}
              >
                <span className="block font-medium">
                  <span className="sm:hidden">
                    {new Date(year, number - 1, i + 1).toLocaleDateString(
                      undefined,
                      { weekday: "short" },
                    )}{" "}
                  </span>
                  {i + 1}
                </span>
                <span className="block text-xs">
                  {record ? (
                    <>
                      <span className="block">Morning {record.morning}</span>
                      <span className="block">Evening {record.evening}</span>
                    </>
                  ) : (
                    "Not recorded"
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {day && result.status === "ready" && (
        <DayEvents key={day} patientId={patientId} day={day} />
      )}
    </section>
  );
}
