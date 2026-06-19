package sgpo.entities;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import sgpo.enums.NodeType;

import java.time.LocalDateTime;

@Entity
@Table(name = "node")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Node {
    @Id
    private String id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NodeType type;

    @Column(unique = true, nullable = false)
    private String code;

    @Column(length = 500)
    private String nomFr;

    @Column(length = 200)
    private String nomAr;

    @Column(columnDefinition = "TEXT")
    private String description;

    private Integer dureeMois;

    private Double coutEstime;

    @Column(length = 100)
    private String secteur;

    @Column(length = 100)
    private String ville;

    private Double scoreIa = 0.0;

    private Boolean actif = true;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null || this.id.isBlank()) {
            this.id = java.util.UUID.randomUUID().toString();
        }
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
