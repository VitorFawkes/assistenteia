

export const ElaLogo = ({ className = "" }: { className?: string }) => {
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className="w-8 h-8 rounded-full bg-ela-pink flex items-center justify-center">
                <span className="text-white font-bold text-lg">e</span>
            </div>
            <span className="font-bold text-xl text-ela-text tracking-tight">
                Ela<span className="text-ela-pink">.ia</span>
            </span>
        </div>
    );
};
