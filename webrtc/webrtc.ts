import { IPeer, ISignalingMessage } from "@/utils/types";
import { SignalingChannel } from "@/websockets/signaling";
import { createAnswer, createOffer } from "./utils";

export class Meet {
    configuration = {
        iceServers: [
            {
                urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:global.stun.twilio.com:3478",
                ],
            },
        ],
    };
    localConnection = new RTCPeerConnection(this.configuration);
    dataChannel = this.localConnection.createDataChannel("vartalaap-channel");
    signalingChannel = new SignalingChannel();

    constructor() {
        this.signalingChannel.onopen = () => {
            console.log("WebSocket connection opened!");
        };

        this.signalingChannel.onerror = (err) => {
            console.error("Error connecting WebSocket: ", err);
        };

        this.signalingChannel.onmessage = (event: MessageEvent<any>) => {
            const messageObj: ISignalingMessage = JSON.parse(event.data);
            this.handleSignalingData(messageObj);
        };
    }

    joinMeet(meetId: string, peer: IPeer) {
        this.requestToJoinMeet(meetId, peer);
    }

    newPeerJoined() {}

    requestToJoinMeet(meetId: string, peer: IPeer) {
        const messageObj: ISignalingMessage = {
            type: "join-meet",
            meetId: meetId,
        };
        this.signalingChannel.sendMessage(messageObj);
    }

    handleSignalingData(data: ISignalingMessage) {
        // Handle signaling data received from the signaling server
        switch (data.type) {
            case "peer-joined":
                this.onPeerJoined();

                break;
            case "peer-offer-incoming":
                this.onOffer(data.offer);

                break;
            case "peer-answer-incoming":
                this.onAnswer(data.answer);

                break;
            default:
                console.log(`Invalid message from websocket server: ${data.type}`);
        }
    }

    // Handling function to events
    async onPeerJoined() {
        console.log("New user joined in meet");

        // Create offer to connect to user
        const offer = await createOffer(this.localConnection);
        const offerMessage = {type: "offer", offer: offer};

        this.signalingChannel.sendMessage(offerMessage);
    }

    async onOffer(offer: any) {
        console.log("Received offer");

        // Accept offer and create an answer in response
        const answer = await createAnswer(this.localConnection, offer);

        const answerMessage = {type: "answer", answer: answer};
        this.signalingChannel.sendMessage(answerMessage);
    }

    async onAnswer(answer: any) {
        await this.localConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
}
