package com.reproscribe.backend.dto;

import java.util.UUID;

public record ProjectDto(
        UUID id,
        String name,
        String jiraProjectKey,
        String adoOrgUrl,
        String adoProject) {
}
