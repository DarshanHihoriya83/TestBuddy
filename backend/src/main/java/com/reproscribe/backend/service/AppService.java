package com.reproscribe.backend.service;

import com.reproscribe.backend.domain.Bug;
import com.reproscribe.backend.domain.BugStep;
import com.reproscribe.backend.domain.User;
import com.reproscribe.backend.dto.BugCreateRequest;
import com.reproscribe.backend.dto.BugDto;
import com.reproscribe.backend.dto.BugExportResponse;
import com.reproscribe.backend.dto.BugImportRequest;
import com.reproscribe.backend.dto.BugImportResponse;
import com.reproscribe.backend.dto.BugUpdateRequest;
import com.reproscribe.backend.dto.CycleDto;
import com.reproscribe.backend.dto.LoginRequest;
import com.reproscribe.backend.dto.LoginResponse;
import com.reproscribe.backend.dto.ProfileUpdateRequest;
import com.reproscribe.backend.dto.ProjectDetailDto;
import com.reproscribe.backend.dto.ProjectDto;
import com.reproscribe.backend.dto.ProjectRequest;
import com.reproscribe.backend.dto.RegisterRequest;
import com.reproscribe.backend.domain.enums.UserRole;
import com.reproscribe.backend.dto.StepDto;
import com.reproscribe.backend.dto.UserDto;
import com.reproscribe.backend.domain.Cycle;
import com.reproscribe.backend.domain.Project;
import com.reproscribe.backend.domain.enums.BugPriority;
import com.reproscribe.backend.domain.enums.BugSeverity;
import com.reproscribe.backend.domain.enums.BugStatus;
import com.reproscribe.backend.repository.BugRepository;
import com.reproscribe.backend.repository.CycleRepository;
import com.reproscribe.backend.repository.ProjectRepository;
import com.reproscribe.backend.repository.UserRepository;
import com.reproscribe.backend.security.JwtService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AppService {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final CycleRepository cycleRepository;
    private final BugRepository bugRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AppService(
            UserRepository userRepository,
            ProjectRepository projectRepository,
            CycleRepository cycleRepository,
            BugRepository bugRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService) {
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
        this.cycleRepository = cycleRepository;
        this.bugRepository = bugRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        User user = userRepository
                .findByEmailIgnoreCase(request.email())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        String token = jwtService.generateToken(user.getId(), user.getEmail());
        return new LoginResponse(token, toUserDto(user));
    }

    @Transactional
    public LoginResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(request.role() != null ? request.role() : UserRole.TESTER);
        user = userRepository.save(user);
        String token = jwtService.generateToken(user.getId(), user.getEmail());
        return new LoginResponse(token, toUserDto(user));
    }

    public UserDto currentUser(User user) {
        return toUserDto(user);
    }

    @Transactional
    public UserDto updateProfile(User current, ProfileUpdateRequest request) {
        boolean changingPassword =
                request.newPassword() != null && !request.newPassword().isBlank();
        if (changingPassword) {
            if (request.currentPassword() == null || request.currentPassword().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is required");
            }
            if (!passwordEncoder.matches(request.currentPassword(), current.getPasswordHash())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect");
            }
            current.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        }
        current.setName(request.name().trim());
        return toUserDto(userRepository.save(current));
    }

    public List<UserDto> listUsers() {
        return userRepository.findAll().stream().map(this::toUserDto).toList();
    }

    public List<ProjectDto> listProjects() {
        return projectRepository.findAll().stream()
                .map(this::toProjectDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public ProjectDetailDto getProject(UUID id) {
        Project project = requireProject(id);
        return new ProjectDetailDto(
                project.getId(),
                project.getName(),
                project.getJiraProjectKey(),
                project.getAdoOrgUrl(),
                project.getAdoProject(),
                cycleRepository.countByProjectId(id),
                bugRepository.countByProjectId(id));
    }

    @Transactional
    public ProjectDto createProject(ProjectRequest request) {
        Project project = new Project();
        applyProjectFields(project, request);
        project = projectRepository.save(project);

        Cycle cycle1 = new Cycle();
        cycle1.setProjectId(project.getId());
        cycle1.setName("Cycle 1");
        cycle1.setDefault(true);
        cycleRepository.save(cycle1);

        return toProjectDto(project);
    }

    @Transactional
    public ProjectDto updateProject(UUID id, ProjectRequest request) {
        Project project = requireProject(id);
        applyProjectFields(project, request);
        return toProjectDto(projectRepository.save(project));
    }

    @Transactional
    public void deleteProject(UUID id) {
        requireProject(id);
        long bugs = bugRepository.countByProjectId(id);
        if (bugs > 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Cannot delete project with " + bugs + " bug(s). Move or delete bugs first.");
        }
        cycleRepository.deleteByProjectId(id);
        projectRepository.deleteById(id);
    }

    public List<CycleDto> listCycles(UUID projectId) {
        return cycleRepository.findByProjectIdOrderByNameAsc(projectId).stream()
                .map(c -> new CycleDto(
                        c.getId(),
                        c.getProjectId(),
                        c.getName(),
                        c.isDefault(),
                        c.getStartDate(),
                        c.getEndDate()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BugDto> listBugs(
            UUID projectId,
            BugPriority priority,
            BugSeverity severity,
            UUID assigneeId,
            UUID cycleId,
            BugStatus status) {
        return bugRepository
                .findFiltered(projectId, priority, severity, assigneeId, cycleId, status)
                .stream()
                .map(this::toBugDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public BugExportResponse exportBugs(
            UUID projectId,
            BugPriority priority,
            BugSeverity severity,
            UUID assigneeId,
            UUID cycleId,
            BugStatus status) {
        List<BugDto> bugs = listBugs(projectId, priority, severity, assigneeId, cycleId, status);
        return new BugExportResponse(Instant.now(), bugs.size(), bugs);
    }

    @Transactional(readOnly = true)
    public BugExportResponse exportBug(UUID id) {
        BugDto bug = getBug(id);
        return new BugExportResponse(Instant.now(), 1, List.of(bug));
    }

    @Transactional
    public BugImportResponse importBugs(BugImportRequest request, User reporter) {
        List<BugDto> imported = new java.util.ArrayList<>();
        for (BugCreateRequest bugRequest : request.bugs()) {
            imported.add(createBug(bugRequest, reporter));
        }
        return new BugImportResponse(imported.size(), imported);
    }

    @Transactional(readOnly = true)
    public BugDto getBug(UUID id) {
        return toBugDto(requireBug(id));
    }

    @Transactional
    public BugDto createBug(BugCreateRequest request, User reporter) {
        validateRefs(request.projectId(), request.cycleId(), request.assigneeId());
        Bug bug = new Bug();
        bug.setTitle(request.title());
        bug.setDescription(request.description());
        bug.setPriority(request.priority());
        bug.setSeverity(request.severity());
        bug.setAssigneeId(request.assigneeId());
        bug.setReporterId(reporter.getId());
        bug.setCycleId(request.cycleId());
        bug.setProjectId(request.projectId());
        bug.setStatus(request.status() != null ? request.status() : BugStatus.NEW);
        applySteps(bug, request.steps());
        return toBugDto(bugRepository.save(bug));
    }

    @Transactional
    public BugDto updateBug(UUID id, BugUpdateRequest request) {
        Bug bug = requireBug(id);
        validateRefs(request.projectId(), request.cycleId(), request.assigneeId());
        bug.setTitle(request.title());
        bug.setDescription(request.description());
        bug.setPriority(request.priority());
        bug.setSeverity(request.severity());
        bug.setAssigneeId(request.assigneeId());
        bug.setCycleId(request.cycleId());
        bug.setProjectId(request.projectId());
        bug.setStatus(request.status());
        applySteps(bug, request.steps());
        return toBugDto(bugRepository.save(bug));
    }

    private void applySteps(Bug bug, List<StepDto> steps) {
        bug.getSteps().clear();
        if (steps == null) {
            return;
        }
        for (StepDto step : steps) {
            BugStep entity = new BugStep();
            entity.setStepOrder(step.order());
            entity.setActionType(step.actionType());
            entity.setElementLabel(step.elementLabel());
            entity.setSelector(step.selector() != null ? step.selector() : "");
            entity.setValueEntered(step.valueEntered());
            entity.setPageUrl(step.pageUrl() != null ? step.pageUrl() : "");
            entity.setDescription(step.description());
            entity.setExpectedResult(step.expectedResult());
            entity.setScreenshotId(step.screenshotId());
            bug.getSteps().add(entity);
        }
    }

    private void validateRefs(UUID projectId, UUID cycleId, UUID assigneeId) {
        if (!projectRepository.existsById(projectId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown projectId");
        }
        var cycle = cycleRepository
                .findById(cycleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown cycleId"));
        if (!cycle.getProjectId().equals(projectId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cycleId does not belong to projectId");
        }
        if (!userRepository.existsById(assigneeId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown assigneeId");
        }
    }

    private Bug requireBug(UUID id) {
        return bugRepository
                .findByIdWithSteps(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bug not found"));
    }

    private Project requireProject(UUID id) {
        return projectRepository
                .findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
    }

    private void applyProjectFields(Project project, ProjectRequest request) {
        project.setName(request.name().trim());
        project.setJiraProjectKey(blankToNull(request.jiraProjectKey()));
        project.setAdoOrgUrl(blankToNull(request.adoOrgUrl()));
        project.setAdoProject(blankToNull(request.adoProject()));
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private ProjectDto toProjectDto(Project project) {
        return new ProjectDto(
                project.getId(),
                project.getName(),
                project.getJiraProjectKey(),
                project.getAdoOrgUrl(),
                project.getAdoProject());
    }

    private UserDto toUserDto(User user) {
        return new UserDto(user.getId(), user.getName(), user.getEmail(), user.getRole());
    }

    private BugDto toBugDto(Bug bug) {
        List<StepDto> steps = bug.getSteps().stream()
                .map(s -> new StepDto(
                        s.getStepOrder(),
                        s.getActionType(),
                        s.getElementLabel(),
                        s.getSelector(),
                        s.getValueEntered(),
                        s.getPageUrl(),
                        s.getDescription(),
                        s.getExpectedResult(),
                        s.getScreenshotId()))
                .toList();
        return new BugDto(
                bug.getId(),
                bug.getTitle(),
                bug.getDescription(),
                bug.getPriority(),
                bug.getSeverity(),
                bug.getAssigneeId(),
                bug.getReporterId(),
                bug.getCycleId(),
                bug.getProjectId(),
                bug.getStatus(),
                steps,
                new BugDto.ExternalRefsDto(bug.getJiraIssueKey(), bug.getAdoWorkItemId()),
                bug.getCreatedAt(),
                bug.getUpdatedAt());
    }
}
