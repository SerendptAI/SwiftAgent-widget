import { Icons } from "./icons";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  compact?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  compact = false,
}: ChatInputProps) {
  return (
    <div
      className={
        compact
          ? "flex items-center gap-2 rounded-full bg-[#f6f6f5] px-2 py-1.5"
          : "flex items-center gap-3 rounded-full bg-[#f6f6f5] px-2 py-2 sm:px-3 sm:py-2"
      }
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSend()}
        placeholder="Write here..."
        className={
          compact
            ? "font-dm-mono flex-1 bg-transparent px-3 text-sm text-gray-800 placeholder-gray-400 outline-none"
            : "font-dm-mono flex-1 bg-transparent px-4 text-sm text-gray-800 placeholder-gray-400 outline-none"
        }
      />
      <button
        onClick={onSend}
        disabled={!value.trim() || isLoading}
        className={
          compact
            ? "flex shrink-0 items-center gap-1.5 rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            : "flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        }
      >
        {isLoading ? "..." : "Send"}
        <Icons.sendIcon className="h-3.5 w-3.5 fill-white text-white sm:h-4 sm:w-4" />
      </button>
    </div>
  );
}
