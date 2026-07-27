package com.reproscribe.backend.dto;

import com.reproscribe.backend.domain.enums.UserRole;
import java.util.UUID;

public record UserDto(UUID id, String name, String email, UserRole role) {
}
