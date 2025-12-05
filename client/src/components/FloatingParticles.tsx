import { useEffect, useState } from 'react';

interface Particle {
    id: number;
    x: number;
    y: number;
    size: number;
    duration: number;
    delay: number;
    opacity: number;
}

interface FloatingParticlesProps {
    count?: number;
    color?: 'blue' | 'red' | 'mixed';
}

export default function FloatingParticles({ count = 20, color = 'mixed' }: FloatingParticlesProps) {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        const generated: Particle[] = Array.from({ length: count }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 4 + 2,
            duration: Math.random() * 20 + 15,
            delay: Math.random() * 5,
            opacity: Math.random() * 0.5 + 0.1,
        }));
        setParticles(generated);
    }, [count]);

    const getColor = (index: number) => {
        if (color === 'blue') return 'bg-primary';
        if (color === 'red') return 'bg-accent';
        return index % 2 === 0 ? 'bg-primary' : 'bg-accent';
    };

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
            {particles.map((particle, index) => (
                <div
                    key={particle.id}
                    className={`absolute rounded-full ${getColor(index)} animate-float-particle`}
                    style={{
                        left: `${particle.x}%`,
                        top: `${particle.y}%`,
                        width: `${particle.size}px`,
                        height: `${particle.size}px`,
                        opacity: particle.opacity,
                        animationDuration: `${particle.duration}s`,
                        animationDelay: `${particle.delay}s`,
                    }}
                />
            ))}
        </div>
    );
}
