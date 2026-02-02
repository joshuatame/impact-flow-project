import React from 'react';
import { cn } from '@/lib/utils';

export default function StatsCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  trendUp,
  gradient = 'from-blue-500 to-violet-600',
  className 
}) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl bg-slate-900/50 border border-slate-800/50 p-6",
      "hover:border-slate-700/50 transition-all duration-300",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {subtitle && (
            <p className="text-sm text-slate-500">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              trendUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            )}>
              {trend}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "p-3 rounded-xl bg-gradient-to-br shadow-lg",
            gradient,
            `shadow-${gradient.split('-')[1]}-500/20`
          )}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        )}
      </div>
      <div className={cn(
        "absolute -bottom-8 -right-8 w-32 h-32 rounded-full opacity-10 bg-gradient-to-br",
        gradient
      )} />
    </div>
  );
}