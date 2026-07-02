import { cn } from "../lib/cn";

function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn("widget-skeleton rounded-full", className)} />;
}

function AgentRow({ lines }: { lines: string[] }) {
  return (
    <div className="flex w-full max-w-[90%] gap-2">
      <SkeletonBar className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <SkeletonBar className="h-3 w-24" />
        <div className="flex w-full flex-col gap-2 rounded-3xl bg-[#F2F8FF] px-4 py-3">
          {lines.map((w, i) => (
            <SkeletonBar key={i} className={cn("h-3", w)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading conversation"
      className="flex min-h-full flex-col"
    >
      <div className="flex w-full justify-start">
        <AgentRow lines={["w-[85%]", "w-[60%]"]} />
      </div>

      <div className="mt-8 flex w-full justify-end">
        <div className="flex flex-col items-end gap-2 rounded-3xl bg-[#006BE5]/10 px-4 py-3">
          <SkeletonBar className="h-3 w-40" />
          <SkeletonBar className="h-3 w-24" />
        </div>
      </div>

      <div className="mt-8 flex w-full justify-start">
        <AgentRow lines={["w-[90%]", "w-[75%]", "w-[50%]"]} />
      </div>
    </div>
  );
}
