package com.reproscribe.backend.dto;

public record ProjectDetailDto(
        java.util.UUID id,
        String name,
        String jiraProjectKey,
        String adoOrgUrl,
        String adoProject,
        long cycleCount,
        long bugCount) {
}
