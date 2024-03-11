import {IRawSignalingMessage, ISignalingMessage} from "@/utils/types";
import {SignalingServer} from "@/websockets/signaling";
import {MEET_CONFIG} from "@/utils/config";
import {MeetEvent} from "./config";

export class Meet {
    private static instance: Meet | null = null;

    public localConnection: RTCPeerConnection;
    private dataChannel: RTCDataChannel;
    public signalingServer: SignalingServer;

    readonly meetId: string;
    readonly sessionId: string;

    private isOfferCreated = false;

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

        this.localConnection.addEventListener("iceconnectionstatechange", () => {
            console.warn("ICE Connection State Changed:", this.localConnection.iceConnectionState);
        });

        this.localConnection.addEventListener("icegatheringstatechange", () => {
            console.warn("Connection State Changed:", this.localConnection.connectionState);
        });

        this.localConnection.addEventListener("negotiationneeded", () => {
            console.warn("Nego ended");
        })
    }

    public static getInstance(meetId: string, sessionId: string): Meet {
        if (!Meet.instance) {
            Meet.instance = new Meet(meetId, sessionId);
        }

        if (Meet.instance.meetId !== meetId && Meet.instance.sessionId !== sessionId) {
            Meet.instance = new Meet(meetId, sessionId);
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
                this.createOffer();

                break;
            case MeetEvent.OFFER:
                this.createAnswer(data.offer);

                break;
            case MeetEvent.ANSWER:
                this.onAnswer(data.answer);

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
            meetId: this.meetId,
        } as ISignalingMessage;

        this.signalingServer.sendJsonMessage(message);
    }

    joinMeetLobby() {
        if (this.signalingServer.readyState === WebSocket.OPEN) {
            console.log("Join meet lobby message sent");
            this.sendServerMessageWithPeerContext({
                type: MeetEvent.JOIN_MEET_LOBBY
            });
        } else {
            console.warn("Connection is not open yet to join meet lobby");
        }
    }

    joinMeet() {
        if (this.signalingServer.readyState === WebSocket.OPEN) {
            console.log("join meet");
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
            console.log("Creating offer");

            // Create offer to connect to user
            const offer = await this.localConnection.createOffer();

            // Set the local description immediately
            await this.localConnection.setLocalDescription(new RTCSessionDescription(offer));

            console.log("state: ", this.localConnection.iceConnectionState);

            // Wait for the first ICE candidate
            await new Promise((resolve: any) => {
                this.localConnection.addEventListener("icecandidate", (event) => {
                    console.warn("ICE candidate event");

                    if (event.candidate === null) {
                        resolve();
                        this.localConnection.onicecandidate = null; // Remove the event listener after the first candidate
                    }
                });
            });

            // Now, the ICE candidate gathering is complete
            console.log("Offer generated: ", this.localConnection.localDescription);

            // Send the offer to the server
            const offerMessage = { type: MeetEvent.CREATE_OFFER, offer: this.localConnection.localDescription };
            this.sendServerMessageWithPeerContext(offerMessage);
        }
    }

    async createAnswer(offer: RTCSessionDescriptionInit) {
        console.log("Received offer", offer);

        // Accept offer and set remote description
        await this.localConnection.setRemoteDescription(offer);

        console.log("Before ice candidate");

        // Wait for ICE candidate gathering to complete
        // await new Promise((resolve: any) => {
        //     this.localConnection.addEventListener("icecandidate", (event) => {
        //         console.warn("ICE candidate event");
        //
        //         if (event.candidate === null) {
        //             resolve();
        //             this.localConnection.onicecandidate = null; // Remove the event listener after the first candidate
        //         }
        //     });
        // });

        console.log("After ice candidate");

        // Create an answer
        const answer = await this.localConnection.createAnswer();

        // Set the local description with the answer
        await this.localConnection.setLocalDescription(new RTCSessionDescription(answer));

        console.log("Answer generated: ", this.localConnection.localDescription);

        // Send the answer to the server
        const answerMessage = { type: MeetEvent.CREATE_ANSWER, answer: this.localConnection.localDescription };
        this.sendServerMessageWithPeerContext(answerMessage);
    }

    async onAnswer(answer: any) {
        console.log("Received answer", answer);

        await this.localConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    leaveMeet() {
        console.log("Left meet");

        this.sendServerMessageWithPeerContext({type: MeetEvent.LEAVE_MEET});
    }
}