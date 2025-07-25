"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

interface CustomTooltipProps {
  children: React.ReactNode;
  content: string;
  className?: string;
}

export function CustomTooltip({ children, content, className = "" }: CustomTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent className={`bg-gray-900 text-white ${className}`}>
          <p>{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}