const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const signalingServer = new WebSocket("ws://localhost:8888/signaling"); // WebSocket 서버 주소

let localStream;
let peerConnection;
let isBroadcaster = false;

// 1️⃣ 로컬 카메라 가져오기
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localVideo.srcObject = stream;
        localStream = stream;
        // WebRTC 연결을 위한 peerConnection 생성
        peerConnection = createPeerConnection();

        // 로컬 스트림의 트랙을 peerConnection에 추가
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    })
    .catch(error => console.error("Error accessing media devices.", error));

// 2️⃣ WebRTC에서 ICE 후보(연결 정보)를 감지하면 WebSocket으로 전송
peerConnection.onicecandidate = event => {
    if (event.candidate) {
        signalingServer.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
    }
};

// 3️⃣ 상대방 트랙을 받아서 remoteVideo에 추가
peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
};

// 4️⃣ WebSocket 메시지 처리 (SDP 및 ICE 후보 수신)
signalingServer.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "offer" && !isBroadcaster) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        signalingServer.send(JSON.stringify({ type: "answer", answer }));
    } else if (message.type === "answer" && isBroadcaster) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
    } else if (message.type === "candidate") {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
};

// 5️⃣ WebSocket 연결 후 WebRTC Offer 전송 (초기 연결 설정)
signalingServer.onopen = async () => {
    // Offer 전송 전에 peerConnection이 제대로 설정되어 있는지 확인
    if (!peerConnection) {
        peerConnection = createPeerConnection();
    }

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signalingServer.send(JSON.stringify({ type: "offer", offer }));
};

// 6️⃣ 피어 연결 생성
function createPeerConnection() {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }] // STUN 서버
    });

    pc.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    pc.onicecandidate = event => {
        if (event.candidate) {
            signalingServer.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    return pc;
}
