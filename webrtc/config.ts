export enum MeetEvent {
    NOT_FOUND = "not-found",
    BAD_REQUEST = "bad-request",

    JOIN_MEET_LOBBY = 'join-meet-lobby',

    JOIN_MEET = "join-meet",
    PEER_JOINED = "peer-joined",

    LEAVE_MEET = "leave-meet",
    PEER_LEFT = "peer-left",

    INITIATE_MEET_REQUEST = "init-meet-request",

    CREATE_OFFER = "create-offer",
    CREATE_OFFER_RESPONSE = "create-offer-response",
    RECEIVED_OFFER = "received-offer",

    CREATE_ANSWER = "create-answer",
    CREATE_ANSWER_RESPONSE = "create-answer-response",
    RECEIVED_ANSWER ="received-answer",
}