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

export interface IRawSignalingMessage {
    type: string;
}

export interface ISignalingMessage extends IRawSignalingMessage{
    meetCode: string;
    sessionId: string;
    data?: any;
    offer?: any;
    answer?: any;
    sessionIdList: string[];
}

export interface IPeer {
    sessionId: string | null;
    name: string;
    owner: boolean;
}

export interface IUser {
    token: string;
    firstName: string;
    lastName: string;
    email: string;
}