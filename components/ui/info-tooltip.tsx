'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { HelpCircle } from 'lucide-react';

export function InfoTooltip({ content }: { content: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delay={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger
          className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors ml-1.5 focus:outline-none shrink-0"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side="top" align="center" sideOffset={4}>
            <TooltipPrimitive.Popup className="z-50 max-w-[280px] rounded-md bg-[#171717] border border-[#262626] p-3 text-xs text-zinc-300 shadow-xl animate-in fade-in zoom-in-95 data-[ending-style]:animate-out data-[ending-style]:fade-out data-[ending-style]:zoom-out-95 leading-relaxed font-sans normal-case tracking-normal">
              <TooltipPrimitive.Arrow className="fill-[#262626]" />
              <div className="bg-[#171717] -mt-[1px] relative z-10">{content}</div>
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
