export interface IUserPreferences {
    micStatus: boolean;
    cameraStatus: boolean;
}

export interface IVideoDimensionState {
    width: number;
    height: number;
}

export interface IVideoDimensionAction {
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
    sessionId: string | null;
    name: string;
    owner: boolean;
}