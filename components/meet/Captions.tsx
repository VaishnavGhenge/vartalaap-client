import {useEffect, useRef} from "react";
import {getWaveBlob} from "webm-to-wav-converter";
import {transcriptionServerUri} from "@/utils/config";

interface Props {
    audioStream: MediaStream | null;
}

export function Captions(props: Props) {
    const pendingTranscriptions = useRef<string[]>([]);

    const startRecording = async () => {
        if (!props.audioStream) {
            console.error("Audio stream is null");
            return;
        }

        const mediaRecorder = new MediaRecorder(props.audioStream);
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
        setInterval(() => {
            mediaRecorder.stop();
            mediaRecorder.start();
        }, 1500);
    };

    const transcribe = async (blob: Blob) => {
        const formData = new FormData();
        formData.append("audio_file", blob, "audio.wav"); // Ensure the file is appended correctly
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
                .then((data: { status: string, models: any }) => {
                    if (data.status === "PENDING") {
                        return;
                    }

                    console.log(data.models);
                    pendingTranscriptions.current.shift();
                })
        }, 1000);

        return () => clearInterval(interval);
    }, []);


    return (
        <div style={{color: "white", backgroundColor: "black"}}>
            <button onClick={startRecording}>Start Recording</button>
            <h1>Captions</h1>
            <p>Audio Stream: {props.audioStream ? "Ready" : "Not Ready"}</p>
        </div>
    );
}
