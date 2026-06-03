import React, { useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface DictationButtonProps {
  onResult: (text: string) => void;
  className?: string;
}

type WindowWithSR = Window & typeof globalThis & {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
};

export function DictationButton({ onResult, className = '' }: DictationButtonProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggle = () => {
    const win = window as WindowWithSR;
    const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!SR) {
      alert('Speech recognition not supported on this device/browser.');
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = 'he-IL';
    recognition.interimResults = false;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      onResult(e.results[0][0].transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? 'Stop dictation' : 'Start dictation'}
      className={`p-1.5 rounded-lg transition-all ${
        listening
          ? 'bg-red-100 dark:bg-red-900/40 text-red-500 animate-pulse-glow'
          : 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30'
      } ${className}`}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}
