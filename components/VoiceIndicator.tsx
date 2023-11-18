import React, { useEffect, useRef, useState } from 'react';

const VoiceIndicator = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const setupAudioContext = async () => {
      const audioContext = new (window.AudioContext || window.AudioContext)();
      const analyser = audioContext.createAnalyser();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContext.createMediaStreamSource(stream);

      source.connect(analyser);
      analyser.connect(audioContext.destination);


      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Start the animation loop
      animate();
    };

    setupAudioContext();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const animate = () => {
    const canvas: any = canvasRef.current;

    if(!canvas) return;

    const ctx = canvas.getContext('2d');

    const draw = () => {
      requestAnimationFrame(draw);

      const dataArray = new Uint8Array(analyserRef.current?.frequencyBinCount || 0);
      analyserRef.current?.getByteFrequencyData(dataArray);

      // Calculate the average volume
      const averageVolume = dataArray.reduce((acc, value) => acc + value, 0) / dataArray.length;

      // Adjust the threshold based on your preference
      const threshold = 100;

      // Check if the volume exceeds the threshold
      setIsSpeaking(averageVolume > threshold);

      // Draw the indicator based on the volume
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = isSpeaking ? 'green' : 'red';
      ctx.fillRect(0, 0, averageVolume, 20);
    };

    draw();
  };

  return (
    <div>
      <canvas ref={canvasRef} width={200} height={20} />
      {isSpeaking ? <p>Speaking</p> : <p>Not Speaking</p>}
    </div>
  );
};

export default VoiceIndicator;
