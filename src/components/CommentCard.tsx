import React from 'react';
import { CommentUser } from '../../types';

interface CommentCardProps {
  user: CommentUser;
  isWinner?: boolean;
  className?: string;
}

export const CommentCard: React.FC<CommentCardProps> = ({ user, isWinner, className }) => {
  const [imageFailed, setImageFailed] = React.useState(false);
  const avatarSizeClass = isWinner ? 'w-20 h-20' : 'w-12 h-12';
  const avatarTextClass = isWinner ? 'text-2xl' : 'text-sm';
  const avatarLabel = user.uname.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${
      isWinner 
        ? 'bg-gradient-to-r from-pink-50 to-purple-50 border-bili-pink shadow-xl scale-105' 
        : 'bg-white border-gray-100 shadow-sm hover:shadow-md'
    } ${className}`}>
      <div className="relative shrink-0">
        <div className={`${avatarSizeClass} rounded-full border-2 ${isWinner ? 'border-bili-pink' : 'border-gray-100'} bg-gradient-to-br from-pink-100 to-blue-100 flex items-center justify-center overflow-hidden`}>
          {imageFailed ? (
            <span className={`font-bold text-gray-600 ${avatarTextClass}`}>{avatarLabel}</span>
          ) : (
            <img
              src={user.avatar}
              alt={user.uname}
              className={`${avatarSizeClass} shrink-0 rounded-full object-cover`}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => {
                setImageFailed(true);
              }}
            />
          )}
        </div>
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
        {isWinner && user.drawTime && (
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            抽中时间 {user.drawTime}
          </p>
        )}
      </div>
    </div>
  );
};
