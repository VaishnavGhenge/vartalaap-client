const sockerUrl = "ws://localhost:8080";

const connection = new WebSocket(sockerUrl);

connection.onopen = () => {
    console.log("Websocker connection got open");
}

connection.onerror = (err) => {
    console.error("Error connecting to websocket: ", err);
}

export default connection;