import { useRef, useState, useEffect } from 'react';

interface MouseGradientTextProps {
    children: string;
    className?: string;
}

export default function MouseGradientText({ children, className = '' }: MouseGradientTextProps) {
    const containerRef = useRef<HTMLSpanElement>(null);
    const [progress, setProgress] = useState(0);
    const [isHovering, setIsHovering] = useState(false);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            // Calculate horizontal progress (0 to 100%)
            const x = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
            setProgress(percentage);
        };

        container.addEventListener('mousemove', handleMouseMove);
        return () => container.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <span
            ref={containerRef}
            className={`relative inline-block cursor-default ${className}`}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => {
                setIsHovering(false);
                setProgress(0);
            }}
            style={{
                // Gradient that reveals color from left based on mouse position
                background: isHovering
                    ? `linear-gradient(90deg, 
              #2D6CF6 0%, 
              #E10600 ${progress * 0.8}%, 
              white ${progress}%, 
              white 100%)`
                    : 'white',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                transition: isHovering ? 'none' : 'background 0.5s ease',
            }}
        >
            {children}
        </span>
    );
}
