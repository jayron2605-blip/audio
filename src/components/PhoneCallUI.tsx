import React, { useEffect, useState, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX, MessageSquareText, History, X } from "lucide-react";
import { motion } from "motion/react";
import { AudioManager, CallState, SpeakerState } from "../lib/audioManager";

export function PhoneCallUI() {
  const [callState, setCallState] = useState<CallState>("DISCONNECTED");
  const [speakerState, setSpeakerState] = useState<SpeakerState>("LISTENING");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTranscription, setShowTranscription] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [transcriptions, setTranscriptions] = useState<{ role: string, text: string }[]>([]);
  const [history, setHistory] = useState<{ id: string, date: string, duration: number, transcriptions: { role: string, text: string }[] }[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const previousCallState = useRef<CallState>("DISCONNECTED");
  
  const audioManager = useRef<AudioManager | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("ai_call_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    audioManager.current = new AudioManager();
    audioManager.current.onStateChange = (state) => {
      setCallState(state);
      
      if (previousCallState.current === "CONNECTED" && state === "DISCONNECTED") {
        // Call ended, save history
        setTranscriptions(currentTranscriptions => {
          if (currentTranscriptions.length > 0) {
            setDuration(currentDuration => {
              const newEntry = {
                id: Date.now().toString(),
                date: new Date().toLocaleString(),
                duration: currentDuration,
                transcriptions: currentTranscriptions
              };
              setHistory(prev => {
                const updated = [newEntry, ...prev];
                localStorage.setItem("ai_call_history", JSON.stringify(updated));
                return updated;
              });
              return currentDuration;
            });
          }
          return currentTranscriptions;
        });
      }
      previousCallState.current = state;
    };
    audioManager.current.onSpeakerStateChange = (state) => setSpeakerState(state);
    audioManager.current.onError = (err) => setErrorMsg(err);
    audioManager.current.onTranscription = (role, text) => {
      setTranscriptions(prev => {
        // Simple append, could be improved to group by role if they come in chunks
        return [...prev, { role, text }];
      });
    };

    return () => {
      audioManager.current?.stopCall();
    };
  }, []);

  useEffect(() => {
    if (showTranscription && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcriptions, showTranscription]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (callState === "CONNECTED") {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleStartCall = () => {
    setErrorMsg(null);
    audioManager.current?.startCall();
  };

  const handleEndCall = () => {
    audioManager.current?.stopCall();
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audioManager.current?.setMicMuted(newMuted);
  };

  // UI mappings
  const getOrbState = () => {
    if (callState !== "CONNECTED") return "idle";
    if (speakerState === "SPEAKING") return "speaking";
    if (speakerState === "THINKING") return "thinking";
    return "listening";
  };

  const orbVariants: any = {
    idle: { scale: 1, opacity: 0.3 },
    listening: { 
      scale: [1, 1.05, 1],
      opacity: [0.6, 0.8, 0.6],
      transition: { repeat: Infinity, duration: 2, ease: "easeInOut" }
    },
    thinking: {
      scale: [1, 1.1, 1],
      opacity: [0.8, 1, 0.8],
      rotate: 180,
      transition: { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
    },
    speaking: {
      scale: [1, 1.2, 1.05, 1.3, 1],
      opacity: [0.8, 1, 0.9, 1, 0.8],
      transition: { repeat: Infinity, duration: 0.8, ease: "easeInOut" }
    }
  };

  const orbColor = () => {
    if (callState === "ERROR") return "bg-red-500";
    if (callState !== "CONNECTED") return "bg-neutral-600";
    if (speakerState === "SPEAKING") return "bg-blue-500";
    if (speakerState === "THINKING") return "bg-purple-500";
    return "bg-emerald-500";
  };

  return (
    <div className="flex flex-col items-center justify-between h-full min-h-[100dvh] w-full bg-neutral-950 text-white p-8">
      
      {/* Header */}
      <div className="flex flex-col items-center mt-12 space-y-2">
        <h1 className="text-2xl font-medium tracking-wide">AI Assistant</h1>
        <div className="text-neutral-400 font-mono text-lg">
          {callState === "CONNECTED" ? formatDuration(duration) : (callState === "CONNECTING" ? "Connecting..." : "")}
        </div>
        
        <div className="h-6 mt-2">
          {callState === "CONNECTED" && (
            <span className="text-sm tracking-widest uppercase text-neutral-400">
              {isMuted ? "MUTED" : speakerState}
            </span>
          )}
          {callState === "ERROR" && (
            <span className="text-sm tracking-widest text-red-400">ERROR</span>
          )}
        </div>
      </div>

      {/* Center Animation or Transcription */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm relative">
         {!showTranscription ? (
           <>
             <motion.div
                variants={orbVariants}
                animate={getOrbState()}
                className={`w-40 h-40 rounded-full blur-xl absolute ${orbColor()} opacity-20`}
             />
             <motion.div
                variants={orbVariants}
                animate={getOrbState()}
                className={`w-32 h-32 rounded-full shadow-2xl relative flex items-center justify-center bg-gradient-to-tr from-neutral-800 to-neutral-700`}
             >
               <div className={`w-full h-full rounded-full mix-blend-overlay ${orbColor()} opacity-50`}></div>
             </motion.div>
           </>
         ) : (
           <div className="w-full h-full max-h-[50vh] overflow-y-auto mt-8 mb-4 px-4 flex flex-col space-y-4 scrollbar-thin scrollbar-thumb-neutral-700">
             {transcriptions.map((t, i) => (
               <div key={i} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{t.role === 'user' ? 'You' : 'AI'}</span>
                  <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${t.role === 'user' ? 'bg-neutral-800 text-neutral-200 rounded-br-none' : 'bg-emerald-900/40 text-emerald-100 rounded-bl-none border border-emerald-800/50'}`}>
                    {t.text}
                  </div>
               </div>
             ))}
             {transcriptions.length === 0 && (
               <div className="text-center text-neutral-500 text-sm mt-10">No transcriptions yet. Start speaking!</div>
             )}
             <div ref={transcriptEndRef} />
           </div>
         )}
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="text-red-400 text-sm mb-4 text-center px-4 bg-red-950/30 py-2 rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* Controls */}
      <div className="w-full max-w-xs flex items-center justify-center gap-6 mb-12 relative z-10">
        {callState === "CONNECTED" ? (
          <>
            <button 
              onClick={toggleMute}
              className={`p-4 rounded-full transition-all duration-300 ${isMuted ? 'bg-neutral-200 text-neutral-900' : 'bg-neutral-800 text-white hover:bg-neutral-700'}`}
            >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <button 
              onClick={handleEndCall}
              className="p-6 rounded-full bg-red-500 hover:bg-red-400 text-white transition-all duration-300 shadow-lg shadow-red-500/20"
            >
              <PhoneOff size={32} />
            </button>
            <button 
              onClick={() => setShowTranscription(!showTranscription)}
              className={`p-4 rounded-full transition-all duration-300 ${showTranscription ? 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20' : 'bg-neutral-800 text-white hover:bg-neutral-700'}`}
              title="Toggle Transcription"
            >
              <MessageSquareText size={24} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowHistory(true)}
              className="p-4 rounded-full bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all duration-300"
              title="View History"
            >
              <History size={24} />
            </button>
            <button 
              onClick={() => {
                setTranscriptions([]);
                handleStartCall();
              }}
              disabled={callState === "CONNECTING"}
              className="p-6 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white transition-all duration-300 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Phone size={32} />
            </button>
          </div>
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="absolute inset-0 z-50 bg-neutral-950/90 flex flex-col p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-medium tracking-wide">Call History</h2>
            <button onClick={() => setShowHistory(false)} className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-neutral-700">
            {history.length === 0 ? (
              <div className="text-neutral-500 text-center mt-12">No previous calls found.</div>
            ) : (
              history.map(item => (
                <div key={item.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col space-y-4">
                  <div className="flex justify-between items-center text-sm text-neutral-400">
                    <span>{item.date}</span>
                    <span>{formatDuration(item.duration)}</span>
                  </div>
                  
                  <div className="space-y-3 bg-neutral-950 rounded-xl p-4 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800">
                    {item.transcriptions.map((t, i) => (
                      <div key={i} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}>
                         <span className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1">{t.role === 'user' ? 'You' : 'AI'}</span>
                         <div className={`px-3 py-1.5 rounded-xl max-w-[90%] text-sm ${t.role === 'user' ? 'bg-neutral-800 text-neutral-300 rounded-br-none' : 'bg-emerald-900/30 text-emerald-200 rounded-bl-none border border-emerald-900/50'}`}>
                           {t.text}
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
