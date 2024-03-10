import {ISignalingMessage} from "@/utils/types";

export class SignalingServer extends WebSocket {
    constructor() {
        super(process.env.SOCKET_URL || "ws://localhost:8080");

        this.addEventListener("open", this.handleOpen.bind(this));
        this.addEventListener("close", this.handleClose.bind(this));
        this.addEventListener("error", this.handleError.bind(this));
    }

    private handleOpen() {
        console.warn("WebSocket connection opened.");
    }

    private handleClose(event: CloseEvent) {
        console.log(`WebSocket connection closed with code: ${event.code}, reason: ${event.reason}`);
    }

    private handleError(event: Event) {
        console.error("WebSocket error", event.type);
    }

    sendJsonMessage(messageObj: ISignalingMessage) {
        if (this.readyState == WebSocket.OPEN) {
            this.send(JSON.stringify(messageObj));
        } else {
            console.error("WebSocket is not open. Unable to send message.");
        }
    }
}
