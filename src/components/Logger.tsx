import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../../types';

interface LoggerProps {
  logs: LogEntry[];
  className?: string;
}

export const Logger: React.FC<LoggerProps> = ({ logs, className }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className={`bg-[#0f172a] rounded-lg p-3 font-mono text-xs overflow-y-auto border border-gray-800 shadow-inner ${className}`} ref={scrollRef}>
      <div className="flex flex-col gap-1">
        {logs.map((log) => (
          <div key={log.id} className="break-words leading-relaxed">
            <span className="text-gray-500">[{log.timestamp}]</span>
            <span className={`ml-2 font-bold ${
              log.type === 'info' ? 'text-blue-400' :
              log.type === 'success' ? 'text-green-400' :
              log.type === 'warning' ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              [{log.type.toUpperCase()}]
            </span>
            <span className="text-gray-300 ml-2">
              {log.message}
            </span>
          </div>
        ))}
        {/* Cursor blink effect */}
        <div className="animate-pulse text-gray-500 mt-1">_</div>
      </div>
    </div>
  );
};
