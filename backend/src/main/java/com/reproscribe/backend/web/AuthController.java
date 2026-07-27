package com.reproscribe.backend.web;

import com.reproscribe.backend.domain.User;
import com.reproscribe.backend.dto.LoginRequest;
import com.reproscribe.backend.dto.LoginResponse;
import com.reproscribe.backend.dto.ProfileUpdateRequest;
import com.reproscribe.backend.dto.RegisterRequest;
import com.reproscribe.backend.dto.UserDto;
import com.reproscribe.backend.service.AppService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final AppService appService;

    public AuthController(AppService appService) {
        this.appService = appService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "testbuddy-backend");
    }

    @PostMapping("/auth/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return appService.login(request);
    }

    @PostMapping("/auth/register")
    public LoginResponse register(@Valid @RequestBody RegisterRequest request) {
        return appService.register(request);
    }

    @GetMapping("/auth/me")
    public UserDto me(@AuthenticationPrincipal User user) {
        return appService.currentUser(user);
    }

    @PutMapping("/auth/profile")
    public UserDto updateProfile(
            @AuthenticationPrincipal User user, @Valid @RequestBody ProfileUpdateRequest request) {
        return appService.updateProfile(user, request);
    }
}
