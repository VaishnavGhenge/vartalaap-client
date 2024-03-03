import { ISignalingMessage } from "@/utils/types";

export class SignalingChannel extends WebSocket {
    constructor() {
        super(process.env.SOCKET_URL || "ws://localhost:8080");

        this.addEventListener("open", this.handleOpen.bind(this));
        this.addEventListener("close", this.handleClose.bind(this));
        this.addEventListener("message", this.handleMessage.bind(this));
        this.addEventListener("error", this.handleError.bind(this));
    }

    private handleOpen() {
        console.warn("WebSocket connection opened.");
    }

    private handleClose(event: CloseEvent) {
        console.log(`WebSocket connection closed with code: ${event.code}, reason: ${event.reason}`);
    }

    private handleMessage(event: MessageEvent) {
        console.log("Received message:", event.data);
    }

    private handleError(event: Event) {
        console.error("WebSocket error", event.type);
    }

    sendMessage(messageObj: ISignalingMessage) {
        try {
            if (this.readyState == WebSocket.OPEN) {
                this.send(JSON.stringify(messageObj));
            } else {
                throw new Error("WebSocket is not open. Unable to send message.");
            }
        } catch (err: any) {
            console.error("Error while sending message: ", err.message);
        }
    }
}
