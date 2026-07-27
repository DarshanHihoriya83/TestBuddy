package com.reproscribe.backend.dto;

import java.time.LocalDate;
import java.util.UUID;

public record CycleDto(
        UUID id,
        UUID projectId,
        String name,
        boolean isDefault,
        LocalDate startDate,
        LocalDate endDate) {
}
