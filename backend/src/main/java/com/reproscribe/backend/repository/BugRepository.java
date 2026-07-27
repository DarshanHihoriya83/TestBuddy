package com.reproscribe.backend.repository;

import com.reproscribe.backend.domain.Bug;
import com.reproscribe.backend.domain.enums.BugPriority;
import com.reproscribe.backend.domain.enums.BugSeverity;
import com.reproscribe.backend.domain.enums.BugStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BugRepository extends JpaRepository<Bug, UUID> {

    @Query("SELECT b FROM Bug b LEFT JOIN FETCH b.steps WHERE b.id = :id")
    Optional<Bug> findByIdWithSteps(@Param("id") UUID id);

    @Query("""
            SELECT DISTINCT b FROM Bug b
            LEFT JOIN FETCH b.steps
            WHERE (:projectId IS NULL OR b.projectId = :projectId)
              AND (:priority IS NULL OR b.priority = :priority)
              AND (:severity IS NULL OR b.severity = :severity)
              AND (:assigneeId IS NULL OR b.assigneeId = :assigneeId)
              AND (:cycleId IS NULL OR b.cycleId = :cycleId)
              AND (:status IS NULL OR b.status = :status)
            ORDER BY b.createdAt DESC
            """)
    List<Bug> findFiltered(
            @Param("projectId") UUID projectId,
            @Param("priority") BugPriority priority,
            @Param("severity") BugSeverity severity,
            @Param("assigneeId") UUID assigneeId,
            @Param("cycleId") UUID cycleId,
            @Param("status") BugStatus status);

    long countByProjectId(UUID projectId);
}
