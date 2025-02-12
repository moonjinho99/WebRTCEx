package com.example.webrtcex.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class SignalingHandler extends TextWebSocketHandler {

    private static final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException{
        String userId = session.getId();
        sessions.put(userId, session);
        log.info("사용자 접속 : {}", session.getId());

        for(String id : sessions.keySet()){
            if(!id.equals(userId)){
                sendMessage(id,"{\"type\":\"new_peer\", \"id\":\"" + userId + "\"}");
            }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        String senderId = session.getId();
        String payload = message.getPayload();

        log.info("메시지 수신 : "+payload);

        for(Map.Entry<String,WebSocketSession> entry : sessions.entrySet())
        {
            String receiverId = entry.getKey();
            WebSocketSession receiverSession = entry.getValue();

            if(receiverSession.isOpen() && !receiverId.equals(senderId)){
                receiverSession.sendMessage(new TextMessage(payload));
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        log.info("사용자 접속 해제 : {}", session.getId());
    }

    private void sendMessage(String userId, String message) throws IOException{
        WebSocketSession session = sessions.get(userId);
        if(session != null && session.isOpen()){
            session.sendMessage(new TextMessage(message));
        }
    }
}
