package com.reproscribe.backend.web;

import com.reproscribe.backend.dto.CycleDto;
import com.reproscribe.backend.dto.ProjectDetailDto;
import com.reproscribe.backend.dto.ProjectDto;
import com.reproscribe.backend.dto.ProjectRequest;
import com.reproscribe.backend.dto.UserDto;
import com.reproscribe.backend.service.AppService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api")
public class CatalogController {

    private final AppService appService;

    public CatalogController(AppService appService) {
        this.appService = appService;
    }

    @GetMapping("/users")
    public List<UserDto> users() {
        return appService.listUsers();
    }

    @GetMapping("/projects")
    public List<ProjectDto> projects() {
        return appService.listProjects();
    }

    @GetMapping("/projects/{id}")
    public ProjectDetailDto project(@PathVariable UUID id) {
        return appService.getProject(id);
    }

    @PostMapping("/projects")
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectDto createProject(@Valid @RequestBody ProjectRequest request) {
        return appService.createProject(request);
    }

    @PutMapping("/projects/{id}")
    public ProjectDto updateProject(
            @PathVariable UUID id, @Valid @RequestBody ProjectRequest request) {
        return appService.updateProject(id, request);
    }

    @DeleteMapping("/projects/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteProject(@PathVariable UUID id) {
        appService.deleteProject(id);
    }

    @GetMapping("/cycles")
    public List<CycleDto> cycles(@RequestParam UUID projectId) {
        return appService.listCycles(projectId);
    }
}
