import { ReactNode } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

type AnimationType =
    | 'fade-in'
    | 'slide-up'
    | 'slide-down'
    | 'slide-left'
    | 'slide-right'
    | 'scale-in'
    | 'rotate-in'
    | 'blur-in'
    | 'bounce-in';

interface AnimatedSectionProps {
    children: ReactNode;
    animation?: AnimationType;
    delay?: number;
    duration?: number;
    className?: string;
    threshold?: number;
}

const animationClasses: Record<AnimationType, { initial: string; animate: string }> = {
    'fade-in': {
        initial: 'opacity-0',
        animate: 'animate-fade-in',
    },
    'slide-up': {
        initial: 'opacity-0 translate-y-12',
        animate: 'animate-slide-up',
    },
    'slide-down': {
        initial: 'opacity-0 -translate-y-12',
        animate: 'animate-slide-down',
    },
    'slide-left': {
        initial: 'opacity-0 translate-x-12',
        animate: 'animate-slide-left',
    },
    'slide-right': {
        initial: 'opacity-0 -translate-x-12',
        animate: 'animate-slide-right',
    },
    'scale-in': {
        initial: 'opacity-0 scale-90',
        animate: 'animate-scale-in',
    },
    'rotate-in': {
        initial: 'opacity-0 rotate-12',
        animate: 'animate-rotate-in',
    },
    'blur-in': {
        initial: 'opacity-0 blur-sm',
        animate: 'animate-blur-in',
    },
    'bounce-in': {
        initial: 'opacity-0 scale-50',
        animate: 'animate-bounce-in',
    },
};

export default function AnimatedSection({
    children,
    animation = 'fade-in',
    delay = 0,
    duration = 0.6,
    className = '',
    threshold = 0.1,
}: AnimatedSectionProps) {
    const { ref, isVisible } = useScrollAnimation({ threshold });
    const { initial, animate } = animationClasses[animation];

    return (
        <div
            ref={ref}
            className={`${className} ${isVisible ? animate : initial}`}
            style={{
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
                animationFillMode: 'both',
            }}
        >
            {children}
        </div>
    );
}
