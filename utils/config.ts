export const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "user",
};

export const audioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
};

export const MEET_CONFIG = {
    iceServers: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:global.stun.twilio.com:3478",
            ],
        },
    ],
};