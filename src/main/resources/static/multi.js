const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
//const signalingServer = new WebSocket("ws://localhost:8787/signaling"); // WebSocket 서버 주소
const signalingServer = new WebSocket("wss://tutor-tutee.shop/signaling");

let localStream;
let peerConnections = {};
let isBroadcaster = false;
let userId = `user_${Math.random().toString(36).substr(2, 9)}`; // 랜덤 userId 생성

// 1️⃣ 로컬 카메라 가져오기
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localVideo.srcObject = stream;
        localStream = stream;
    })
    .catch(error => console.error("Error accessing media devices.", error));

// 📌 화면 공유 함수 수정
function startScreenSharing() {
    navigator.mediaDevices.getDisplayMedia({ video: true })
        .then(screenStream => {
            localVideo.srcObject = screenStream;

            // 화면 공유 트랙을 Peer 연결에 추가
            Object.values(peerConnections).forEach(pc => {
                let videoTrack = screenStream.getVideoTracks()[0]; // 화면 공유 트랙
                let sender = pc.getSenders().find(s => s.track && s.track.kind === "video");

                if (sender) {
                    sender.replaceTrack(videoTrack); // 기존 트랙을 화면 공유 트랙으로 교체
                } else {
                    pc.addTrack(videoTrack, screenStream); // 새 트랙 추가
                }

                // 새로운 Offer 생성 및 WebSocket으로 전송
                pc.createOffer().then(async (offer) => {
                    await pc.setLocalDescription(offer);
                    signalingServer.send(JSON.stringify({ type: "offer", offer, userId }));
                });
            });

            localStream = screenStream;

            // 📌 화면 공유 종료 시 카메라로 복귀 및 기존 영상 갱신
            screenStream.getVideoTracks()[0].onended = () => {
                revertToCamera(); // 카메라 복귀
                updateRemoteVideos(); // 상대방 비디오 갱신
            };
        })
        .catch(error => console.error("Error sharing screen: ", error));
}

// 📌 화면 공유 종료 후 원래 카메라 복구 + A의 영상 다시 가져오기
function revertToCamera() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(cameraStream => {
            localVideo.srcObject = cameraStream;

            Object.values(peerConnections).forEach(pc => {
                let videoTrack = cameraStream.getVideoTracks()[0]; // 카메라 영상 트랙
                let sender = pc.getSenders().find(s => s.track && s.track.kind === "video");

                if (sender) {
                    sender.replaceTrack(videoTrack); // 기존 트랙을 카메라 트랙으로 교체
                } else {
                    pc.addTrack(videoTrack, cameraStream); // 새 트랙 추가
                }

                pc.createOffer().then(async (offer) => {
                    await pc.setLocalDescription(offer);
                    signalingServer.send(JSON.stringify({ type: "offer", offer, userId }));
                });
            });

            localStream = cameraStream;

            // 화면 공유 종료 후 원래 비디오 화면을 다시 가져오기
            updateRemoteVideos(); // 상대방 비디오를 다시 갱신
        })
        .catch(error => console.error("Error reverting to camera: ", error));
}

// 📌 B가 화면 공유를 종료하면 A의 화면을 다시 받을 수 있도록 보장
function updateRemoteVideos() {
    Object.values(peerConnections).forEach(pc => {
        // 상대방에게 새로운 offer 전송 (상대방 화면을 갱신하도록 유도)
        pc.createOffer().then(async (offer) => {
            await pc.setLocalDescription(offer);
            signalingServer.send(JSON.stringify({ type: "offer", offer, userId }));
        });
    });
}

// 3️⃣ ICE 후보 전송 (userId 포함)
function onIceCandidate(event, userId) {
    if (event.candidate) {
        signalingServer.send(JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
            userId: userId
        }));
    }
}

// 4️⃣ 상대방 트랙을 remoteVideo에 추가
function onTrack(event) {
    console.log("📡 상대방의 영상 수신 확인");
    remoteVideo.srcObject = event.streams[0];
}

// 5️⃣ WebSocket 메시지 처리 (SDP 및 ICE 후보 수신)
signalingServer.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "offer") {
        await handleOffer(message);
    } else if (message.type === "answer") {
        await handleAnswer(message);
    } else if (message.type === "candidate") {
        await handleCandidate(message);
    } else if (message.type === "new_peer") {
        handleNewPeer(message);
    }
};

// 6️⃣ WebSocket 연결 후 새로운 사용자 브로드캐스트
signalingServer.onopen = async () => {
    isBroadcaster = true;

    // 새로운 피어 접속을 모든 사용자에게 알림
    signalingServer.send(JSON.stringify({ type: "new_peer", id: userId }));
};

// 7️⃣ 피어 연결 생성 (ICE 후보 전송 및 트랙 추가 포함)
function createPeerConnection(userId) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pc.onicecandidate = (event) => onIceCandidate(event, userId);
    pc.ontrack = onTrack;

    // 기존 localStream이 존재하면 트랙 추가
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    return pc;
}

// 8️⃣ Offer 처리 (새로운 사용자 연결 시)
async function handleOffer(message) {
    const senderId = message.userId;
    const peerConnection = createPeerConnection(senderId);

    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    signalingServer.send(JSON.stringify({ type: "answer", answer, userId: senderId }));
    peerConnections[senderId] = peerConnection;
}

// 9️⃣ Answer 처리 (Peer 연결 완료)
async function handleAnswer(message) {
    const senderId = message.userId;
    const peerConnection = peerConnections[senderId];

    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
    }
}

// 🔟 ICE 후보 처리
async function handleCandidate(message) {
    const senderId = message.userId;
    const peerConnection = peerConnections[senderId];

    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
}

// 1️⃣1️⃣ 새로운 사용자 접속 처리 (브로드캐스트 방식으로 변경)
function handleNewPeer(message) {
    const newUserId = message.id;
    if (!peerConnections[newUserId]) {
        const peerConnection = createPeerConnection(newUserId);
        peerConnections[newUserId] = peerConnection;

        // Offer 전송 (새로운 사용자와 연결 시작)
        peerConnection.createOffer().then(async (offer) => {
            await peerConnection.setLocalDescription(offer);
            signalingServer.send(JSON.stringify({ type: "offer", offer, userId: newUserId }));
        });
    }
}