import {IRawSignalingMessage, ISignalingMessage} from "@/src/utils/types";
import {SignalingServer} from "@/src/services/socket/signaling";
import {MEET_CONFIG} from "@/src/utils/config";
import {MeetEvent} from "./config";

export class Meet {
    private static instance: Meet | null = null;

    public localConnection: RTCPeerConnection;
    private dataChannel: RTCDataChannel;
    public signalingServer: SignalingServer;

    readonly meetCode: string;
    readonly sessionId: string;

    private isOfferCreated = false;

    constructor(meetCode: string, sessionId: string) {
        this.meetCode = meetCode;
        this.sessionId = sessionId;

        this.localConnection = new RTCPeerConnection(MEET_CONFIG);
        this.dataChannel = this.localConnection.createDataChannel("vartalaap-channel");
        this.signalingServer = new SignalingServer();

        this.signalingServer.onmessage = (event: MessageEvent<any>) => {
            const messageObj: ISignalingMessage = JSON.parse(event.data);

            this.handleSignalingData(messageObj);
        };

        // this.localConnection.addEventListener("iceconnectionstatechange", () => {
        //     console.warn("ICE Connection State Changed:", this.localConnection.iceConnectionState);
        // });
        //
        // this.localConnection.addEventListener("icegatheringstatechange", () => {
        //     console.warn("Connection State Changed:", this.localConnection.connectionState);
        // });
        //
        // this.localConnection.addEventListener("negotiationneeded", () => {
        //     console.warn("Negotiation ended");
        // });
    }

    public static getInstance(meetCode: string, sessionId: string): Meet {
        if (!Meet.instance) {
            Meet.instance = new Meet(meetCode, sessionId);
        }

        if (Meet.instance.meetCode !== meetCode && Meet.instance.sessionId !== sessionId) {
            Meet.instance = new Meet(meetCode, sessionId);
        }

        return Meet.instance;
    }

    // Handle signaling data received from the signaling server
    private handleSignalingData(data: ISignalingMessage) {
        switch (data.type) {
            case MeetEvent.PEER_LEFT:
                console.log(`${data.sessionId} left meet`);

                break;
            case MeetEvent.INITIATE_MEET_REQUEST:
                void this.createOffer();

                break;
            case MeetEvent.OFFER:
                void this.createAnswer(data.offer);

                break;
            case MeetEvent.ANSWER:
                void this.onAnswer(data.answer);

                break;
            case MeetEvent.PEER_JOINED:
                break;
            case MeetEvent.BAD_REQUEST:
                console.warn("BAD REQUEST")
                break;
            default:
                console.log("Unknown message: ", data);
        }
    }

    on(meetEvent: string, functionToBind: (event: ISignalingMessage) => void): ((this: WebSocket, ev: MessageEvent<any>) => any) | null {
        const boundFunction: (this: WebSocket, ev: MessageEvent<any>) => any = (socketEvent) => {
            const parsedEventData = JSON.parse(socketEvent.data);

            if (parsedEventData.type === meetEvent) {
                functionToBind(parsedEventData);
            }
        };

        // Add the event listener
        this.signalingServer.addEventListener('message', boundFunction);

        // Return the bound function if you want to later remove the listener
        return boundFunction;
    }

    off(meetEvent: string, boundFunction: (this: WebSocket, ev: MessageEvent<any>) => any) {
        // Check if the signaling server is open before attempting to remove the listener
        if (this.signalingServer.readyState === this.signalingServer.OPEN) {
            this.signalingServer.removeEventListener('message', boundFunction);
        } else {
            console.warn("Connection not opened yet to remove event listener: ", meetEvent);
        }
    }

    private sendServerMessageWithPeerContext(rawMessage: IRawSignalingMessage) {
        const message = {
            ...rawMessage,
            sessionId: this.sessionId,
            meetCode: this.meetCode,
        } as ISignalingMessage;

        this.signalingServer.sendJsonMessage(message);
    }

    joinMeetLobby() {
        if (this.signalingServer.readyState === WebSocket.OPEN) {
            this.sendServerMessageWithPeerContext({
                type: MeetEvent.JOIN_MEET_LOBBY
            });
        } else {
            console.warn("Connection is not open yet to join meet lobby");
        }
    }

    joinMeet() {
        if (this.signalingServer.readyState === WebSocket.OPEN) {
            this.sendServerMessageWithPeerContext({
                type: MeetEvent.JOIN_MEET
            });
        } else {
            console.warn("Connection is not open yet to join meet");
        }
    }

    async createOffer() {
        if(!this.isOfferCreated) {
            this.isOfferCreated = true;

            // Create offer to connect to user
            const offer = await this.localConnection.createOffer();

            // Set the local description immediately
            await this.localConnection.setLocalDescription(new RTCSessionDescription(offer));

            // Wait for the first ICE candidate
            await new Promise((resolve: any) => {
                this.localConnection.addEventListener("icecandidate", (event) => {
                    if (event.candidate === null) {
                        resolve();
                        this.localConnection.onicecandidate = null; // Remove the event listener after the first candidate
                    }
                });
            });

            // Send the offer to the server
            const offerMessage = { type: MeetEvent.CREATE_OFFER, offer: this.localConnection.localDescription };
            this.sendServerMessageWithPeerContext(offerMessage);
        }
    }

    async createAnswer(offer: RTCSessionDescriptionInit) {
        // Accept offer and set remote description
        await this.localConnection.setRemoteDescription(offer);

        // Create an answer
        const answer = await this.localConnection.createAnswer();

        // Set the local description with the answer
        await this.localConnection.setLocalDescription(new RTCSessionDescription(answer));

        // Send the answer to the server
        const answerMessage = { type: MeetEvent.CREATE_ANSWER, answer: this.localConnection.localDescription };
        this.sendServerMessageWithPeerContext(answerMessage);
    }

    async onAnswer(answer: any) {
        await this.localConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    leaveMeet() {
        this.sendServerMessageWithPeerContext({type: MeetEvent.LEAVE_MEET});
    }
}