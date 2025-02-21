package com.example.webrtcex.controller;


import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Slf4j
@Controller
public class RtcController {

    //1대1
    @GetMapping("/")
    public String page()
    {
        return "index";
    }

    //다대다
    @GetMapping("/multi")
    public String multi()
    {
        return "multi";
    }

    @GetMapping("/ssePage")
    public String ssePage()
    {
        return "ssePage";
    }

}
