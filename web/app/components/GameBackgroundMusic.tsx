import { useEffect, useRef } from "react";

export function GameBackgroundMusic({ volume }: { volume: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const normalizedVolume = Math.max(0, Math.min(1, volume / 100));
    audio.volume = normalizedVolume;

    if (normalizedVolume === 0) {
      audio.pause();
      return;
    }

    const removeStartListeners = () => {
      window.removeEventListener("pointerdown", startPlayback);
      window.removeEventListener("keydown", startPlayback);
    };
    const startPlayback = () => {
      void audio.play().then(removeStartListeners).catch(() => {
        // Browsers may require another user gesture before media playback.
      });
    };

    startPlayback();
    window.addEventListener("pointerdown", startPlayback);
    window.addEventListener("keydown", startPlayback);

    return removeStartListeners;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  return (
    // Instrumental background music contains no spoken content to caption.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      aria-hidden="true"
      loop
      preload="auto"
      ref={audioRef}
      src="./bgm.mp3"
    />
  );
}
