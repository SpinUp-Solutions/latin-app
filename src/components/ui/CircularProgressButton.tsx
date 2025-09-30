import React from 'react';
import { Play, CheckCircle, Lock } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { LessonStatus } from '@/src/types/lesson';

interface CircularProgressButtonProps {
  progress?: number;
  status?: LessonStatus;
  onClick?: (e?: React.MouseEvent) => void;
  disabled?: boolean;
  size?: number;
}

const statusConfig = {
  available: {
    ringColor: 'stroke-roman-stone',
    backgroundColor: 'bg-gradient-to-br from-roman-stone to-roman-stone/80',
    hoverColor: 'hover:from-roman-stone/90 hover:to-roman-stone/70',
    shadowColor: 'shadow-roman-stone/25',
    icon: Play,
  },
  'in-progress': {
    ringColor: 'stroke-roman-terracotta',
    backgroundColor: 'bg-gradient-to-br from-roman-terracotta to-roman-red',
    hoverColor: 'hover:from-roman-terracotta/90 hover:to-roman-red/90',
    shadowColor: 'shadow-roman-terracotta/30',
    icon: Play,
  },
  completed: {
    ringColor: 'stroke-roman-green',
    backgroundColor: 'bg-gradient-to-br from-roman-green to-emerald-600',
    hoverColor: 'hover:from-roman-green/90 hover:to-emerald-600/90',
    shadowColor: 'shadow-roman-green/30',
    icon: CheckCircle,
  },
  locked: {
    ringColor: 'stroke-gray-300',
    backgroundColor: 'bg-gradient-to-br from-gray-400 to-gray-500',
    hoverColor: 'cursor-not-allowed',
    shadowColor: 'shadow-gray-400/20',
    icon: Lock,
  },
};

export const CircularProgressButton: React.FC<CircularProgressButtonProps> = ({
  progress = 0,
  status = 'available',
  onClick,
  disabled = false,
  size = 56,
}) => {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isLocked = status === 'locked';
  const isDisabled = disabled || isLocked;

  const radius = (size - 8) / 2 - 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn('transition-all duration-700 ease-out drop-shadow-sm', config.ringColor)}
        />
      </svg>

      <button
        onClick={e => onClick?.(e)}
        disabled={isDisabled}
        className={cn(
          'absolute inset-2 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-lg',
          config.backgroundColor,
          config.shadowColor,
          !isDisabled && config.hoverColor,
          !isDisabled && 'hover:scale-110 hover:shadow-xl active:scale-100',
          isDisabled && 'opacity-50'
        )}>
        <Icon className="h-5 w-5 drop-shadow-sm" />
      </button>
    </div>
  );
};
