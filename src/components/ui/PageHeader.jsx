import React from 'react';
import { cn } from '@/lib/utils';

export default function PageHeader({ 
  title, 
  subtitle, 
  children,
  className 
}) {
  return (
    <div className={cn(
      "flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8",
      className
    )}>
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white">{title}</h1>
        {subtitle && (
          <p className="text-slate-400 mt-1">{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
}