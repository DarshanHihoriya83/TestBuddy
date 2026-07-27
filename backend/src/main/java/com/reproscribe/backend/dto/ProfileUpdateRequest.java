package com.reproscribe.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProfileUpdateRequest(
        @NotBlank @Size(min = 2, max = 120) String name,
        @Size(min = 8, max = 100) String currentPassword,
        @Size(min = 8, max = 100) String newPassword) {
}
