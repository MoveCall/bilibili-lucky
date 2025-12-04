import React from 'react';
import { CommentUser } from '../../types';

interface CommentCardProps {
  user: CommentUser;
  isWinner?: boolean;
  className?: string;
}

export const CommentCard: React.FC<CommentCardProps> = ({ user, isWinner, className }) => {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${
      isWinner 
        ? 'bg-gradient-to-r from-pink-50 to-purple-50 border-bili-pink shadow-xl scale-105' 
        : 'bg-white border-gray-100 shadow-sm hover:shadow-md'
    } ${className}`}>
      <div className="relative">
        <img 
          src={user.avatar} 
          alt={user.uname} 
          className={`rounded-full object-cover border-2 ${isWinner ? 'w-20 h-20 border-bili-pink' : 'w-12 h-12 border-gray-100'}`}
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://i0.hdslb.com/bfs/face/member/noface.jpg';
          }}
        />
        {isWinner && (
          <div className="absolute -top-3 -right-3 bg-yellow-400 text-white p-1.5 rounded-full shadow-sm animate-bounce">
            👑
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className={`font-bold truncate ${isWinner ? 'text-xl text-gray-800' : 'text-base text-gray-700'}`}>
          {user.uname}
        </h3>
        <p className={`truncate text-gray-500 ${isWinner ? 'text-base mt-1' : 'text-sm'}`}>
          {user.message}
        </p>
      </div>
    </div>
  );
};