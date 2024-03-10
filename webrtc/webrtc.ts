import {IRawSignalingMessage, ISignalingMessage} from "@/utils/types";
import {SignalingServer} from "@/websockets/signaling";
import {MEET_CONFIG} from "@/utils/config";
import {MeetEvent} from "./config";

export class Meet {
    private static instance: Meet | null = null;

    private localConnection: RTCPeerConnection;
    private dataChannel: RTCDataChannel
    public signalingServer: SignalingServer;

    readonly meetId: string;
    readonly sessionId: string;

    constructor(meetId: string, sessionId: string) {
        this.meetId = meetId;
        this.sessionId = sessionId;

        this.localConnection = new RTCPeerConnection(MEET_CONFIG);
        this.dataChannel = this.localConnection.createDataChannel("vartalaap-channel");
        this.signalingServer = new SignalingServer();

        this.signalingServer.onmessage = (event: MessageEvent<any>) => {
            const messageObj: ISignalingMessage = JSON.parse(event.data);

            this.handleSignalingData(messageObj);
        };
    }

    public static getInstance(meetId: string, sessionId: string): Meet {
        if(!Meet.instance) {
            Meet.instance = new Meet(meetId, sessionId);
        }

        if(Meet.instance.meetId !== meetId && Meet.instance.sessionId !== sessionId) {
            Meet.instance = new Meet(meetId, sessionId);
        }

        return Meet.instance;
    }

    // Handle signaling data received from the signaling server
    private handleSignalingData(data: ISignalingMessage) {
        console.log("New message: ", data);
    }

    on(meetEvent: string, functionToBind: (event: ISignalingMessage) => void) {
        if (this.signalingServer.readyState === this.signalingServer.OPEN) {
            const boundFunction = (socketEvent: MessageEvent<any>) => {
                const parsedEventData = JSON.parse(socketEvent.data);

                if (parsedEventData.type === meetEvent) {
                    functionToBind(parsedEventData);
                }
            };

            // Add the event listener
            this.signalingServer.addEventListener('message', boundFunction);

            // Return the bound function if you want to later remove the listener
            return boundFunction;
        } else {
            console.warn("Connection not opened yet");
        }
    }

    private sendServerMessageWithPeerContext(rawMessage: IRawSignalingMessage) {
        const message = {
            ...rawMessage,
            sessionId: this.sessionId,
            meetId: this.meetId,
        } as ISignalingMessage;

        this.signalingServer.sendJsonMessage(message);
    }

    joinMeetLobby() {
        if(this.signalingServer.readyState === WebSocket.OPEN) {
            this.sendServerMessageWithPeerContext({
                type: MeetEvent.JOIN_MEET_LOBBY
            });
        } else {
            console.warn("Connection is not open yet to join meet lobby");
        }
    }

    joinMeet() {
        if(this.signalingServer.readyState === WebSocket.OPEN) {
            this.sendServerMessageWithPeerContext({
                type: MeetEvent.JOIN_MEET
            });
        } else {
            console.warn("Connection is not open yet to join meet");
        }
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