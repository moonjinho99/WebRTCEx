package com.example.webrtcex.domain;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

@Getter
@AllArgsConstructor
public class Notification {

    private NotificationType type;
    private String message;

}
