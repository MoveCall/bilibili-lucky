import React from 'react';
import { Winner } from '../types';
import { Sparkles, Quote } from 'lucide-react';

interface WinnerCardProps {
  winner: Winner;
  index: number;
}

export const WinnerCard: React.FC<WinnerCardProps> = ({ winner, index }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden transform transition-all hover:-translate-y-1 duration-300">
      <div className="bg-gradient-to-r from-[#fb7299] to-[#ff9aa2] px-4 py-2 flex justify-between items-center">
        <span className="text-white font-bold flex items-center gap-1">
          <Sparkles className="w-4 h-4" /> 幸运儿 #{index + 1}
        </span>
        <span className="text-white/90 text-sm bg-white/20 px-2 py-0.5 rounded-full">
          LV {winner.member.level_info.current_level}
        </span>
      </div>
      
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="relative">
             <img 
              src={winner.member.avatar} 
              alt={winner.member.uname} 
              className="w-16 h-16 rounded-full border-2 border-white shadow-md object-cover"
              onError={(e) => {
                // Fallback for broken images
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${winner.member.uname}&background=random`;
              }}
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-800 text-lg truncate">{winner.member.uname}</h3>
            <p className="text-gray-500 text-xs mb-2">
              {new Date(winner.ctime * 1000).toLocaleString()}
            </p>
            <div className="bg-gray-50 p-3 rounded-lg relative">
              <Quote className="w-4 h-4 text-gray-300 absolute -top-2 -left-1 transform -scale-x-100" />
              <p className="text-gray-700 text-sm line-clamp-2 italic pl-2">
                {winner.content.message}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};