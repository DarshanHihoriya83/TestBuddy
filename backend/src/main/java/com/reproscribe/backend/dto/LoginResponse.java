package com.reproscribe.backend.dto;

public record LoginResponse(String token, UserDto user) {
}
