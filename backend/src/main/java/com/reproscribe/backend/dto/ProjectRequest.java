package com.reproscribe.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProjectRequest(
        @NotBlank @Size(min = 2, max = 200) String name,
        @Size(max = 64) String jiraProjectKey,
        @Size(max = 500) String adoOrgUrl,
        @Size(max = 200) String adoProject) {
}
