package com.reproscribe.backend.domain;

import com.reproscribe.backend.domain.enums.StepActionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "bug_steps")
@Getter
@Setter
@NoArgsConstructor
public class BugStep {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "step_order", nullable = false)
    private int stepOrder;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StepActionType actionType;

    @Column(nullable = false)
    private String elementLabel;

    @Column(nullable = false)
    private String selector = "";

    private String valueEntered;

    @Column(nullable = false)
    private String pageUrl = "";

    @Column(nullable = false, length = 2000)
    private String description;

    @Column(length = 2000)
    private String expectedResult;

    private String screenshotId;
}
