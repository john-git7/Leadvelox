'use client';

import { DollarSign, TrendingDown, AlertTriangle } from 'lucide-react';

interface RevenueRiskProps {
  atRiskCount: number;
  estimatedLoss: number;
  avgDealValue: number;
}

export default function RevenueRisk({ atRiskCount, estimatedLoss, avgDealValue }: RevenueRiskProps) {
  if (estimatedLoss === 0) {
    return null;
  }

  const dynamicCeiling = Math.max(50000, estimatedLoss * 2);

  return (
    <div className="bg-[#111111] border border-[#262626] rounded-lg p-6 space-y-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5">
        <TrendingDown className="w-24 h-24 text-red-500" />
      </div>

      <div className="space-y-1">
        <h3 className="text-[10px] font-bold text-red-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" /> Revenue Leakage Awareness
        </h3>
        <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-tight">Estimated Capital Exposure</p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-black tracking-tighter text-[#FAFAFA]">
            ${estimatedLoss.toLocaleString()}
          </span>
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest animate-pulse">At Risk</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <div className="flex items-center gap-1 text-red-400">
            <DollarSign className="w-3 h-3" />
            <span>High Risk Invariants: {atRiskCount}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-1 w-full bg-[#171717] rounded-full overflow-hidden">
          <div 
            className="h-full bg-red-500 transition-all duration-1000" 
            style={{ width: `${Math.min((estimatedLoss / dynamicCeiling) * 100, 100)}%` }} 
          />
        </div>
        <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tight">
          Based on SLA breaches and lead decay velocity. (Assumes ${avgDealValue.toLocaleString()} avg commission)
        </p>
      </div>
    </div>
  );
}
