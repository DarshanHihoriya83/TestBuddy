package com.reproscribe.backend.web;

import com.reproscribe.backend.domain.User;
import com.reproscribe.backend.domain.enums.BugPriority;
import com.reproscribe.backend.domain.enums.BugSeverity;
import com.reproscribe.backend.domain.enums.BugStatus;
import com.reproscribe.backend.dto.BugCreateRequest;
import com.reproscribe.backend.dto.BugDto;
import com.reproscribe.backend.dto.BugExportResponse;
import com.reproscribe.backend.dto.BugImportRequest;
import com.reproscribe.backend.dto.BugImportResponse;
import com.reproscribe.backend.dto.BugUpdateRequest;
import com.reproscribe.backend.service.AppService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/bugs")
public class BugController {

    private final AppService appService;

    public BugController(AppService appService) {
        this.appService = appService;
    }

    @GetMapping
    public List<BugDto> list(
            @RequestParam(required = false) UUID projectId,
            @RequestParam(required = false) BugPriority priority,
            @RequestParam(required = false) BugSeverity severity,
            @RequestParam(required = false) UUID assigneeId,
            @RequestParam(required = false) UUID cycleId,
            @RequestParam(required = false) BugStatus status) {
        return appService.listBugs(projectId, priority, severity, assigneeId, cycleId, status);
    }

    @GetMapping("/export/json")
    public ResponseEntity<BugExportResponse> exportJson(
            @RequestParam(required = false) UUID projectId,
            @RequestParam(required = false) BugPriority priority,
            @RequestParam(required = false) BugSeverity severity,
            @RequestParam(required = false) UUID assigneeId,
            @RequestParam(required = false) UUID cycleId,
            @RequestParam(required = false) BugStatus status) {
        BugExportResponse body =
                appService.exportBugs(projectId, priority, severity, assigneeId, cycleId, status);
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"testbuddy-bugs-export.json\"")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    @GetMapping("/{id}/export/json")
    public ResponseEntity<BugExportResponse> exportOneJson(@PathVariable UUID id) {
        BugExportResponse body = appService.exportBug(id);
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"testbuddy-bug-" + id + ".json\"")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    @PostMapping("/import")
    public BugImportResponse importBugs(
            @Valid @RequestBody BugImportRequest request, @AuthenticationPrincipal User reporter) {
        return appService.importBugs(request, reporter);
    }

    @GetMapping("/{id}")
    public BugDto get(@PathVariable UUID id) {
        return appService.getBug(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BugDto create(
            @Valid @RequestBody BugCreateRequest request, @AuthenticationPrincipal User reporter) {
        return appService.createBug(request, reporter);
    }

    @PutMapping("/{id}")
    public BugDto update(@PathVariable UUID id, @Valid @RequestBody BugUpdateRequest request) {
        return appService.updateBug(id, request);
    }
}
