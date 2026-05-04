import {useEffect, useRef} from "react";
import {getWaveBlob} from "webm-to-wav-converter";
import {transcriptionServerUri} from "@/src/utils/config";

interface Props {
    audioStream: MediaStream | null;
}

export function Captions(props: Props) {
    const pendingTranscriptions = useRef<string[]>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopRecording = () => {
        if (recordingIntervalRef.current !== null) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
    };

    const startRecording = async () => {
        if (!props.audioStream) {
            console.error("Audio stream is null");
            return;
        }

        stopRecording();

        const mediaRecorder = new MediaRecorder(props.audioStream);
        mediaRecorderRef.current = mediaRecorder;
        let chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
            chunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, {type: "audio/wav"});
            chunks = [];
            const waveBlob = await getWaveBlob(blob, false);
            transcribe(waveBlob);
        };

        mediaRecorder.start();
        recordingIntervalRef.current = setInterval(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                mediaRecorderRef.current.stop();
                mediaRecorderRef.current.start();
            }
        }, 1500);
    };

    const transcribe = async (blob: Blob) => {
        const formData = new FormData();
        formData.append("audio_file", blob, "audio.wav");
        formData.append("config", JSON.stringify({
            model: "faster-whisper",
            model_size: "tiny",
            language: "en"
        }));

        fetch(`${transcriptionServerUri}/transcribe-bytes`, {
            method: "POST",
            body: formData,
        })
            .then((response) => response.json())
            .then((data: { task: { task_id: string } }) => {
                pendingTranscriptions.current.push(data.task.task_id);
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    };

    useEffect(() => {
        const interval = setInterval(() => {
            if (pendingTranscriptions.current.length === 0) {
                return;
            }

            const task_id = pendingTranscriptions.current[0];
            fetch(`${transcriptionServerUri}/get-transcription/${task_id}`)
                .then((response) => response.json())
                .then((data: { status: string, models: unknown }) => {
                    if (data.status === "PENDING") {
                        return;
                    }
                    pendingTranscriptions.current.shift();
                })
        }, 1000);

        return () => {
            clearInterval(interval);
            stopRecording();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    return (
        <div style={{color: "white", backgroundColor: "black"}}>
            <button onClick={startRecording}>Start Recording</button>
            <h1>Captions</h1>
            <p>Audio Stream: {props.audioStream ? "Ready" : "Not Ready"}</p>
        </div>
    );
}
