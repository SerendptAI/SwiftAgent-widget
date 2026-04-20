import { Paperclip } from "lucide-react";

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
}: ChatInputProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Text input in rounded container */}
      <div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Ask a question"
          className="w-full bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
        />
      </div>

      {/* Bottom row: paperclip + send */}
      <div className="flex items-center justify-between">
        <button className="flex items-center justify-center text-gray-400 transition-colors hover:text-gray-600">
          <Icons.paperclip className="h-5 w-5" />
        </button>

        <button
          onClick={onSend}
          disabled={!value.trim() || isLoading}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-40"
        >
          <Icons.sendIconUp className="h-6 w-6 fill-gray-700 text-gray-700" />
        </button>
      </div>
    </div>
  );
}
