import { pcmToBase64, base64ToPcm } from "./audio";

export type CallState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
export type SpeakerState = "LISTENING" | "THINKING" | "SPEAKING";

export class AudioManager {
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  private nextStartTime = 0;
  
  private _state: CallState = "DISCONNECTED";
  private _speakerState: SpeakerState = "LISTENING";

  public onStateChange?: (state: CallState) => void;
  public onSpeakerStateChange?: (state: SpeakerState) => void;
  public onError?: (error: string) => void;
  public onTranscription?: (role: "user" | "ai", text: string) => void;
  
  private updateState(state: CallState) {
    this._state = state;
    this.onStateChange?.(state);
  }

  private updateSpeakerState(state: SpeakerState) {
    this._speakerState = state;
    this.onSpeakerStateChange?.(state);
  }

  public async startCall() {
    if (this._state !== "DISCONNECTED") return;
    this.updateState("CONNECTING");

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Microphone access denied:", err);
      this.updateState("ERROR");
      this.onError?.("Microphone access denied. Please allow microphone access.");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${protocol}//${window.location.host}/live`);

    this.ws.onopen = () => {
      this.updateState("CONNECTED");
      this.updateSpeakerState("LISTENING");
      this.startAudioProcessing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          this.updateSpeakerState("SPEAKING");
          this.playAudioChunk(msg.audio);
        }
        if (msg.interrupted) {
          this.updateSpeakerState("LISTENING");
          this.stopAudioPlayback();
        }
        if (msg.transcription) {
          this.onTranscription?.(msg.transcription.role, msg.transcription.text);
        }
        if (msg.error) {
          this.onError?.(msg.error);
        }
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };

    this.ws.onclose = () => {
      this.stopCall();
    };

    this.ws.onerror = () => {
      this.updateState("ERROR");
      this.onError?.("WebSocket connection failed.");
      this.stopCall();
    };
  }

  private startAudioProcessing() {
    this.inputAudioCtx = new AudioContext({ sampleRate: 16000 });
    this.outputAudioCtx = new AudioContext({ sampleRate: 24000 });
    this.nextStartTime = this.outputAudioCtx.currentTime;

    if (!this.stream) return;

    this.source = this.inputAudioCtx.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);
    
    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioCtx.destination);

    this.processor.onaudioprocess = (e) => {
      // Send audio only if we are connected
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
        this.ws.send(JSON.stringify({ audio: base64 }));
      }
    };
  }

  private playAudioChunk(base64: string) {
    if (!this.outputAudioCtx) return;

    const pcmData = base64ToPcm(base64);
    const audioBuffer = this.outputAudioCtx.createBuffer(1, pcmData.length, 24000);
    audioBuffer.getChannelData(0).set(pcmData);

    const source = this.outputAudioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputAudioCtx.destination);

    // Schedule precise playback
    const currentTime = this.outputAudioCtx.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    
    // Automatically revert to listening after playback finishes
    source.onended = () => {
      // We only switch back to LISTENING if this was the last chunk played
      // Check if currentTime is close to nextStartTime
      if (this.outputAudioCtx && this.outputAudioCtx.currentTime >= this.nextStartTime - 0.1) {
        this.updateSpeakerState("LISTENING");
      }
    };
  }

  private stopAudioPlayback() {
    if (this.outputAudioCtx) {
      // Suspending and resuming clears the scheduled buffers in many browsers, 
      // but closing and recreating is more reliable for completely flushing the queue.
      this.outputAudioCtx.close();
      this.outputAudioCtx = new AudioContext({ sampleRate: 24000 });
      this.nextStartTime = this.outputAudioCtx.currentTime;
    }
  }

  public stopCall() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.inputAudioCtx) {
      this.inputAudioCtx.close();
      this.inputAudioCtx = null;
    }
    if (this.outputAudioCtx) {
      this.outputAudioCtx.close();
      this.outputAudioCtx = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    this.updateState("DISCONNECTED");
  }

  public setMicMuted(muted: boolean) {
    if (this.stream) {
      this.stream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }
}
