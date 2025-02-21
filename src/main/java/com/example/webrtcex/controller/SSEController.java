package com.example.webrtcex.controller;


import com.example.webrtcex.domain.Notification;
import com.example.webrtcex.domain.NotificationType;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/sse")
public class SSEController {

    private final Map<String,Map<String, SseEmitter>> clients = new ConcurrentHashMap<>();

    @GetMapping(value = "/subscribe", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe(@RequestParam String userId, @RequestParam String clientId){
        SseEmitter emitter = new SseEmitter(60_000L);
        clients.putIfAbsent(userId, new ConcurrentHashMap<>());
        clients.get(userId).put(clientId, emitter);

        emitter.onCompletion(() -> removeClient(userId, clientId));
        emitter.onTimeout(() -> removeClient(userId, clientId));

        return emitter;
    }

    @PostMapping("/send")
    public void sendMessage(@RequestBody Map<String,Object> body){

        String userId = body.get("userId").toString();

        Notification notification = new Notification((NotificationType) body.get("type"), body.get("message").toString());

        Map<String, SseEmitter> userClients = clients.get(userId);

        if(userClients != null){
            userClients.forEach((clientId, emitter) ->{
                try{
                    emitter.send(SseEmitter.event().data(notification));
                } catch (IOException e){
                    emitter.complete();
                    removeClient(userId, clientId);
                }
            });
        }
    }

    private void removeClient(String userId, String clientId){
        Map<String, SseEmitter> userClients = clients.get(userId);
        if(userClients != null){
            userClients.remove(clientId);
            if(userClients.isEmpty()){
                clients.remove(userId);
            }
        }
    }
}
