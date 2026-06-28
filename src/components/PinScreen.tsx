"use client";

import { useState } from "react";
import { Flame, Delete } from "lucide-react";

interface PinScreenProps {
  hint: string;
  onUnlock: (pin: string) => boolean;
}

export function PinScreen({ hint, onUnlock }: PinScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const handleNumberClick = (num: number) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError(false);

      if (newPin.length === 4) {
        const isSuccess = onUnlock(newPin);
        if (!isSuccess) {
          setError(true);
          setFailedAttempts((prev) => prev + 1);
          setTimeout(() => setPin(""), 400); // Clear after a short delay
        }
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
      <div className="flex flex-col items-center max-w-sm w-full px-6">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-12">
          <Flame className="w-12 h-12 text-orange-400" strokeWidth={1.5} />
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">
            Trade<span className="text-orange-400">Journal</span>
          </h1>
        </div>

        {/* PIN Indicators */}
        <div className={`flex gap-4 mb-8 ${error ? "animate-[shake_0.4s_ease-in-out]" : ""}`}>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                pin.length > i ? "bg-orange-400 scale-110" : "bg-stone-200"
              }`}
            />
          ))}
        </div>

        {/* Hint */}
        <p className={`text-stone-400 text-sm font-medium mb-12 text-center transition-opacity duration-500 ${hint && failedAttempts >= 3 ? 'opacity-100' : 'opacity-0'}`}>
          Hint: {hint}
        </p>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-6 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold text-stone-950 bg-stone-50 hover:bg-stone-100 active:bg-stone-200 transition-colors mx-auto"
            >
              {num}
            </button>
          ))}
          <div className="w-16 h-16"></div> {/* Empty space */}
          <button
            onClick={() => handleNumberClick(0)}
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold text-stone-950 bg-stone-50 hover:bg-stone-100 active:bg-stone-200 transition-colors mx-auto"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="w-16 h-16 rounded-full flex items-center justify-center text-stone-500 bg-stone-50 hover:bg-stone-100 hover:text-orange-400 active:bg-stone-200 transition-colors mx-auto"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
        
        <style jsx global>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-10px); }
            40% { transform: translateX(10px); }
            60% { transform: translateX(-10px); }
            80% { transform: translateX(10px); }
          }
        `}</style>
      </div>
    </div>
  );
}
