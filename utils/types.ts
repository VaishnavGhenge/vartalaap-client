export interface IUserPreferences {
    micStatus: boolean;
    cameraStatus: boolean;
}

export interface IVideoDimensionState {
    width: number;
    height: number;
}

export interface IVideoDimesionAction {
    type: "height" | "width";
    value: number;
}

export interface ISignalingMessage {
    type: string;
    meetId?: string;
    sessionId: string;
    offer?: any;
    answer?: any;
}

export interface IPeer {
    peerId: number | null;
    name: string;
    owner: boolean;
}