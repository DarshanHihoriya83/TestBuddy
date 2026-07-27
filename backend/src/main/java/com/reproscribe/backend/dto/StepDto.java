package com.reproscribe.backend.dto;

import com.reproscribe.backend.domain.enums.StepActionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record StepDto(
        int order,
        @NotNull StepActionType actionType,
        @NotBlank String elementLabel,
        String selector,
        String valueEntered,
        String pageUrl,
        @NotBlank String description,
        String expectedResult,
        String screenshotId) {
}
