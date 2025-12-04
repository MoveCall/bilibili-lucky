import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className, ...props }) => {
  return (
    <div className="flex flex-col gap-2 w-full">
      {label && <label className="text-gray-700 font-medium text-sm ml-1">{label}</label>}
      <input
        className={`w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-bili-pink focus:ring-2 focus:ring-bili-pink/20 outline-none transition-all duration-200 bg-white/80 backdrop-blur-sm ${className}`}
        {...props}
      />
    </div>
  );
};