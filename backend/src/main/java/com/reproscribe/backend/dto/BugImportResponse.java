package com.reproscribe.backend.dto;

import java.util.List;

public record BugImportResponse(int imported, List<BugDto> bugs) {
}
