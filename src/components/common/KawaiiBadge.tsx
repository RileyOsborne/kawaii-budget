import React from 'react';

interface Props {
  children: React.ReactNode;
  variant?: 'pink' | 'mauve' | 'green' | 'orange' | 'purple' | 'gray';
  size?: 'sm' | 'md';
}

export const KawaiiBadge: React.FC<Props> = ({ children, variant = 'pink', size = 'md' }) => {
  const styles = {
    pink: 'bg-[#fdf2f4] text-[#8a3348] border-[#f8ccd6]',
    mauve: 'bg-[#f5e6eb] text-[#7d3c4c] border-[#debac6]',
    green: 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]',
    orange: 'bg-[#fff7ed] text-[#9a3412] border-[#fed7aa]',
    purple: 'bg-[#faf5ff] text-[#6b21a8] border-[#e9d5ff]',
    gray: 'bg-[#f3f4f6] text-[#374151] border-[#e5e7eb]',
  };

  const sizes = {
    sm: 'text-[11px] px-2.5 py-0.5 font-bold',
    md: 'text-xs font-bold px-3 py-1',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border shadow-2xs ${styles[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
};
