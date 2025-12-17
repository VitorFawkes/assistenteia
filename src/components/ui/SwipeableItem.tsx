import React, { useState, useRef } from 'react';
import { Trash2, Check } from 'lucide-react';

interface SwipeableItemProps {
    children: React.ReactNode;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    leftActionIcon?: React.ReactNode;
    rightActionIcon?: React.ReactNode;
    leftActionColor?: string;
    rightActionColor?: string;
    threshold?: number;
    disabled?: boolean;
}

export default function SwipeableItem({
    children,
    onSwipeLeft,
    onSwipeRight,
    leftActionIcon = <Check size={24} />,
    rightActionIcon = <Trash2 size={24} />,
    leftActionColor = 'bg-green-600',
    rightActionColor = 'bg-red-600',
    threshold = 100,
    disabled = false
}: SwipeableItemProps) {
    const [offsetX, setOffsetX] = useState(0);
    const startX = useRef<number | null>(null);
    const startY = useRef<number | null>(null);
    const itemRef = useRef<HTMLDivElement>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (disabled) return;
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!startX.current || !startY.current || disabled) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - startX.current;
        const diffY = currentY - startY.current;

        // If vertical scroll is dominant, ignore horizontal swipe
        if (Math.abs(diffY) > Math.abs(diffX)) {
            return;
        }

        // Prevent vertical scrolling when swiping horizontally
        if (Math.abs(diffX) > 10) {
            // e.preventDefault(); // React synthetic events can't prevent default easily in passive listeners
        }

        // Limit swipe distance
        if ((diffX > 0 && !onSwipeRight) || (diffX < 0 && !onSwipeLeft)) {
            // Resistance if no action
            setOffsetX(diffX * 0.2);
        } else {
            setOffsetX(diffX);
        }
    };

    const handleTouchEnd = () => {
        if (disabled) return;

        if (Math.abs(offsetX) > threshold) {
            if (offsetX > 0 && onSwipeRight) {
                // Swiped Right
                onSwipeRight();
            } else if (offsetX < 0 && onSwipeLeft) {
                // Swiped Left
                onSwipeLeft();
            }
        }

        // Reset
        // Reset
        setOffsetX(0);
        startX.current = null;
        startY.current = null;
    };

    return (
        <div className="relative overflow-hidden rounded-xl mb-3 select-none touch-pan-y">
            {/* Background Actions */}
            <div className="absolute inset-0 flex justify-between items-center">
                {/* Left Action (Swipe Right to reveal) */}
                <div className={`flex items-center justify-start pl-6 w-full h-full ${leftActionColor} transition-opacity duration-200 ${offsetX > 0 ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="text-white transform scale-110">
                        {leftActionIcon}
                    </div>
                </div>

                {/* Right Action (Swipe Left to reveal) */}
                <div className={`absolute inset-0 flex items-center justify-end pr-6 w-full h-full ${rightActionColor} transition-opacity duration-200 ${offsetX < 0 ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="text-white transform scale-110">
                        {rightActionIcon}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div
                ref={itemRef}
                className="relative bg-white transition-transform duration-200 ease-out"
                style={{ transform: `translateX(${offsetX}px)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {children}
            </div>
        </div>
    );
}
