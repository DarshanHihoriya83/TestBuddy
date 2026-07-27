package com.reproscribe.backend.dto;

import java.time.Instant;
import java.util.List;

public record BugExportResponse(Instant exportedAt, int count, List<BugDto> bugs) {
}
