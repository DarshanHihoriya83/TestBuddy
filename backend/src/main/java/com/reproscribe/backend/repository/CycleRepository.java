package com.reproscribe.backend.repository;

import com.reproscribe.backend.domain.Cycle;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CycleRepository extends JpaRepository<Cycle, UUID> {
    List<Cycle> findByProjectIdOrderByNameAsc(UUID projectId);

    long countByProjectId(UUID projectId);

    void deleteByProjectId(UUID projectId);
}
