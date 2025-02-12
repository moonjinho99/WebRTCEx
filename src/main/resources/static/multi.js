const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const signalingServer = new WebSocket("wss://localhost:8888/signaling"); // WebSocket 서버 주소

let localStream;
let peerConnections = {};
let isBroadcaster = false;

// 1️⃣ 로컬 카메라 가져오기
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localVideo.srcObject = stream;
        localStream = stream;
        // 화면 공유 트랙 추가
        localStream.getTracks().forEach(track => {
            Object.values(peerConnections).forEach(pc => pc.addTrack(track, localStream));
        });
    })
    .catch(error => console.error("Error accessing media devices.", error));

// 2️⃣ 화면 공유 기능
function startScreenSharing() {
    navigator.mediaDevices.getDisplayMedia({ video: true })
        .then(stream => {
            localVideo.srcObject = stream;
            localStream.getTracks().forEach(track => {
                Object.values(peerConnections).forEach(pc => pc.addTrack(track, localStream));
            });
        })
        .catch(error => console.error("Error sharing screen: ", error));
}

// 3️⃣ WebRTC에서 ICE 후보(연결 정보)를 감지하면 WebSocket으로 전송
function onIceCandidate(event) {
    if (event.candidate) {
        signalingServer.send(JSON.stringify({
            type: "candidate",
            candidate: event.candidate
        }));
    }
}

// 4️⃣ 상대방 트랙을 받아서 remoteVideo에 추가
function onTrack(event) {
    remoteVideo.srcObject = event.streams[0];
}

// 5️⃣ WebSocket 메시지 처리 (SDP 및 ICE 후보 수신)
signalingServer.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "offer") {
        // 상대방이 offer를 보낸 경우
        await handleOffer(message);
    } else if (message.type === "answer") {
        // 상대방이 answer를 보낸 경우
        await handleAnswer(message);
    } else if (message.type === "candidate") {
        // 상대방이 ICE 후보를 보낸 경우
        await handleCandidate(message);
    } else if (message.type === "new_peer") {
        // 새로운 사용자 접속
        handleNewPeer(message);
    }
};

// 6️⃣ WebSocket 연결 후 WebRTC Offer 전송 (초기 연결 설정)
signalingServer.onopen = async () => {
    isBroadcaster = true;
    const offer = await createOffer();
    signalingServer.send(JSON.stringify({ type: "offer", offer }));
};

// 7️⃣ 피어 연결 생성
function createPeerConnection(userId) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }] // STUN 서버
    });

    pc.onicecandidate = onIceCandidate;
    pc.ontrack = onTrack;

    return pc;
}

// 8️⃣ Offer를 처리하는 함수
async function handleOffer(message) {
    const userId = message.userId;
    const peerConnection = createPeerConnection(userId);

    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    signalingServer.send(JSON.stringify({ type: "answer", answer, userId }));
    peerConnections[userId] = peerConnection;
}

// 9️⃣ Answer를 처리하는 함수
async function handleAnswer(message) {
    const userId = message.userId;
    const peerConnection = peerConnections[userId];

    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
    }
}

// 🔟 ICE 후보를 처리하는 함수
async function handleCandidate(message) {
    const userId = message.userId;
    const peerConnection = peerConnections[userId];

    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
}

// 1️⃣1️⃣ 새로운 사용자 접속 처리
function handleNewPeer(message) {
    const userId = message.id;
    if (!peerConnections[userId]) {
        const peerConnection = createPeerConnection(userId);
        peerConnections[userId] = peerConnection;

        // Offer 전송
        peerConnection.createOffer().then(async (offer) => {
            await peerConnection.setLocalDescription(offer);
            signalingServer.send(JSON.stringify({ type: "offer", offer, userId }));
        });
    }
}
