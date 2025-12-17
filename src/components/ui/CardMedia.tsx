import { useState } from 'react';

export default function CardMedia({ url }: { url: string }) {
    const [error, setError] = useState(false);

    if (error) return null;

    return (
        <div className="mb-3 rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
            <img
                src={url}
                alt="Media"
                className="w-full h-48 object-cover hover:scale-105 transition-transform duration-500"
                onError={() => setError(true)}
            />
        </div>
    );
}
