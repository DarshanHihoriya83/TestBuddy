package com.reproscribe.backend.config;

import com.reproscribe.backend.domain.Cycle;
import com.reproscribe.backend.domain.Project;
import com.reproscribe.backend.domain.User;
import com.reproscribe.backend.domain.enums.UserRole;
import com.reproscribe.backend.repository.CycleRepository;
import com.reproscribe.backend.repository.ProjectRepository;
import com.reproscribe.backend.repository.UserRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final CycleRepository cycleRepository;
    private final PasswordEncoder passwordEncoder;

    public DataSeeder(
            UserRepository userRepository,
            ProjectRepository projectRepository,
            CycleRepository cycleRepository,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
        this.cycleRepository = cycleRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.count() > 0) {
            return;
        }

        seedUser("Admin User", "admin@testbuddy.local", UserRole.ADMIN);
        seedUser("Alice Tester", "alice@testbuddy.local", UserRole.TESTER);
        seedUser("Bob Developer", "bob@testbuddy.local", UserRole.DEVELOPER);
        seedUser("Carol Manager", "carol@testbuddy.local", UserRole.MANAGER);

        Project project = new Project();
        project.setName("Demo Project");
        project = projectRepository.save(project);

        Cycle cycle1 = new Cycle();
        cycle1.setProjectId(project.getId());
        cycle1.setName("Cycle 1");
        cycle1.setDefault(true);
        cycleRepository.save(cycle1);

        Cycle cycle2 = new Cycle();
        cycle2.setProjectId(project.getId());
        cycle2.setName("Cycle 2");
        cycle2.setDefault(false);
        cycleRepository.save(cycle2);
    }

    private void seedUser(String name, String email, UserRole role) {
        User user = new User();
        user.setName(name);
        user.setEmail(email);
        user.setRole(role);
        user.setPasswordHash(passwordEncoder.encode("password"));
        userRepository.save(user);
    }
}
