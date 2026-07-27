package com.reproscribe.backend.dto;

import com.reproscribe.backend.domain.enums.BugPriority;
import com.reproscribe.backend.domain.enums.BugSeverity;
import com.reproscribe.backend.domain.enums.BugStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record BugDto(
        UUID id,
        String title,
        String description,
        BugPriority priority,
        BugSeverity severity,
        UUID assigneeId,
        UUID reporterId,
        UUID cycleId,
        UUID projectId,
        BugStatus status,
        List<StepDto> steps,
        ExternalRefsDto externalRefs,
        Instant createdAt,
        Instant updatedAt) {

    public record ExternalRefsDto(String jiraIssueKey, String adoWorkItemId) {
    }
}
