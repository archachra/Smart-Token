import React, { useState, useEffect, useRef } from 'react';

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function AudioPlayer({ src, initialDuration = 0 }) {
  const audioRef = useRef(null);
  const animFrameRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);

  // Sync initial duration if updated externally
  useEffect(() => {
    if (initialDuration > 0) {
      setDuration((prev) => (prev > 0 ? prev : initialDuration));
    }
  }, [initialDuration]);

  // When src changes, stop playing and reset positions
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [src]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // WebM duration workaround: MediaRecorder recordings lack duration metadata
  // Seeking to an astronomically large timestamp forces Chromium to decode the final cluster and calculate true duration.
  const resolveDuration = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isFinite(audio.duration) && audio.duration > 0 && audio.duration !== Infinity) {
      setDuration(audio.duration);
      return;
    }

    // Chromium fix:
    const prevTime = audio.currentTime;
    audio.currentTime = 1e101;
    const onTimeUpdate = () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      const trueDuration = audio.currentTime;
      audio.currentTime = prevTime;
      if (isFinite(trueDuration) && trueDuration > 0) {
        setDuration(trueDuration);
      } else if (initialDuration > 0) {
        setDuration(initialDuration);
      }
    };
    audio.addEventListener('timeupdate', onTimeUpdate, { once: true });
  };

  // requestAnimationFrame loop to smoothly drive currentTime directly from HTMLAudioElement
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const updateLoop = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      animFrameRef.current = requestAnimationFrame(updateLoop);
    };

    animFrameRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Playback error:', err);
      setIsPlaying(false);
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    if (isFinite(audio.duration) && audio.duration > 0 && audio.duration !== Infinity) {
      setDuration(audio.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const effectiveDuration = duration > 0 ? duration : (initialDuration > 0 ? initialDuration : 0);

  return (
    <div
      className="audio-player-container"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        backgroundColor: '#f8fafc',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        border: '1px solid #cbd5e1',
        marginTop: '0.5rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={resolveDuration}
        onDurationChange={resolveDuration}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: '#0284c7',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1rem',
          flexShrink: 0,
          transition: 'background-color 0.15s ease',
        }}
        title={isPlaying ? 'Pause' : 'Play'}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <input
          type="range"
          min={0}
          max={effectiveDuration || 1}
          step={0.05}
          value={Math.min(currentTime, effectiveDuration || 1)}
          onChange={handleSeek}
          style={{
            width: '100%',
            cursor: 'pointer',
            accentColor: '#0284c7',
          }}
          aria-label="Audio scrubber"
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#64748b',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(effectiveDuration)}</span>
        </div>
      </div>
    </div>
  );
}
