package com.reproscribe.backend.dto;

import com.reproscribe.backend.domain.enums.BugPriority;
import com.reproscribe.backend.domain.enums.BugSeverity;
import com.reproscribe.backend.domain.enums.BugStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record BugUpdateRequest(
        @NotBlank String title,
        @NotBlank String description,
        @NotNull BugPriority priority,
        @NotNull BugSeverity severity,
        @NotNull UUID assigneeId,
        @NotNull UUID cycleId,
        @NotNull UUID projectId,
        @NotNull BugStatus status,
        @Valid List<StepDto> steps) {
}
