import { ISignalingMessage } from "@/utils/types";
import { SignalingChannel } from "@/websockets/signaling";
import { MEET_CONFIG } from "@/utils/config";
import { MeetEvents } from "./config";

export class Meet {
    private localConnection = new RTCPeerConnection(MEET_CONFIG);
    private dataChannel = this.localConnection.createDataChannel("vartalaap-channel");
    private signalingChannel = new SignalingChannel();

    public isCreator: boolean = false;
    public sessionId: string | null = null;

    constructor() {
        this.signalingChannel.onopen = (event) => {
            console.log("WebSocket connection opened!");
        };

        this.signalingChannel.onerror = (err) => {
            console.error("Error connecting WebSocket: ", err.type);
        };

        this.signalingChannel.onmessage = (event: MessageEvent<any>) => {
            const messageObj: ISignalingMessage = JSON.parse(event.data);

            this.handleSignalingData(messageObj);
        };
    }

    handleSignalingData(data: ISignalingMessage) {
        // Handle signaling data received from the signaling server

        switch (data.type) {
            case MeetEvents.SESSION_RESPONSE:
                this.onSession(data);

                break;
            case "peer-joined":
                this.onPeerJoined(data);

                break;
            default:
                console.log(`Invalid message from websocket server: ${data.type}`);
        }
    }

    requestSession(isCreator = false) {
        this.isCreator = isCreator;

        const message = {
            type: MeetEvents.REQUEST_SESSION
        };

        this.signalingChannel.send(JSON.stringify(message));
    }

    onSession(data: ISignalingMessage) {
        this.sessionId = data.sessionId;

        console.log("session id: ", data.sessionId);

        if(window !== undefined) {
            localStorage.setItem("sessionId", data.sessionId || "");
        }
    }

    createMeet() {
        const message: ISignalingMessage = {
            type: MeetEvents.CREATE_MEET,
            sessionId: "",
        }
    }

    // joinMeet(meetId: string) {
    //     const message: ISignalingMessage = {
    //         type: "join-meet",
    //         meetId: meetId,
    //     };
    //     this.signalingChannel.sendMessage(message);
    // }

    // Handling function to events
    onPeerJoined(data: ISignalingMessage) {
        console.log("New user joined in meet");
    }

    // async createOffer() {
    //     console.log("Creating offer");

    //     // Create offer to connect to user
    //     const offer = await createOffer(this.localConnection);
    //     const offerMessage = {type: "offer", offer: offer};

    //     this.signalingChannel.sendMessage(offerMessage);
    // }

    // async onOffer(offer: any) {
    //     console.log("Received offer", offer);

    //     // Accept offer and create an answer in response
    //     const answer = await createAnswer(this.localConnection, offer);

    //     const answerMessage = {type: "answer", answer: answer};
    //     this.signalingChannel.sendMessage(answerMessage);
    // }

    // async onAnswer(answer: any) {
    //     console.log("Received answer", answer);

    //     await this.localConnection.setRemoteDescription(new RTCSessionDescription(answer));
    // }

    // async leaveMeet() {
    //     this.signalingChannel.sendMessage({type: "leave-meet"});
    //     this.signalingChannel.close();
    // }
}
